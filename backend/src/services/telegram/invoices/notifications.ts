import type { ItemWithQuantity } from "../../zoho/types.js"
import { TelegramSendMessage, TelegramEditMessage, TelegramReplyToMessage, TelegramDeleteMessage } from "../messages.js"
import { findLoggedTelegramMessage } from "../log.js"
import { LEGACY_ROUTE, routeForNewOrder, type InvoiceRoute } from "../destinations.js"
import { redisClient } from "../../../config/redis.js"
import {
    HAS_CHANGES_BELOW_NOTICE_AMHARIC,
    invoiceChangesMessageText,
    invoiceMessageText,
    movedToDayNotice,
} from "./messageText.js"
import { itemKeyFor, numberItems, type ItemNumbers } from "./itemNumbers.js"
import { getGeneralItemIds } from "../../generalItems.js"
import { forgetSentGeneralItems } from "../../generalItemsWhatsApp.js"
import { changesMessageItems, orderMessageItems, saveGroupOrderMessage } from "../groupOrders.js"
import { heldInvoice, holdInvoiceMessage, isLaterDay, releaseHeldInvoice, type HeldInvoice } from "./schedule.js"

/** How this order's items are told apart: general items by their description too (see itemKeyFor). */
const orderItemKeys = async () => itemKeyFor(await getGeneralItemIds())

/**
 * Each invoice's item numbers (see itemNumbers.ts), as a hash of item key →
 * number, kept as long as its channel thread. An invoice without one was
 * posted before numbering, so changes to it aren't numbered either.
 */
const numbersKey = (invoiceId: string) => `telegram:invoice-numbers:${invoiceId}`

async function readItemNumbers(invoiceId: string): Promise<ItemNumbers | null> {
    const stored = await redisClient.hGetAll(numbersKey(invoiceId))
    const entries = Object.entries(stored ?? {})
    return entries.length ? new Map(entries.map(([key, number]) => [key, Number(number)])) : null
}

async function saveItemNumbers(invoiceId: string, numbers: ItemNumbers) {
    if (numbers.size === 0) return
    await redisClient.hSet(numbersKey(invoiceId), Object.fromEntries([...numbers].map(([key, number]) => [key, String(number)])))
    await redisClient.expire(numbersKey(invoiceId), THREAD_TTL_SECONDS)
}

/**
 * Where an invoice's thread lives (see destinations.ts): the chat it was
 * posted to and whether it's copied to the group, kept as long as the
 * thread. An invoice posted before this was kept is on the channel, copied.
 */
const routeKey = (invoiceId: string) => `telegram:invoice-route:${invoiceId}`

export async function readRoute(invoiceId: string): Promise<InvoiceRoute> {
    const raw = await redisClient.get(routeKey(invoiceId))
    if (!raw) return LEGACY_ROUTE
    try {
        return JSON.parse(raw) as InvoiceRoute
    } catch {
        return LEGACY_ROUTE
    }
}

/**
 * Posts an invoice as a brand-new message, its items numbered: the numbers
 * the invoice already has, the next free ones for the rest (all of them, for
 * a new invoice). It goes where Settings says (channel and/or group, see
 * destinations.ts), or along `route` to stay in an existing thread's chat.
 * Stores the message as the invoice's current one, with its route. Returns
 * null, posting nothing, when Settings has both the channel and the group off.
 */
export async function sendInvoiceTelegramMessage(invoice: any, line_items: ItemWithQuantity[], route?: InvoiceRoute) {
    try {
        const invoiceId = String(invoice.invoice_id)
        const to = route ?? (await routeForNewOrder())
        if (!to) {
            console.log(`Telegram: channel and group are both off in Settings, invoice ${invoice.invoice_number ?? invoiceId} not posted`)
            return null
        }
        console.log("Sending a fresh telegram message")
        const keyOf = await orderItemKeys()
        const numbers = numberItems(line_items, await readItemNumbers(invoiceId), keyOf)
        const message = await TelegramSendMessage(invoiceMessageText(invoice, line_items, undefined, numbers, keyOf), to.chatId, { mirror: to.mirror });
        await redisClient.set(invoiceId, String(message.message_id))
        await redisClient.set(routeKey(invoiceId), JSON.stringify(to), { EX: THREAD_TTL_SECONDS })
        await saveItemNumbers(invoiceId, numbers)
        await saveGroupOrderMessage(message.group_message_id, {
            kind: "invoice",
            order_id: invoiceId,
            order_number: String(invoice.invoice_number ?? ""),
            message_type: "order",
            items: orderMessageItems(line_items, numbers, keyOf),
        })
        return message;
    } catch (error) {
        console.error('Error sending invoice message:', error);
        throw error;
    }
}

/**
 * Every earlier message in an invoice's channel thread — the ones its current
 * message (the id stored under the invoice id) replied to. They stay in the
 * channel as the record of what was already prepared, so they're tracked
 * here to be edited along with the current one and cleaned up with it.
 */
