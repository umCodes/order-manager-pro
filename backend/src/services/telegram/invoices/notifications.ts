import type { ItemWithQuantity } from "../../zoho/types.js"
import { TelegramSendMessage, TelegramEditMessage, TelegramReplyToMessage, TelegramDeleteMessage } from "../messages.js"
import {
    DELETED_CONTINUATION_NOTICE_AMHARIC,
    EDITED_NOTICE_AMHARIC,
    UPDATED_VERSION_NOTICE_AMHARIC,
    invoiceMessageText,
} from "./messageText.js"

/** Posts an invoice to the fulfillment channel as a brand-new message. */
export async function sendInvoiceTelegramMessage(invoice: any, line_items: ItemWithQuantity[]) {
    try {
        console.log("Sending a fresh telegram message")
        const text = invoiceMessageText(invoice, line_items)
        return await TelegramSendMessage(text);
    } catch (error) {
        console.error('Error sending invoice message:', error);
        throw error;
    }
}

/**
 * Posts the invoice's new full contents as a reply to its previous message,
 * then deletes that previous one — so the channel keeps a single current
 * version in the thread. Falls back to a fresh message if the reply fails;
 * a failed cleanup delete is logged but not fatal.
 */
export async function replyWithAddedInvoiceItemsTelegramMessage(
    invoice: any,
    all_line_items: ItemWithQuantity[],
    messageId: number,
) {
    const notice = `${UPDATED_VERSION_NOTICE_AMHARIC}\n${DELETED_CONTINUATION_NOTICE_AMHARIC}`
    const text = invoiceMessageText(invoice, all_line_items, notice)

    let message;

    console.log("Replying to message")
    try {
        message = await TelegramReplyToMessage(text, messageId);
        console.log(message)
    } catch (error) {
        console.error('Error replying to previous invoice message, sending a new one instead:', error);
        return await sendInvoiceTelegramMessage(invoice, all_line_items);
    }

    try {
        await TelegramDeleteMessage(messageId);
    } catch (error) {
        console.error('Error deleting previous invoice message after reply:', error);
    }

    return message;
}

/**
 * Edits the invoice's existing channel message in place after a date change
 * and replies with an "edited" notice so the team sees it moved. Returns
 * `edited: false` when there was no message to edit (or editing failed) and
 * a fresh one was sent instead — the caller then stores the new message id.
 */
export async function updateInvoiceDateTelegramMessage(
    invoice: any,
    line_items: ItemWithQuantity[],
    messageId: number | null,
) {
    if (!messageId) {
        console.log("No Message ID")
        return { message: await sendInvoiceTelegramMessage(invoice, line_items), edited: false };
    }

    try {
        console.log("Yes Message ID")
        const text = invoiceMessageText(invoice, line_items)
        const message = await TelegramEditMessage(text, messageId);
        const reply = await TelegramReplyToMessage(EDITED_NOTICE_AMHARIC, messageId);
        return { message, edited: true };
    } catch (error) {

        console.log("Error Message ID")

        console.error('Error editing invoice message, resending as a new message:', error);
        return { message: await sendInvoiceTelegramMessage(invoice, line_items), edited: false };
    }
}
