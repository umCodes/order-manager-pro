import { redisClient } from "../../config/redis.js"
import { TELEGRAM_GROUP_CHATID } from "../../constants/env.js"
import type { ItemWithQuantity } from "../zoho/types.js"
import { INTERNAL_ITEM_MARKER } from "../../utils/internalLineItems.js"
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
