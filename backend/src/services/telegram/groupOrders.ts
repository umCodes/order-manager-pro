import { redisClient } from "../../config/redis.js"
import { TELEGRAM_GROUP_CHATID } from "../../constants/env.js"
import type { ItemWithQuantity } from "../zoho/types.js"
import { INTERNAL_ITEM_MARKER } from "../../utils/internalLineItems.js"
import { telegramAmount } from "../../utils/quantity.js"
import type { ItemKeyOf, ItemNumbers } from "./invoices/itemNumbers.js"

/**
 * Which order each message in the preparers' group is, and the numbered
 * items it shows — so a preparer's reply to that message (handled by the
 * webhook Lambda) can be tied to the order and to the Zoho items behind its
 * numbers. Saved when the app posts an order, a changes reply or a backup
 * list; kept 30 days, like the invoice's thread. Only the group is covered:
 * the channel's workflow doesn't use any of this.
 *
 *   telegram:group-order:<group message id> → GroupOrderMessage (JSON)
 *   telegram:group-order-messages:<order id> → its group message ids, oldest first
 *
 * The Lambda reads the same keys (wa-webhook-lambda/state/groupOrders.mjs),
 * so the shape is shared: change both together.
 */

export type GroupOrderItem = {
    /** The item's number on the order (①, ②, … as 1, 2, …). */
    number: number
    /** The Zoho item; empty for a line without one. */
    item_id: string
    /** How the order tells this item apart (see itemKeyFor): the Zoho item id, plus the description for a general item. */
    item_key: string
    description: string
    unit: string
    /** What this message shows for the item: the full quantity, or how much a changes reply adds or takes away. */
    quantity: number
    /** On a changes reply only: what happened to the item, and how much of it the order has now. */
    change?: "added" | "increased" | "decreased" | "removed"
    order_quantity?: number
}

export type GroupOrderMessage = {
    chat_id: string
    message_id: number
    /** An invoice, or a backup list (items only, BK- id). */
    kind: "invoice" | "backup_list"
    /** The Zoho invoice id, or the BK- id. */
    order_id: string
    /** INV-…, or the BK- id again. */
    order_number: string
    /** "order" for the full list, "changes" for a reply listing what changed. */
    message_type: "order" | "changes"
    items: GroupOrderItem[]
    posted_at: string
}

const KEEP_SECONDS = 30 * 24 * 60 * 60
const groupOrderKey = (groupMessageId: number) => `telegram:group-order:${groupMessageId}`
const orderMessagesKey = (orderId: string) => `telegram:group-order-messages:${orderId}`

const visible = (line_items: ItemWithQuantity[]) =>
    line_items.filter((item) => !String(item.description ?? "").includes(INTERNAL_ITEM_MARKER))

const round = (quantity: number) => Math.round(quantity * 1000) / 1000

/** Quantities summed per item, as the message shows them (an item over two lines is one numbered item). */
function totals(line_items: ItemWithQuantity[], keyOf: ItemKeyOf) {
    const byKey = new Map<string, ItemWithQuantity>()
    for (const item of visible(line_items)) {
        const key = keyOf(item)
        const existing = byKey.get(key)
        byKey.set(key, existing ? { ...existing, quantity: Number(existing.quantity) + Number(item.quantity) } : { ...item, quantity: Number(item.quantity) })
    }
    return byKey
}

function itemFor(item: ItemWithQuantity, key: string, numbers: ItemNumbers, quantity: number): GroupOrderItem | null {
    const number = numbers.get(key)
    if (!number) return null
    return {
        number,
        item_id: String(item.item_id ?? ""),
        item_key: key,
        description: String(item.description ?? ""),
        unit: String(item.unit ?? ""),
        quantity: round(quantity),
    }
}

/** The numbered items of a full order message, as it lists them. */
export function orderMessageItems(line_items: ItemWithQuantity[], numbers: ItemNumbers, keyOf: ItemKeyOf): GroupOrderItem[] {
    return [...totals(line_items, keyOf)]
        .map(([key, item]) => itemFor(item, key, numbers, item.quantity))
        .filter((item): item is GroupOrderItem => !!item)
}