const threadKey = (invoiceId: string) => `telegram:invoice-thread:${invoiceId}`
const THREAD_TTL_SECONDS = 30 * 24 * 60 * 60

async function earlierThreadMessageIds(invoiceId: string) {
    return (await redisClient.lRange(threadKey(invoiceId), 0, -1)).map(Number)
}

async function addToThread(invoiceId: string, messageId: number) {
    await redisClient.rPush(threadKey(invoiceId), String(messageId))
    await redisClient.expire(threadKey(invoiceId), THREAD_TTL_SECONDS)
}

/** A logged message's current text, or null once it's aged out of the log. */
async function loggedText(messageId: number, chatId: string) {
    return (await findLoggedTelegramMessage(messageId, chatId))?.text ?? null
}

/**
 * Posts what changed on an invoice as a reply to its current message — new
 * items and quantity changes only, never the whole order again — and marks
 * that previous message as changed, leaving its contents untouched, so the
 * preparers add to what they already prepared rather than doing it twice.
 * Returns null when the visible items didn't change (nothing is posted).
 * Falls back to a fresh full message if the reply fails; a failed mark is
 * logged but not fatal.
 */
export async function replyWithInvoiceChangesTelegramMessage(
    invoice: any,
    previous_line_items: ItemWithQuantity[],
    line_items: ItemWithQuantity[],
    messageId: number,
) {
    const invoiceId = String(invoice.invoice_id)
    // Items keep their numbers; one added now takes the next free one.
    const keyOf = await orderItemKeys()
    const existingNumbers = await readItemNumbers(invoiceId)
    const numbers = existingNumbers ? numberItems(line_items, existingNumbers, keyOf) : null

    const text = invoiceChangesMessageText(invoice, previous_line_items, line_items, numbers, keyOf)
    if (!text) return null

    let message;
    // Replies stay in the thread's own chat, whatever Settings says now.
    const route = await readRoute(invoiceId)

    try {
        message = await TelegramReplyToMessage(text, messageId, route.chatId, { mirror: route.mirror });
    } catch (error) {
        console.error('Error replying to previous invoice message, sending a new one instead:', error);
        return await sendInvoiceTelegramMessage(invoice, line_items, route);
    }

    if (numbers) {
        await saveItemNumbers(invoiceId, numbers)
        await saveGroupOrderMessage(message.group_message_id, {
            kind: "invoice",
            order_id: invoiceId,
            order_number: String(invoice.invoice_number ?? ""),
            message_type: "changes",
            items: changesMessageItems(previous_line_items, line_items, numbers, keyOf),
        })
    }

    await addToThread(invoiceId, messageId)

    try {
        const previousText = await loggedText(messageId, route.chatId)
        if (previousText && !previousText.endsWith(`\n\n${HAS_CHANGES_BELOW_NOTICE_AMHARIC}`)) {
            await TelegramEditMessage(`${previousText}\n\n${HAS_CHANGES_BELOW_NOTICE_AMHARIC}`, messageId, route.chatId)
        }
    } catch (error) {
        console.error('Error marking previous invoice message as changed:', error);
    }

    return message;
}

/**
 * Posts an invoice's message now, or holds it for its day when it's dated a
 * later day (see schedule.ts). Stores the posted message's id under the
 * invoice id, as every posted invoice has. Returns the hold, or null when
 * it was posted.
 */
export async function postOrHoldInvoiceTelegramMessage(invoice: any, line_items: ItemWithQuantity[]): Promise<HeldInvoice | null> {
    const invoiceId = String(invoice.invoice_id)
    if (isLaterDay(invoice.date)) return holdInvoiceMessage(invoice)
    await releaseHeldInvoice(invoiceId)
    await sendInvoiceTelegramMessage(invoice, line_items)
    return null
}

/** Bots can delete their messages for 48 hours; older ones are marked as moved instead (an hour's margin). */
const DELETABLE_FOR_MS = 47 * 60 * 60 * 1000

/**
 * Takes down an invoice's posted thread because it moved to `newDate`: each
 * message is deleted (channel and group), or — once too old to delete — has
 * "❌ moved to <day>" added. Its message id, thread and item numbers are
 * forgotten either way, so the next post starts afresh. Its general items
 * on WhatsApp are forgotten as sent too, so they go out again for the new
 * day (see generalItemsWhatsApp.ts). Best-effort.
 */
