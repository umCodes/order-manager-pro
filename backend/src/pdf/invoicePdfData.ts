import type { ZohoInvoice, LineItem } from "../services/zoho/types.js";
import type { ZohoCreditNote } from "../services/zoho/creditNotes.js";
import type { InvoicePdfData } from "./types.js";
import { INTERNAL_ITEM_MARKER } from "../utils/internalLineItems.js";
import { getContactDisplayName } from "../services/zoho/customers/index.js";
import { getCatalogItems } from "../services/zoho/items.js";

/** The customer named on the PDF: company name, else contact name (from `customer`, the fetched Zoho contact), else the invoice's own customer name. */
function pdfCustomerName(invoice: ZohoInvoice, customer?: unknown) {
  return getContactDisplayName(customer) || invoice.customer_name;
}

/**
 * Each catalog item's regular price by item id, for marking lines sold
 * below it (see toInvoicePdfData). From the in-memory catalog cache, so
 * usually no Zoho call; empty if the catalog can't be read — the PDF then
 * just shows no line discounts.
 */
export async function regularItemRates(accessToken: string): Promise<Map<string, number>> {
  try {
    const items = await getCatalogItems(accessToken);
    return new Map(items.filter((item) => item.item_id && Number(item.rate) > 0).map((item) => [String(item.item_id), Number(item.rate)]));
  } catch (error) {
    console.error("Couldn't read regular item prices for the invoice PDF", error);
    return new Map();
  }
}

/**
 * Maps a raw Zoho invoice (and its customer, when fetched) to the PDF
 * generator's input shape, filtering out internal/admin-only ("###") lines.
 * A line priced below the item's regular price in `regularRates` (see
 * regularItemRates) carries that price, so the PDF shows the difference as
 * a discount on the line.
 */
export function toInvoicePdfData(invoice: ZohoInvoice, customer?: unknown, regularRates?: Map<string, number>): InvoicePdfData {
  return {
    invoiceNumber: invoice.invoice_number,
    customerName: pdfCustomerName(invoice, customer),
    date: invoice.date,
    lineItems: invoice.line_items
      .filter((item: LineItem) => !item.description.includes(INTERNAL_ITEM_MARKER))
      .map((item: LineItem) => ({
        description: item.description,
        itemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        ...regularRateFor(item, regularRates),
      })),
    totalPrice: invoice.total,
    // Returns' credit is its own line: "Paid" is only what was paid.
    paidAmount: invoice.total - invoice.balance - (invoice.credits_applied ?? 0),
    returnedAmount: invoice.credits_applied ?? 0,
    discountAmount: invoice.sub_total + invoice.tax_total + invoice.shipping_charge + invoice.adjustment - invoice.total,
    subTotal: invoice.sub_total,
  };
}

function regularRateFor(item: LineItem, regularRates?: Map<string, number>) {
  const regular = regularRates?.get(String(item.item_id));
  // Rounded to the cent so float noise never shows as a discount.
  return regular && Math.round(regular * 100) > Math.round(Number(item.rate) * 100) ? { regularRate: regular } : {};
}

/**
 * Maps a return (Zoho credit note) and the invoice it's from to the PDF
 * generator's input, as a return notice. `balanceDue` is the customer's
 * total balance after the return. `customer` is as in toInvoicePdfData.
 */
export function toReturnNoticePdfData(creditNote: ZohoCreditNote, invoice: ZohoInvoice, balanceDue?: number, customer?: unknown): InvoicePdfData {
  return {
    invoiceNumber: creditNote.creditnote_number,
    customerName: pdfCustomerName(invoice, customer),
    date: creditNote.date,
    lineItems: creditNote.line_items.map((item) => ({
      description: item.description ?? "",
      itemName: item.name ?? "",
      quantity: item.quantity,
      unit: item.unit ?? "",
      rate: item.rate,
    })),
    totalPrice: creditNote.total,
    paidAmount: 0,
    returnNotice: { referenceInvoiceNumber: invoice.invoice_number, ...(balanceDue !== undefined && { balanceDue }) },
  };
}
