import type { ItemWithQuantity } from "../../zoho/types.js"
import { TelegramSendMessage, TelegramEditMessage, TelegramReplyToMessage, TelegramDeleteMessage } from "../messages.js"
import { listTelegramMessages } from "../log.js"
import { redisClient } from "../../../config/redis.js"
import {
    EDITED_NOTICE_AMHARIC,
    HAS_CHANGES_BELOW_NOTICE_AMHARIC,
    invoiceChangesMessageText,
    invoiceMessageText,
    withDayLine,
} from "./messageText.js"
import { numberItems, type ItemNumbers } from "./itemNumbers.js"

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
 * Posts an invoice to the fulfillment channel as a brand-new message, its
 * items numbered: the numbers the invoice already has, the next free ones
 * for the rest (all of them, for a new invoice).
 */
export async function sendInvoiceTelegramMessage(invoice: any, line_items: ItemWithQuantity[]) {
    try {
        console.log("Sending a fresh telegram message")
        const invoiceId = String(invoice.invoice_id)
        const numbers = numberItems(line_items, await readItemNumbers(invoiceId))
        const message = await TelegramSendMessage(invoiceMessageText(invoice, line_items, undefined, numbers));
        await saveItemNumbers(invoiceId, numbers)
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
async function loggedText(messageId: number) {
    return (await listTelegramMessages()).find((entry) => entry.message_id === messageId)?.text ?? null
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
    const existingNumbers = await readItemNumbers(invoiceId)
    const numbers = existingNumbers ? numberItems(line_items, existingNumbers) : null

    const text = invoiceChangesMessageText(invoice, previous_line_items, line_items, numbers)
    if (!text) return null

    let message;

    try {
        message = await TelegramReplyToMessage(text, messageId);
    } catch (error) {
        console.error('Error replying to previous invoice message, sending a new one instead:', error);
        return await sendInvoiceTelegramMessage(invoice, line_items);
    }

    if (numbers) await saveItemNumbers(invoiceId, numbers)

    await addToThread(invoiceId, messageId)

    try {
        const previousText = await loggedText(messageId)
        if (previousText && !previousText.endsWith(`\n\n${HAS_CHANGES_BELOW_NOTICE_AMHARIC}`)) {
            await TelegramEditMessage(`${previousText}\n\n${HAS_CHANGES_BELOW_NOTICE_AMHARIC}`, messageId)
        }
    } catch (error) {
        console.error('Error marking previous invoice message as changed:', error);
    }

    return message;
}

/**
 * Moves an invoice's channel thread to its new day: the day line on every
 * message in the thread is swapped in place, then an "edited" notice is
 * replied to the current one so the team sees it moved. The rest of each
 * message is left as posted. Returns `edited: false` when there was no
 * message to edit (or editing failed) and a fresh one was sent instead —
 * the caller then stores the new message id.
 */
export async function updateInvoiceDateTelegramMessage(
    invoice: any,
    line_items: ItemWithQuantity[],
    messageId: number | null,
) {
    if (!messageId) {
        return { message: await sendInvoiceTelegramMessage(invoice, line_items), edited: false };
    }

    try {
        const currentText = await loggedText(messageId)
        const text = currentText
            ? withDayLine(currentText, invoice)
            : invoiceMessageText(invoice, line_items, undefined, await readItemNumbers(String(invoice.invoice_id)))
        const message = text === currentText ? null : await TelegramEditMessage(text, messageId);
        await TelegramReplyToMessage(EDITED_NOTICE_AMHARIC, messageId);
        await moveEarlierThreadMessagesToNewDay(invoice)
        return { message, edited: true };
    } catch (error) {
        console.error('Error editing invoice message, resending as a new message:', error);
        return { message: await sendInvoiceTelegramMessage(invoice, line_items), edited: false };
    }
}

/** Best-effort: swaps the day line on the thread's earlier messages that are still in the log. */
async function moveEarlierThreadMessagesToNewDay(invoice: any) {
    for (const messageId of await earlierThreadMessageIds(String(invoice.invoice_id))) {
        try {
            const text = await loggedText(messageId)
            if (!text) continue
            const moved = withDayLine(text, invoice)
            if (moved !== text) await TelegramEditMessage(moved, messageId)
        } catch (error) {
            console.error(`Error moving earlier invoice message ${messageId} to the new day:`, error);
        }
    }
}

/**
 * Removes an invoice's channel thread — its current message and every earlier
 * one it replied to — once it's no longer pending fulfillment (marked as sent,
 * or paid); a no-op if it never had one. The invoice's message ids and log
 * entries are forgotten even when Telegram refuses the delete, so a stale
 * message never lingers in the app. Best-effort: a
 * failure is logged, not thrown, since the invoice's own state change in Zoho
 * is what actually matters.
 */
export async function deleteInvoiceTelegramMessage(invoiceId: string) {
    try {
        const messageId = await redisClient.get(invoiceId)
        const earlierIds = await earlierThreadMessageIds(invoiceId)
        if (!messageId && earlierIds.length === 0) return

        for (const id of [...(messageId ? [Number(messageId)] : []), ...earlierIds]) {
            await TelegramDeleteMessage(id)
        }
        await redisClient.del([invoiceId, threadKey(invoiceId), numbersKey(invoiceId)])
    } catch (error) {
        console.error('Error deleting invoice message after it left draft:', error);
    }
}
