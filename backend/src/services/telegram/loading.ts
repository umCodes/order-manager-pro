import { redisClient } from "../../config/redis.js"
import { TELEGRAM_GROUP_CHATID } from "../../constants/env.js"
import { telegramQuantity } from "../../utils/quantity.js"
import { TelegramApi } from "./client.js"
import { currentOrderMessages, orderPreparation, readGroupOrderMessage, type GroupOrderMessage } from "./groupOrders.js"
import { circledNumber } from "./invoices/itemNumbers.js"
import { groupCopyText } from "./mirror.js"

/**
 * Loading: the driver confirms in the app what was put on the truck for an
 * order, item by item, from the Items tab. Saved in Redis and shown on the order's messages in the
 * group, and nowhere else: Zoho and the channel are never touched, and the
 * preparers' own status (👍, reports, reactions) stays as it is.
 *
 * On each of the order's current group messages (the newest full message
 * and the changes replies after it), every line asking for a confirmed item
 * is marked: struck through when it was all received, otherwise followed by
 * what was received with 🟡 (some) or 🔴 (none). Items not confirmed yet are
 * left as they are. Once every item is confirmed, "🚚 ተጭኗል" goes at the very
 * bottom. Clearing an item takes its marks off.
 *
 *   telegram:group-loaded:<order id>  → OrderLoading (JSON), 30 days
 *   telegram:group-loading-log        → sorted set of LoadingEvent (JSON) by time, 30 days — for the daily report
 */

export const LOADED_NOTICE_AMHARIC = "🚚 ተጭኗል"
const PARTIAL_ICON = "🟡"
const MISSING_ICON = "🔴"

export type LoadedItem = {
    number: number
    item_key: string
    item_id: string
    description: string
    /** The item's own unit, as on the invoice (a box stays a box). */
    unit: string
    /** What the order asks for now, what the preparers reported available, and what the driver received. */
    ordered: number
    reported: number
    received: number
}

export type LoadingMode = "as_reported" | "checked"

export type OrderLoading = {
    order_id: string
    order_number: string
    kind: GroupOrderMessage["kind"]
    mode: LoadingMode
    at: string
    /** Set when the loading was changed after it was first confirmed. */
    first_at: string
    /** The items confirmed so far (only those). */
    items: LoadedItem[]
}

export type LoadingEvent = {
    action: "loaded" | "changed" | "undone" | "item"
    at: string
    order_id: string
    order_number: string
    kind: GroupOrderMessage["kind"]
    mode?: LoadingMode
    items?: LoadedItem[]
    /** For an "item" event: the item, and what was received (null: cleared). */
    item_key?: string
    received?: number | null
}

/** An item of the order as it stands now, for the driver to check against. */
export type LoadingItem = Omit<LoadedItem, "received">

const KEEP_SECONDS = 30 * 24 * 60 * 60
const LOG_KEY = "telegram:group-loading-log"
const loadedKey = (orderId: string) => `telegram:group-loaded:${orderId}`
const round = (quantity: number) => Math.round(quantity * 1000) / 1000

export async function readOrderLoading(orderId: string): Promise<OrderLoading | null> {
    const raw = await redisClient.get(loadedKey(orderId))
    return raw ? (JSON.parse(raw) as OrderLoading) : null
}

/**
 * The order's items as its group messages show them now (its latest
 * quantity, in the item's own unit), with what the preparers reported
 * available — the whole quantity where nothing was reported short.
 */
export async function orderLoadingItems(orderId: string): Promise<{ messages: GroupOrderMessage[]; items: LoadingItem[] }> {
    const [messages, preparation] = await Promise.all([currentOrderMessages(orderId), orderPreparation(orderId)])
    const items = new Map<string, LoadingItem>()
    for (const message of messages) {
        for (const item of message.items) {
            const ordered = item.change ? (item.order_quantity ?? 0) : item.quantity
            items.set(item.item_key, {
                number: item.number,
                item_key: item.item_key,
                item_id: item.item_id,
                description: item.description,
                unit: item.unit,
                ordered: round(ordered),
                reported: round(ordered),
            })
        }
    }
    for (const shortage of preparation.items) {
        const item = items.get(shortage.item_key)
        if (item) item.reported = round(Math.min(item.ordered, shortage.available))
    }
    return {
        messages,
        items: [...items.values()].filter((item) => item.ordered > 0).sort((a, b) => a.number - b.number),
    }
}

/** The order's current items, its loading if confirmed, and what changed on the order since. */
export async function orderLoadingView(orderId: string) {
    const [{ items }, loading] = await Promise.all([orderLoadingItems(orderId), readOrderLoading(orderId)])
    const loadedByKey = new Map((loading?.items ?? []).map((item) => [item.item_key, item]))
    // Items added, raised or lowered on the order after it was loaded (its new messages carry no marks).
    const changed_since = loading
        ? items.filter((item) => loadedByKey.get(item.item_key)?.ordered !== item.ordered).map((item) => item.item_key)
        : []
    const complete = !!loading && items.every((item) => loadedByKey.has(item.item_key))
    return { order_id: orderId, items, loading, changed_since, complete }
}

/** Whether every item the order asks for now has been confirmed. */
function isComplete(items: LoadingItem[], loading: OrderLoading) {
    const loaded = new Set(loading.items.map((item) => item.item_key))
    return items.length > 0 && items.every((item) => loaded.has(item.item_key))
}

type Entity = { type: "strikethrough"; offset: number; length: number }

/**
 * A group message's text with the loading marks: each line asking for a
 * loaded item struck through (all received) or followed by what was received
 * and 🟡/🔴, and "🚚 ተጭኗል" at the very bottom. Offsets are in UTF-16 code
 * units, as Telegram counts them (and as JavaScript strings index).
 */
