import { quantityCalc } from "../../utils/calcs.js"
import type { ItemWithQuantity } from "../../utils/types.js"
import { TelegramSendMessage, TelegramEditMessage, TelegramReplyToMessage, TelegramDeleteMessage } from "./messages.js"
import { describeBusinessDate } from "../../utils/businessDate.js"

const EXCLUDE_MARKER = "###";

const AMHARIC_WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ሮብ", "ሐሙስ", "ጁምአ", "ቅዳሜ"];

function invoiceMessageText(invoice: any, line_items: ItemWithQuantity[], suffixNotice?: string) {
    const visibleItems = line_items.filter((item) => !item.description.includes(EXCLUDE_MARKER));

    let dayLine = "";
    if (invoice.date) {
        const { isToday, isTomorrow, weekday: weekdayIndex } = describeBusinessDate(invoice.date);
        const weekday = isToday ? "ዛሬ" : isTomorrow ? "ነገ" : AMHARIC_WEEKDAYS[weekdayIndex];
        const dayIcon = isToday ? "🟢" : isTomorrow ? "🟡" : "🗓️";
        dayLine = `\n\n${dayIcon} ለ${weekday}`;
    }

    const itemLines = visibleItems.map((item) => {
        const quantity = quantityCalc(item.quantity, item.unit);
        return `${quantity} ${item.description}`
    }).join('\n');

    const noticeLine = suffixNotice ? `\n\n${suffixNotice}` : "";

    return `${invoice.invoice_number}:\n\n${itemLines}${dayLine}${noticeLine}`;
}

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


const UPDATED_VERSION_NOTICE_AMHARIC = "🔄️ የሚፈለገው ይህ ብቻ ነው።";
const DELETED_CONTINUATION_NOTICE_AMHARIC = "ይህ መልእክት የተሰረዝ መልእክት ቅጥል ነው";

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

const EDITED_NOTICE_AMHARIC = "⚠️ ይህ መልእክት ተቀይሯል";

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