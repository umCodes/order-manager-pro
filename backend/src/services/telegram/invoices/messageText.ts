import { quantityCalc } from "../../../utils/quantity.js"
import { describeBusinessDate } from "../../../utils/businessDate.js"
import type { ItemWithQuantity } from "../../zoho/types.js"
import { INTERNAL_ITEM_MARKER } from "../../../utils/internalLineItems.js"
import { circledNumber, itemNumberKey, numberItems, type ItemKeyOf, type ItemNumbers } from "./itemNumbers.js"

const AMHARIC_WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ሮብ", "ሐሙስ", "ጁምአ", "ቅዳሜ"];

/** Notices added to invoice messages when an order changes after it was posted. */
export const EDITED_NOTICE_AMHARIC = "⚠️ ይህ መልእክት ተቀይሯል";
/** Marks a message that has since been superseded by a reply listing the changes. */
export const HAS_CHANGES_BELOW_NOTICE_AMHARIC = "➕";
/** Heads a changes reply that only adds to the order (new items or higher quantities). */
export const ITEMS_ADDED_NOTICE_AMHARIC = "➕ የተጨመሩት እቃዎች";
/** Heads a changes reply that also lowers quantities or removes items. */
export const ORDER_CHANGED_NOTICE_AMHARIC = "🔄 ይህ ትዕዛዝ ተቀይሯል";
const REMOVED_ITEM_AMHARIC = "ቀርቷል";

const DAY_LINE_PATTERN = /^(?:🟢|🟡|🗓️) ለ.*$/m;
const DAY_LINE_BLOCK_PATTERN = /\n\n(?:🟢|🟡|🗓️) ለ.*$/m;

const visible = (line_items: ItemWithQuantity[]) =>
    line_items.filter((item) => !item.description.includes(INTERNAL_ITEM_MARKER));

/**
 * The scheduled-day line: "for today" when the invoice is for today, and the
 * weekday's own name otherwise — never "tomorrow", which goes stale once the
 * message is read on a different day than it was sent. Empty without a date.
 */
export function invoiceDayLine(invoice: any) {
    if (!invoice.date) return "";
    return `${describeBusinessDate(invoice.date).isToday ? "🟢" : "🗓️"} ${invoiceDayName(invoice.date)}`;
}

/** The day on its own, as the day line says it: "ለዛሬ" (for today) or "ለሰኞ" (for Monday). */
export function invoiceDayName(date: string) {
    const { isToday, weekday } = describeBusinessDate(date);
    return isToday ? "ለዛሬ" : `ለ${AMHARIC_WEEKDAYS[weekday]}`;
}

function invoiceMessage(invoice: any, bodyLines: string[], headerNotice?: string, suffixNotice?: string) {
    const dayLine = invoiceDayLine(invoice);
    return [
        `${invoice.invoice_number}:`,
        ...(headerNotice ? [headerNotice] : []),
        bodyLines.join('\n'),
        ...(dayLine ? [dayLine] : []),
        ...(suffixNotice ? [suffixNotice] : []),
    ].join('\n\n');
}

/** "① " for a numbered item; nothing when the message isn't numbered (orders posted before numbering). */
function numberPrefix(item: ItemWithQuantity, numbers?: ItemNumbers | null, keyOf: ItemKeyOf = itemNumberKey) {
    const number = numbers?.get(keyOf(item));
    return number ? `${circledNumber(number)} ` : "";
}

const itemLine = (item: ItemWithQuantity, numbers?: ItemNumbers | null, keyOf?: ItemKeyOf) =>
    `${numberPrefix(item, numbers, keyOf)}${quantityCalc(item.quantity, item.unit)} ${item.description}`;

/**
 * Builds the message the fulfillment channel actually sees: the invoice
 * number, one line per (non-internal) item — numbered ① ② ③ when `numbers`
 * is given — the scheduled day in Amharic with a colour-coded icon, and an
 * optional trailing notice. `keyOf` tells items apart, as `numbers` was keyed.
 */