/** The numbered items of a changes reply: only the ones it lists, with what changed (as invoiceChangesMessageText decides). */
export function changesMessageItems(
    previous_line_items: ItemWithQuantity[],
    line_items: ItemWithQuantity[],
    numbers: ItemNumbers,
    keyOf: ItemKeyOf,
): GroupOrderItem[] {
    const before = totals(previous_line_items, keyOf)
    const after = totals(line_items, keyOf)
    const items: GroupOrderItem[] = []
    for (const [key, item] of after) {
        const previous = before.get(key)?.quantity ?? 0
        const delta = round(item.quantity - previous)
        if (delta === 0) continue
        const entry = itemFor(item, key, numbers, Math.abs(delta))
        if (entry) items.push({ ...entry, change: !before.has(key) ? "added" : delta > 0 ? "increased" : "decreased", order_quantity: round(item.quantity) })
    }
    for (const [key, item] of before) {
        if (after.has(key)) continue
        const entry = itemFor(item, key, numbers, item.quantity)
        if (entry) items.push({ ...entry, change: "removed", order_quantity: 0 })
    }
    return items
}

/**
 * Saves which order a group message is. A no-op when the message has no
 * group copy (no group set, or the copy failed). Best-effort: a failure is
 * logged, never thrown, so posting the order is never undone by it.
 */
export async function saveGroupOrderMessage(
    groupMessageId: number | null | undefined,
    details: Omit<GroupOrderMessage, "chat_id" | "message_id" | "posted_at">,
) {
    if (!groupMessageId || !TELEGRAM_GROUP_CHATID) return
    try {
        const record: GroupOrderMessage = {
            chat_id: String(TELEGRAM_GROUP_CHATID),
            message_id: groupMessageId,
            ...details,
            posted_at: new Date().toISOString(),
        }
        await redisClient.set(groupOrderKey(groupMessageId), JSON.stringify(record), { EX: KEEP_SECONDS })
        await redisClient.rPush(orderMessagesKey(details.order_id), String(groupMessageId))
        await redisClient.expire(orderMessagesKey(details.order_id), KEEP_SECONDS)
    } catch (error) {
        console.error(`Telegram group: couldn't save which order message ${groupMessageId} is:`, error)
    }
}

export async function readGroupOrderMessage(groupMessageId: number): Promise<GroupOrderMessage | null> {
    const raw = await redisClient.get(groupOrderKey(groupMessageId))
    return raw ? (JSON.parse(raw) as GroupOrderMessage) : null
}

/** Forgets a group message's order, once the message is deleted. */
export async function forgetGroupOrderMessage(groupMessageId: number) {
    await redisClient.del(groupOrderKey(groupMessageId))
}

/**
 * Replies the webhook Lambda recognised as replies to an order message,
 * newest first (it keeps the latest 200 for a week) — for checking the
 * links work before shortage reports are read from them.
 */
export async function listRecognisedGroupReplies(): Promise<unknown[]> {
    return (await redisClient.lRange("telegram:group-replies:recent", 0, -1)).map((entry) => JSON.parse(entry))
}

/**
 * Shortage reports, as the webhook Lambda saves them from replies in the
 * group (wa-webhook-lambda/telegram/shortageReports.mjs; change both
 * together): one record per report message, holding its current item lines
 * and every earlier version.
 *
 *   telegram:group-report:<report message id> → GroupReport (JSON)
 *   telegram:group-reports:<order id>         → set of report message ids
 */
export type GroupReportLine = {
    number: number
    item_id: string
    item_key: string
    description: string
    unit: string
    /**
     * The quantity on the message replied to, and what's available of it —
     * as the Telegram message counts it, in `tg_unit` (kg, or a count for a
     * pack). Reports saved before Telegram amounts were used have no
     * `tg_unit`: theirs are in the item's Zoho unit.
     */
    ordered: number
    available: number
    tg_unit?: "kg" | "pcs"
    missing: boolean
    /** The line as typed: "3 M", "3 5". */
    text: string
}

export type GroupReport = {
    chat_id: string
    message_id: number
    reply_to_message_id: number
    kind: GroupOrderMessage["kind"]
    order_id: string
    order_number: string
    from: { id: number | null; name: string; username: string | null }
    sent_at: string
    updated_at: string
    text: string
    lines: GroupReportLine[]
    history: { text: string; lines: GroupReportLine[]; updated_at: string }[]
}

/**
 * One reported item on an order: what the order needs now, what's available,
 * and the reports behind it — all as the Telegram message counts it, in
 * `unit`: kg, or "pcs" for a pack.
 */
