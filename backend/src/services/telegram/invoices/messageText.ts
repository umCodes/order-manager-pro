import { quantityCalc } from "../../../utils/quantity.js"
import { describeBusinessDate } from "../../../utils/businessDate.js"
import type { ItemWithQuantity } from "../../zoho/types.js"
import { INTERNAL_ITEM_MARKER } from "../../../utils/internalLineItems.js"

const AMHARIC_WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ሮብ", "ሐሙስ", "ጁምአ", "ቅዳሜ"];

/** Notices appended to an invoice message when it supersedes or corrects an earlier one. */
export const UPDATED_VERSION_NOTICE_AMHARIC = "🔄️ የሚፈለገው ይህ ብቻ ነው።";
export const DELETED_CONTINUATION_NOTICE_AMHARIC = "ይህ መልእክት የተሰረዝ መልእክት ቅጥል ነው";
export const EDITED_NOTICE_AMHARIC = "⚠️ ይህ መልእክት ተቀይሯል";

/**
 * Builds the message the fulfillment channel actually sees: the invoice
 * number, one line per (non-internal) item, the scheduled day in Amharic
 * with a colour-coded icon, and an optional trailing notice.
 */
export function invoiceMessageText(invoice: any, line_items: ItemWithQuantity[], suffixNotice?: string) {
    const visibleItems = line_items.filter((item) => !item.description.includes(INTERNAL_ITEM_MARKER));

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
