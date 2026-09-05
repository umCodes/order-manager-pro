import { renderToBuffer, renderToFile } from "./documentFactory.js";
import { RECEIPT_MARGIN, RECEIPT_PAGE_SIZE, renderReceiptInvoiceDocument } from "./templates/receipt.js";
import type { InvoiceLanguage, InvoicePdfData } from "./types.js";

const RECEIPT_PAGE_OPTIONS = { size: RECEIPT_PAGE_SIZE, margin: RECEIPT_MARGIN };

/** Receipt-style invoice PDF (420x700, bordered info/items cards), written to a file. */
export function createReceiptInvoicePdf(
  filePath: string,
  invoice: InvoicePdfData,
  language: InvoiceLanguage = "am",
): Promise<void> {
  return renderToFile(filePath, RECEIPT_PAGE_OPTIONS, (doc) => renderReceiptInvoiceDocument(doc, invoice, language));
}

/** Receipt-style invoice PDF (420x700, bordered info/items cards), returned as bytes. */
export function createReceiptInvoicePdfBuffer(
  invoice: InvoicePdfData,
  language: InvoiceLanguage = "am",
): Promise<Buffer> {
  return renderToBuffer(RECEIPT_PAGE_OPTIONS, (doc) => renderReceiptInvoiceDocument(doc, invoice, language));
}
