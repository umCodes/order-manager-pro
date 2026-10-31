import type { InvoiceDetailLineItem, OrderShortageItem } from "../types";

/**
 * Pairs each reported item with the invoice line it belongs to: the same
 * Zoho item — and, for a general item (keyed with its description) or a
 * line with no item, the same description. Each shortage goes on the first
 * matching line; the ones matching no line are returned as `unmatched`.
 */
export function matchShortagesToLines(lines: InvoiceDetailLineItem[], shortages: OrderShortageItem[]) {
  const byLine = new Map<string, OrderShortageItem>();
  const unmatched: OrderShortageItem[] = [];
  for (const shortage of shortages) {
    const byDescription = !shortage.item_id || shortage.item_key.includes("|");
    const line = lines.find(
      (candidate) =>
        !byLine.has(candidate.line_item_id) &&
        String(candidate.item_id ?? "") === shortage.item_id &&
        (!byDescription || candidate.description.trim() === shortage.description.trim()),
    );
    if (line) byLine.set(line.line_item_id, shortage);
    else unmatched.push(shortage);
  }
  return { byLine, unmatched };
}

/** When something was reported: the time today, or the weekday and time. */
export function reportTime(iso: string) {
  const at = new Date(iso);
  const today = at.toDateString() === new Date().toDateString();
  return at.toLocaleString(undefined, today ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