export type OrderShortageItem = {
    number: number
    item_id: string
    item_key: string
    description: string
    unit: "kg" | "pcs"
    ordered: number
    available: number
    short: number
    reports: {
        message_id: number
        reply_to_message_id: number
        from: GroupReport["from"]
        sent_at: string
        updated_at: string
        edited: boolean
        line: string
        /** The quantity on the message it replied to, and what was reported available of it. */
        ordered: number
        available: number
        missing: boolean
    }[]
}

async function readJson<T>(keys: string[]): Promise<T[]> {
    if (keys.length === 0) return []
    return (await redisClient.mGet(keys)).filter((raw): raw is string => !!raw).map((raw) => JSON.parse(raw) as T)
}

/**
 * An order's shortages, worked out from its group messages and the reports
 * on them. Only the newest full message counts, with the changes replies
 * after it (an order sent again starts over). For each item the order now
 * needs its latest quantity; what's available is the sum, over that message
 * and the replies that add to it, of what was reported — or the full amount
 * where nothing was. A report replying to the same message about the same
 * item as an earlier one replaces it. Only items with a report are listed;
 * an item whose report no longer leaves it short is listed with short 0.
 */
export async function orderShortages(orderId: string): Promise<{ order_id: string; items: OrderShortageItem[] }> {
    const reportIds = await redisClient.sMembers(`telegram:group-reports:${orderId}`)
    const allReports = await readJson<GroupReport>(reportIds.map((id) => `telegram:group-report:${id}`))

    // Orders posted before the list of their messages was kept: the messages reported on.
    const listed = await redisClient.lRange(orderMessagesKey(orderId), 0, -1)
    const ids = [...new Set(listed.length ? listed.map(Number) : allReports.map((report) => report.reply_to_message_id))]
    const messages = (await readJson<GroupOrderMessage>(ids.map(groupOrderKey)))
        .sort((a, b) => a.posted_at.localeCompare(b.posted_at))
    const lastFull = messages.map((message) => message.message_type).lastIndexOf("order")
    const current = lastFull === -1 ? messages : messages.slice(lastFull)
    const currentIds = new Set(current.map((message) => message.message_id))

    const reports = allReports
        .filter((report) => currentIds.has(report.reply_to_message_id))
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at))

    // The latest report line per (message replied to, item number).
    const latest = new Map<string, { report: GroupReport; line: GroupReportLine }>()
    for (const report of reports) {
        for (const line of report.lines) latest.set(`${report.reply_to_message_id}:${line.number}`, { report, line })
    }

    // Everything in what the Telegram message shows: kg, or a count for a pack.
    const tg = (quantity: number, unit: string) => telegramAmount(quantity, unit).amount
    const lineAmount = (line: GroupReportLine, quantity: number) => (line.tg_unit ? quantity : tg(quantity, line.unit))

    const items = new Map<string, OrderShortageItem & { supply: number }>()
    for (const message of current) {
        for (const item of message.items) {
            const entry = items.get(item.item_key) ?? {
                number: item.number,
                item_id: item.item_id,
                item_key: item.item_key,
                description: item.description,
                unit: telegramAmount(0, item.unit).unit,
                ordered: 0,
                available: 0,
                short: 0,
                reports: [],
                supply: 0,
            }
            entry.ordered = tg(item.change ? (item.order_quantity ?? 0) : item.quantity, item.unit)
            if (item.change !== "decreased" && item.change !== "removed") {
                const reported = latest.get(`${message.message_id}:${item.number}`)
                entry.supply += reported ? lineAmount(reported.line, reported.line.available) : tg(item.quantity, item.unit)
                if (reported) {
                    entry.reports.push({
                        message_id: reported.report.message_id,
                        reply_to_message_id: message.message_id,
                        from: reported.report.from,
                        sent_at: reported.report.sent_at,
                        updated_at: reported.report.updated_at,
                        edited: reported.report.history.length > 0,
                        line: reported.line.text,
                        ordered: lineAmount(reported.line, reported.line.ordered),
                        available: lineAmount(reported.line, reported.line.available),
                        missing: reported.line.missing,
                    })
                }
            }
            items.set(item.item_key, entry)
        }
    }

    return {
        order_id: orderId,
        items: [...items.values()]
            .filter((item) => item.reports.length > 0)
            .map(({ supply, ...item }) => ({
                ...item,
                ordered: round(item.ordered),
                available: round(Math.min(item.ordered, supply)),
                short: round(Math.max(0, item.ordered - supply)),
            }))
            .sort((a, b) => a.number - b.number),
    }
}
