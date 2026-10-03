import type { InvoiceDetailLineItem } from "../types";

/**
 * Automatic reasons for editing an invoice. Zoho requires a reason on any
 * edit to an invoice that's no longer a draft; instead of asking for one,
 * the app describes the change itself.
 */

/** Zoho keeps reasons short; long item lists are cut off with "…". */
const MAX_REASON_LENGTH = 250;

function clip(text: string) {
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH - 1)}…` : text;
}

export function dateChangeReason(from: string | undefined, to: string) {
  return clip(`Date changed from ${from || "none"} to ${to || "today"}`);
}

export function customerChangeReason(from: string, to: string) {
  return clip(`Customer changed from ${from} to ${to}`);
}

/** Totals per catalog item (an item can appear on more than one line). */
function byItem(lineItems: InvoiceDetailLineItem[]) {
  const items = new Map<string, { name: string; quantity: number; rate: number }>();
  for (const li of lineItems) {
    const existing = items.get(li.item_id);
    items.set(li.item_id, {
      name: li.name || li.description || "Item",
      quantity: (existing?.quantity ?? 0) + li.quantity,
      rate: li.rate,
    });
  }
  return items;
}

/** e.g. "Items updated: added Sugar ×2; removed Rice; Oil qty 3 → 5; Flour price 120 → 130". */
export function lineItemsChangeReason(before: InvoiceDetailLineItem[], after: InvoiceDetailLineItem[]) {
  const previous = byItem(before);
  const next = byItem(after);
  const changes: string[] = [];

  for (const [id, item] of next) {
    const old = previous.get(id);
    if (!old) {
      changes.push(`added ${item.name} ×${item.quantity}`);
      continue;
    }
    if (old.quantity !== item.quantity) changes.push(`${item.name} qty ${old.quantity} → ${item.quantity}`);
    if (old.rate !== item.rate) changes.push(`${item.name} price ${old.rate} → ${item.rate}`);
  }
  for (const [id, item] of previous) {
    if (!next.has(id)) changes.push(`removed ${item.name}`);
  }

  return clip(changes.length > 0 ? `Items updated: ${changes.join("; ")}` : "Items updated");
}
