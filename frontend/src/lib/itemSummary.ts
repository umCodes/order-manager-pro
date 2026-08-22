import type { DraftLineItemSummary, InvoiceDetailLineItem } from "../types";

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