export function markedText(
    text: string,
    message: GroupOrderMessage,
    loading: OrderLoading,
    complete = true,
): { text: string; entities: Entity[] } {
    const loaded = new Map(loading.items.map((item) => [item.item_key, item]))
    // The numbered lines that ask for an item (a changes reply's lowered or removed lines don't).
    const prefixes = message.items
        .filter((item) => item.change !== "decreased" && item.change !== "removed" && loaded.has(item.item_key))
        .map((item) => ({ prefix: `${circledNumber(item.number)} `, item: loaded.get(item.item_key)! }))

    const entities: Entity[] = []
    const lines: string[] = []
    let offset = 0
    for (const line of text.split("\n")) {
        const match = prefixes.find(({ prefix }) => line.startsWith(prefix))
        let out = line
        if (match) {
            const { item } = match
            if (item.received >= item.ordered) {
                if (line.length > 0) entities.push({ type: "strikethrough", offset, length: line.length })
            } else {
                const amount = item.received > 0 ? telegramQuantity(item.received, item.unit, item.description) : "0"
                out = `${line} ➜ ${item.received > 0 ? PARTIAL_ICON : MISSING_ICON} ${amount}`
            }
        }
        lines.push(out)
        offset += out.length + 1
    }
    return { text: complete ? `${lines.join("\n")}\n\n${LOADED_NOTICE_AMHARIC}` : lines.join("\n"), entities }
}

/** For the group copy `groupMessageId` about to be set to `text`: the text and marks to send, given its order's loading. */
export async function loadingMarksFor(groupMessageId: number, text: string): Promise<{ text: string; entities: Entity[] }> {
    try {
        const message = await readGroupOrderMessage(groupMessageId)
        const loading = message ? await readOrderLoading(message.order_id) : null
        if (!message || !loading) return { text, entities: [] }
        const { items } = await orderLoadingItems(message.order_id)
        return markedText(text, message, loading, isComplete(items, loading))
    } catch (error) {
        console.error(`Telegram loading: couldn't read the marks for group message ${groupMessageId}:`, error)
        return { text, entities: [] }
    }
}

/**
 * Redraws an order's current group messages with (or, once undone, without)
 * its loading marks. Best-effort per message; says how many were edited and
 * which failed.
 */
async function redrawGroupMessages(messages: GroupOrderMessage[], loading: OrderLoading | null, complete = true) {
    const failed: { message_id: number; error: string }[] = []
    let edited = 0
    for (const message of messages) {
        try {
            const text = await groupCopyText(message.message_id)
            if (text === null) throw new Error("its text isn't known any more")
            const marked = loading ? markedText(text, message, loading, complete) : { text, entities: [] }
            const response = await TelegramApi("editMessageText", "POST", {
                chat_id: TELEGRAM_GROUP_CHATID,
                message_id: message.message_id,
                text: marked.text,
                ...(marked.entities.length ? { entities: marked.entities } : {}),
            })
            if (!response.ok && !/not modified/i.test(String(response.description ?? ""))) {
                throw new Error(response.description ?? "Telegram refused the edit")
            }
            edited++
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            console.error(`Telegram loading: couldn't edit group message ${message.message_id}:`, reason)
            failed.push({ message_id: message.message_id, error: reason })
        }
    }
    return { edited, failed }
}

async function logEvent(event: LoadingEvent) {
    const now = Date.now()
    await redisClient.zAdd(LOG_KEY, { score: now, value: JSON.stringify(event) })
    await redisClient.zRemRangeByScore(LOG_KEY, 0, now - KEEP_SECONDS * 1000)
}

/**
 * Confirms items of one order at once: what was received of each (its whole
 * order quantity for "complete", less — 0 for missing — otherwise), or null
 * to clear it, by item key. Saves, then redraws the order's group messages
 * once. Items no longer on the order are skipped.
 */
export async function setItemsLoading(orderId: string, changes: Record<string, number | null>) {
    if (!TELEGRAM_GROUP_CHATID) throw new Error("No Telegram group is set")
    for (const received of Object.values(changes)) {
        if (received !== null && (typeof received !== "number" || !Number.isFinite(received) || received < 0)) {
            throw new Error("received must be 0 or more, or null")
        }
    }
    const { messages, items } = await orderLoadingItems(orderId)
    if (messages.length === 0) throw new Error("This order has no message in the Telegram group")
    const first = messages[0]!

    const previous = await readOrderLoading(orderId)
    const now = new Date().toISOString()
    const loaded = new Map(
        (previous?.items ?? []).filter((item) => items.some((i) => i.item_key === item.item_key)).map((item) => [item.item_key, item]),
    )
    for (const [itemKey, received] of Object.entries(changes)) {
        const item = items.find((candidate) => candidate.item_key === itemKey)
        if (!item) continue
        if (received === null) loaded.delete(itemKey)
        else loaded.set(itemKey, { ...item, received: round(received) })
        await logEvent({ action: "item", at: now, order_id: orderId, order_number: first.order_number, kind: first.kind, item_key: itemKey, received })
    }
    const loadedItems = [...loaded.values()].sort((a, b) => a.number - b.number)

    let loading: OrderLoading | null = null
    if (loadedItems.length === 0) {
        await redisClient.del(loadedKey(orderId))
    } else {
        loading = {
            order_id: orderId,
            order_number: first.order_number,
            kind: first.kind,
            mode: "checked",
            at: now,
            first_at: previous?.first_at ?? now,
            items: loadedItems,
        }
        await redisClient.set(loadedKey(orderId), JSON.stringify(loading), { EX: KEEP_SECONDS })
    }
    const telegram = await redrawGroupMessages(messages, loading, loading ? isComplete(items, loading) : false)
    return { loading, telegram }
}