export function invoiceMessageText(
    invoice: any,
    line_items: ItemWithQuantity[],
    suffixNotice?: string,
    numbers?: ItemNumbers | null,
    keyOf?: ItemKeyOf,
) {
    const itemLines = visible(line_items).map((item) => itemLine(item, numbers, keyOf));
    return invoiceMessage(invoice, itemLines, undefined, suffixNotice);
}

/**
 * An items-only post (a backup list): its id where an invoice message has
 * the invoice number, with "ትርፍ" (surplus) under it, then the same numbered
 * item lines and day line. The day line is left out when no date was picked.
 */
export function itemsListMessageText(listId: string, line_items: ItemWithQuantity[], date?: string, keyOf?: ItemKeyOf) {
    const items = visible(line_items);
    const numbers = numberItems(items, null, keyOf);
    const itemLines = items.map((item) => itemLine(item, numbers, keyOf));
    const dayLine = invoiceDayLine({ date });
    return [`${listId}:\nትርፍ`, itemLines.join('\n'), ...(dayLine ? [dayLine] : [])].join('\n\n');
}

/** Sums quantities per item, so an item split over two lines compares as one. */
function totalsByItem(line_items: ItemWithQuantity[], keyOf: ItemKeyOf) {
    const totals = new Map<string, ItemWithQuantity>();
    for (const item of visible(line_items)) {
        const key = keyOf(item);
        const existing = totals.get(key);
        totals.set(key, existing ? { ...existing, quantity: existing.quantity + item.quantity } : { ...item });
    }
    return totals;
}

/** Rounds away float noise (0.3 - 0.1) before quantities are compared or shown. */
const round = (quantity: number) => Math.round(quantity * 1000) / 1000;

/**
 * The reply posted under an invoice's previous message when its items change:
 * only what differs from that message — new items and raised quantities as
 * `+`, lowered ones as `-`, dropped items marked removed — so the preparers
 * add to what they already prepared instead of preparing the order twice.
 * With `numbers`, each line starts with the item's number on the order.
 * Null when the visible items didn't change at all.
 */
export function invoiceChangesMessageText(
    invoice: any,
    previous_line_items: ItemWithQuantity[],
    line_items: ItemWithQuantity[],
    numbers?: ItemNumbers | null,
    keyOf: ItemKeyOf = itemNumberKey,
) {
    const before = totalsByItem(previous_line_items, keyOf);
    const after = totalsByItem(line_items, keyOf);

    const lines: string[] = [];
    let onlyAdditions = true;

    for (const [key, item] of after) {
        const delta = round(item.quantity - (before.get(key)?.quantity ?? 0));
        if (delta === 0) continue;
        if (delta < 0) onlyAdditions = false;
        lines.push(`${numberPrefix(item, numbers, keyOf)}${delta > 0 ? "+" : "-"}${quantityCalc(Math.abs(delta), item.unit)} ${item.description}`);
    }
    for (const [key, item] of before) {
        if (after.has(key)) continue;
        onlyAdditions = false;
        lines.push(`${numberPrefix(item, numbers, keyOf)}❌ ${item.description} (${REMOVED_ITEM_AMHARIC})`);
    }

    if (lines.length === 0) return null;

    const header = onlyAdditions ? ITEMS_ADDED_NOTICE_AMHARIC : ORDER_CHANGED_NOTICE_AMHARIC;
    return invoiceMessage(invoice, lines, header);
}

/**
 * A posted message's text with its day line swapped for the invoice's current
 * one — dropped when the invoice has no date, and added (ahead of the
 * "changed" mark, if the message has one) when the message had none.
 */
export function withDayLine(text: string, invoice: any) {
    const dayLine = invoiceDayLine(invoice);
    if (DAY_LINE_PATTERN.test(text)) {
        return dayLine ? text.replace(DAY_LINE_PATTERN, dayLine) : text.replace(DAY_LINE_BLOCK_PATTERN, "");
    }
    if (!dayLine) return text;

    const blocks = text.split('\n\n');
    const markAt = blocks.indexOf(HAS_CHANGES_BELOW_NOTICE_AMHARIC);
    blocks.splice(markAt === -1 ? blocks.length : markAt, 0, dayLine);
    return blocks.join('\n\n');
}