export async function retireInvoiceTelegramThread(invoiceId: string, newDate: string) {
    try {
        await forgetSentGeneralItems(invoiceId)
        const messageId = await redisClient.get(invoiceId)
        const ids = [...(messageId ? [Number(messageId)] : []), ...(await earlierThreadMessageIds(invoiceId))]
        if (ids.length === 0) return
        const { chatId } = await readRoute(invoiceId)
        for (const id of ids) {
            const entry = await findLoggedTelegramMessage(id, chatId)
            if (entry && Date.now() - entry.created_at > DELETABLE_FOR_MS) {
                try {
                    const notice = movedToDayNotice(newDate)
                    if (!entry.text.endsWith(notice)) await TelegramEditMessage(`${entry.text}\n\n${notice}`, id, chatId)
                } catch (error) {
                    console.error(`Error marking old invoice message ${id} as moved:`, error)
                }
            } else {
                await TelegramDeleteMessage(id, chatId)
            }
        }
        await redisClient.del([invoiceId, threadKey(invoiceId), numbersKey(invoiceId), routeKey(invoiceId)])
    } catch (error) {
        console.error(`Error taking down invoice ${invoiceId}'s messages after it moved:`, error)
    }
}

/**
 * Removes an invoice's channel thread — its current message and every earlier
 * one it replied to — once it's no longer pending fulfillment (marked as sent,
 * or paid); a no-op if it never had one. The invoice's message ids and log
 * entries are forgotten even when Telegram refuses the delete, so a stale
 * message never lingers in the app. Best-effort: a
 * failure is logged, not thrown, since the invoice's own state change in Zoho
 * is what actually matters. A message still held for a later day is cancelled.
 */
export async function deleteInvoiceTelegramMessage(invoiceId: string) {
    try {
        // One still held for a later day is simply never posted.
        await releaseHeldInvoice(invoiceId)
        const messageId = await redisClient.get(invoiceId)
        const earlierIds = await earlierThreadMessageIds(invoiceId)
        if (!messageId && earlierIds.length === 0) return

        const { chatId } = await readRoute(invoiceId)
        for (const id of [...(messageId ? [Number(messageId)] : []), ...earlierIds]) {
            await TelegramDeleteMessage(id, chatId)
        }
        await redisClient.del([invoiceId, threadKey(invoiceId), numbersKey(invoiceId), routeKey(invoiceId)])
    } catch (error) {
        console.error('Error deleting invoice message after it left draft:', error);
    }
}

const CLEANUP_LOCK_KEY = "telegram:invoice-cleanup"
const CLEANUP_EVERY_SECONDS = 10 * 60

/**
 * Catches invoices that left draft outside the app — voided, sent, paid or
 * deleted in Zoho itself — whose Telegram messages (channel and group) would
 * otherwise stay up: every invoice still holding item numbers (that is,
 * posted and not cleaned up) that isn't among `draftIds` is looked up in
 * Zoho, and its thread is deleted unless it's still a draft. Runs at most
 * once every CLEANUP_EVERY_SECONDS; best-effort, errors are logged. A lookup
 * that fails for any reason but "doesn't exist" leaves the invoice for the
 * next run.
 */
export async function cleanUpLeftoverInvoiceMessages(
    draftIds: Set<string>,
    statusOf: (invoiceId: string) => Promise<string | null>,
) {
    try {
        if (!(await redisClient.set(CLEANUP_LOCK_KEY, "1", { NX: true, EX: CLEANUP_EVERY_SECONDS }))) return
        const prefix = numbersKey("")
        const leftovers: string[] = []
        for await (const batch of redisClient.scanIterator({ MATCH: `${prefix}*`, COUNT: 200 })) {
            for (const key of Array.isArray(batch) ? batch : [batch]) {
                const invoiceId = String(key).slice(prefix.length)
                if (invoiceId && !draftIds.has(invoiceId)) leftovers.push(invoiceId)
            }
        }
        for (const invoiceId of leftovers) {
            let status: string | null
            try {
                status = await statusOf(invoiceId)
            } catch (error: any) {
                if (!/does not exist|not found/i.test(String(error?.message ?? ""))) continue
                status = null
            }
            if (status === "draft") continue
            console.log(`Telegram: invoice ${invoiceId} is ${status ?? "gone"} in Zoho, removing its messages`)
            await deleteInvoiceTelegramMessage(invoiceId)
            await redisClient.del(numbersKey(invoiceId))
        }
    } catch (error) {
        console.error("Telegram: couldn't clean up messages of invoices no longer in draft", error)
    }
}

/**
 * Where an invoice's Telegram message stands, for the app's badges:
 * "scheduled" (held for a later day, posted at `due_at`), "sent" (posted;
 * `sent_at` is when its current message went out, when still in the log),
 * or null (never posted: no date yet sent, Telegram skipped, or both chats
 * turned off).
 */
export type InvoiceTelegramState =
    | { state: "scheduled"; date: string; due_at: number }
    | { state: "sent"; sent_at: number | null }
    | null

export async function invoiceTelegramState(invoiceId: string): Promise<InvoiceTelegramState> {
    const held = await heldInvoice(invoiceId)
    if (held) return { state: "scheduled", date: held.date, due_at: held.due_at }
    const messageId = await redisClient.get(invoiceId)
    if (!messageId) return null
    const { chatId } = await readRoute(invoiceId)
    const entry = await findLoggedTelegramMessage(Number(messageId), chatId)
    return { state: "sent", sent_at: entry?.created_at ?? null }
}
