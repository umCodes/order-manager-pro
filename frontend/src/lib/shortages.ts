import type { InvoiceDetailLineItem, OrderShortageItem } from "../types";

/**
 * Pairs each reported item with the invoice line it belongs to: the same
 * Zoho item — and, for a general item (keyed with its description) or a
 * line with no item, the same description. Each shortage goes on the first
 * matching line; the ones matching no line are returned as `unmatched`.
 */
/** Whether an invoice line is the reported item: the same Zoho item and, for a general item or a line with no item, the same description. */
function isShortageLine(line: InvoiceDetailLineItem, shortage: OrderShortageItem) {
  const byDescription = !shortage.item_id || shortage.item_key.includes("|");
  return (
    String(line.item_id ?? "") === shortage.item_id &&
    (!byDescription || line.description.trim() === shortage.description.trim())
  );
}

/**
 * The invoice's lines with the reported item cut to what's available: its
 * lines keep their quantities in order until the available amount is used
 * up, and lines left with nothing are removed (all of them, for a missing
 * item). Returns null when no line is the item.
 */
export function linesWithReportApplied(lines: InvoiceDetailLineItem[], shortage: OrderShortageItem) {
  if (!lines.some((line) => isShortageLine(line, shortage))) return null;
  let remaining = shortage.available;
  return lines.flatMap((line) => {
    if (!isShortageLine(line, shortage)) return [line];
    const quantity = Math.round(Math.min(line.quantity, remaining) * 1000) / 1000;
    remaining -= quantity;
    return quantity > 0 ? [{ ...line, quantity, item_total: quantity * line.rate }] : [];
  });
}

export function matchShortagesToLines(lines: InvoiceDetailLineItem[], shortages: OrderShortageItem[]) {
  const byLine = new Map<string, OrderShortageItem>();
  const unmatched: OrderShortageItem[] = [];
  for (const shortage of shortages) {
    const line = lines.find((candidate) => !byLine.has(candidate.line_item_id) && isShortageLine(candidate, shortage));
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

/**
 * Each breakdown entry's shortage on the Items tab: the entry's draft's
 * shortage for the same Zoho item (and, for a general item, description).
 * A draft's shortage goes on its first matching entry only, so a draft with
 * the item on two lines isn't counted twice.
 */
export function shortagesForBreakdown(
  entries: { invoice_id: string; item_id?: string; description?: string }[],
  byInvoice: Record<string, OrderShortageItem[]>,
): (OrderShortageItem | undefined)[] {
  const used = new Set<string>();
  return entries.map((entry) => {
    const shortage = (byInvoice[entry.invoice_id] ?? []).find(
      (candidate) =>
        candidate.short > 0 &&
        !used.has(`${entry.invoice_id}:${candidate.item_key}`) &&
        candidate.item_id === (entry.item_id ?? "") &&
        (!(candidate.item_key.includes("|") || !candidate.item_id) ||
          (entry.description ?? "").trim() === candidate.description.trim()),
    );
    if (shortage) used.add(`${entry.invoice_id}:${shortage.item_key}`);
    return shortage;
  });
}
