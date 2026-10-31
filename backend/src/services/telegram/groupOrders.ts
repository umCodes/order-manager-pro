import { redisClient } from "../../config/redis.js"
import { TELEGRAM_GROUP_CHATID } from "../../constants/env.js"
import type { ItemWithQuantity } from "../zoho/types.js"
import { INTERNAL_ITEM_MARKER } from "../../utils/internalLineItems.js"
import { fromTelegramAmount, telegramAmount } from "../../utils/quantity.js"
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
    /** When this line last changed (an edit that leaves it as it was keeps it); older reports have none — use the report's. */
    updated_at?: string
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
 * and the reports behind it — in the item's own unit (`unit`, as on the
 * invoice: a box stays a box), though preparers report in what the Telegram
 * message shows (kg).
 */
export type OrderShortageItem = {
    number: number
    item_id: string
    item_key: string
    description: string
    unit: string
    ordered: number
    available: number
    /** 0 once the report was applied to the invoice in the app (see applied), until a newer report or message about the item. */
    short: number
    /** When someone in the app set the invoice to the reported amount, and to what. */
    applied: AppliedReport | null
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
/**
 * Reports applied to the invoice in the app: someone chose to set an item's
 * quantity to what the preparers reported available (or remove a missing
 * one). Recorded per order and item, so the item stops counting as short —
 * until a newer report or message about it. Kept 30 days.
 *
 *   telegram:group-applied:<order id> → hash of item key → AppliedReport (JSON)
 */
export type AppliedReport = { at: string; quantity: number; unit: string }
const appliedKey = (orderId: string) => `telegram:group-applied:${orderId}`

async function readAppliedReports(orderId: string): Promise<Record<string, AppliedReport>> {
    const stored = await redisClient.hGetAll(appliedKey(orderId))
    return Object.fromEntries(Object.entries(stored ?? {}).map(([key, raw]) => [key, JSON.parse(raw) as AppliedReport]))
}

export async function recordAppliedReport(orderId: string, itemKey: string, quantity: number, unit: string) {
    const record: AppliedReport = { at: new Date().toISOString(), quantity, unit }
    await redisClient.hSet(appliedKey(orderId), itemKey, JSON.stringify(record))
    await redisClient.expire(appliedKey(orderId), KEEP_SECONDS)
    return record
}

export async function orderShortages(orderId: string): Promise<{ order_id: string; items: OrderShortageItem[] }> {
    const { items } = await shortagesAndMessages(orderId)
    return { order_id: orderId, items }
}

async function shortagesAndMessages(orderId: string): Promise<{ items: OrderShortageItem[]; current: GroupOrderMessage[] }> {
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

    const applied = await readAppliedReports(orderId)

    // The latest report line per (message replied to, item number).
    const latest = new Map<string, { report: GroupReport; line: GroupReportLine }>()
    for (const report of reports) {
        for (const line of report.lines) latest.set(`${report.reply_to_message_id}:${line.number}`, { report, line })
    }

    // Everything in what the Telegram message shows: kg, or a count for a pack.
    const tg = (quantity: number, unit: string) => telegramAmount(quantity, unit).amount
    const lineAmount = (line: GroupReportLine, quantity: number) => (line.tg_unit ? quantity : tg(quantity, line.unit))

    const items = new Map<string, OrderShortageItem & { supply: number; changed_at: string }>()
    for (const message of current) {
        for (const item of message.items) {
            const entry = items.get(item.item_key) ?? {
                number: item.number,
                item_id: item.item_id,
                item_key: item.item_key,
                description: item.description,
                unit: item.unit,
                ordered: 0,
                available: 0,
                short: 0,
                applied: null,
                reports: [],
                supply: 0,
                changed_at: "",
            }
            if (message.posted_at > entry.changed_at) entry.changed_at = message.posted_at
            entry.ordered = tg(item.change ? (item.order_quantity ?? 0) : item.quantity, item.unit)
            if (item.change !== "decreased" && item.change !== "removed") {
                const reported = latest.get(`${message.message_id}:${item.number}`)
                entry.supply += reported ? lineAmount(reported.line, reported.line.available) : tg(item.quantity, item.unit)
                if (reported) {
                    const lineChangedAt = reported.line.updated_at ?? reported.report.updated_at
                    if (lineChangedAt > entry.changed_at) entry.changed_at = lineChangedAt
                    entry.reports.push({
                        message_id: reported.report.message_id,
                        reply_to_message_id: message.message_id,
                        from: reported.report.from,
                        sent_at: reported.report.sent_at,
                        updated_at: reported.report.updated_at,
                        edited: reported.report.history.length > 0,
                        line: reported.line.text,
                        ordered: fromTelegramAmount(lineAmount(reported.line, reported.line.ordered), item.unit),
                        available: fromTelegramAmount(lineAmount(reported.line, reported.line.available), item.unit),
                        missing: reported.line.missing,
                    })
                }
            }
            items.set(item.item_key, entry)
        }
    }

    return {
        current,
        items: [...items.values()]
            .filter((item) => item.reports.length > 0)
            // Worked out in Telegram amounts, shown in the item's own unit.
            .map(({ supply, changed_at, ...item }) => {
                // Applied after the item's latest report or message: the invoice already matches what's there.
                const appliedNow = applied[item.item_key]
                const isApplied = !!appliedNow && appliedNow.at > changed_at
                return {
                    ...item,
                    ordered: round(fromTelegramAmount(item.ordered, item.unit)),
                    available: round(fromTelegramAmount(Math.min(item.ordered, supply), item.unit)),
                    short: isApplied ? 0 : round(fromTelegramAmount(Math.max(0, item.ordered - supply), item.unit)),
                    applied: isApplied ? appliedNow : null,
                }
            })
            .sort((a, b) => a.number - b.number),
    }
}

/**
 * 👍 on order messages in the group, as the webhook Lambda saves them from
 * reaction updates (wa-webhook-lambda/state/groupOrders.mjs; change both
 * together): per order message, who has a 👍 on it now and since when.
 *
 *   telegram:group-thumbs:<group message id> → hash of reactor id → { name, at } (JSON)
 */
export type Thumb = { name: string; at: string }

async function thumbsOn(messageId: number): Promise<Thumb[]> {
    const stored = await redisClient.hGetAll(`telegram:group-thumbs:${messageId}`)
    return Object.values(stored ?? {}).map((raw) => JSON.parse(raw) as Thumb)
}

/**
 * Where an order's preparation stands:
 *   not_reported  no 👍 yet — on the newest full message, and on every
 *                 changes reply after it that adds to the order (a reply
 *                 that only lowers or removes needs none)
 *   ready         👍 on all of those, and nothing short
 *   partial       👍 on all of those, with one or more items short
 * `confirmed` is the latest 👍 that completed it (null while not reported).
 */
export type PreparationStatus = "not_reported" | "ready" | "partial"
export type OrderPreparation = {
    order_id: string
    status: PreparationStatus
    confirmed: Thumb | null
    items: OrderShortageItem[]
}

export async function orderPreparation(orderId: string): Promise<OrderPreparation> {
    const { items, current } = await shortagesAndMessages(orderId)
    const toConfirm = current.filter(
        (message) => message.message_type === "order" || message.items.some((item) => item.change === "added" || item.change === "increased"),
    )
    const thumbs = await Promise.all(toConfirm.map((message) => thumbsOn(message.message_id)))
    const confirmed = toConfirm.length > 0 && thumbs.every((list) => list.length > 0)
    const latest = confirmed
        ? thumbs.map((list) => list.reduce((a, b) => (a.at > b.at ? a : b))).reduce((a, b) => (a.at > b.at ? a : b))
        : null
    return {
        order_id: orderId,
        status: !confirmed ? "not_reported" : items.some((item) => item.short > 0) ? "partial" : "ready",
        confirmed: latest,
        items,
    }
}
