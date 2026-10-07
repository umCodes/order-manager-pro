import type { ZohoInvoice, LineItem } from "../services/zoho/types.js";
import type { ZohoCreditNote } from "../services/zoho/creditNotes.js";
import type { InvoicePdfData } from "./types.js";
import { INTERNAL_ITEM_MARKER } from "../utils/internalLineItems.js";

/** Maps a raw Zoho invoice to the PDF generator's input shape, filtering out internal/admin-only ("###") lines. */
export function toInvoicePdfData(invoice: ZohoInvoice): InvoicePdfData {
  return {
    invoiceNumber: invoice.invoice_number,
    customerName: invoice.customer_name,
    date: invoice.date,
    lineItems: invoice.line_items
      .filter((item: LineItem) => !item.description.includes(INTERNAL_ITEM_MARKER))
      .map((item: LineItem) => ({
        description: item.description,
        itemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
      })),
    totalPrice: invoice.total,
    // Returns' credit is its own line: "Paid" is only what was paid.
    paidAmount: invoice.total - invoice.balance - (invoice.credits_applied ?? 0),
    returnedAmount: invoice.credits_applied ?? 0,
    discountAmount: invoice.sub_total + invoice.tax_total + invoice.shipping_charge + invoice.adjustment - invoice.total,
    subTotal: invoice.sub_total,
  };
}

/**
 * Maps a return (Zoho credit note) and the invoice it's from to the PDF
 * generator's input, as a return notice. `balanceDue` is the customer's
 * total balance after the return.
 */
export function toReturnNoticePdfData(creditNote: ZohoCreditNote, invoice: ZohoInvoice, balanceDue?: number): InvoicePdfData {
  return {
    invoiceNumber: creditNote.creditnote_number,
    customerName: invoice.customer_name,
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
