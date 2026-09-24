import type { DraftLineItemSummary, InvoiceDetailLineItem } from "../types";
import { groupByScheduledDay } from "./scheduledDate";

const BOX_MULTIPLIER = 10;

type QuantifiedItem = {
  quantity: number;
  unit: string;
  description: string;
};

function computedQuantity(item: QuantifiedItem): number {
  return item.unit === "box" ? item.quantity * BOX_MULTIPLIER : item.quantity;
}

function formatItemLines(items: QuantifiedItem[]): string[] {
  return [...items]
    .sort((a, b) => computedQuantity(b) - computedQuantity(a))
    .map((item) => `${computedQuantity(item)}ኪሎ ${item.description}`);
}

/** Formats aggregated items as one "{qty}ኪሎ {description}" line per item, largest quantity first. */
export function formatItemsForCopy(items: DraftLineItemSummary[]): string {
  return formatItemLines(items).join("\n");
}

/** Formats one invoice as its number followed by its item lines, largest quantity first. */
export function formatInvoiceForCopy(invoiceNumber: string, lineItems: InvoiceDetailLineItem[]): string {
  return [invoiceNumber, ...formatItemLines(lineItems)].join("\n");
}

/** Formats a list of invoices, each as its own block (see formatInvoiceForCopy), separated by a blank line. */
export function formatInvoicesForCopy(
  invoices: { invoice_number: string; line_items: InvoiceDetailLineItem[] }[],
): string {
  return invoices
    .map((invoice) => formatInvoiceForCopy(invoice.invoice_number, invoice.line_items))
    .join("\n\n");
}

export type ItemDayGroup = {
  /** The effective day (YYYY-MM-DD), or null for items from undated drafts. */
  date: string | null;
  items: DraftLineItemSummary[];
  /** How many distinct drafts in this day were carried over from an earlier date. */
  carriedOverDraftCount: number;
};

/**
 * Splits the all-drafts item rollup into one rollup per scheduled day, using
 * each breakdown entry's source-draft date. Drafts whose date has passed are
 * counted under today (see effectiveScheduledDate) with their breakdown
 * entries flagged isCarriedOver, matching how the Drafts tab shows them.
 */
export function groupItemsByScheduledDay(items: DraftLineItemSummary[], from: Date = new Date()): ItemDayGroup[] {
  const entries = items.flatMap((item) => item.breakdown.map((entry) => ({ item, entry })));
  const dayGroups = groupByScheduledDay(entries, ({ entry }) => entry.date, from);

  return dayGroups.map((group) => {
    const byName = new Map<string, DraftLineItemSummary>();
    const carriedOverDrafts = new Set<string>();

    for (const { value: { item, entry }, isCarriedOver } of group.entries) {
      if (isCarriedOver) carriedOverDrafts.add(entry.invoice_id);
      const breakdownEntry = { ...entry, isCarriedOver };
      const existing = byName.get(item.name);
      if (existing) {
        existing.quantity += entry.quantity;
        existing.breakdown.push(breakdownEntry);
      } else {
        byName.set(item.name, {
          name: item.name,
          description: item.description,
          unit: item.unit,
          quantity: entry.quantity,
          breakdown: [breakdownEntry],
        });
      }
    }

    return { date: group.date, items: Array.from(byName.values()), carriedOverDraftCount: carriedOverDrafts.size };
  });
}
