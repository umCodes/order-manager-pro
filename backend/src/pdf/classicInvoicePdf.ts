import { renderToBuffer, renderToFile } from "./documentFactory.js";
import { renderInvoiceDocument } from "./templates/classic.js";
import type { InvoiceLanguage, InvoicePdfData } from "./types.js";

/**
 * No fixed page size here — the POS-receipt template sizes each page itself
 * (it measures content per language before adding it), so the document just
 * needs to start with no default first page for it to add its own to.
 */
const POS_RECEIPT_OPTIONS = { autoFirstPage: false };

/** Amharic renders as two pages — Amharic, then an English repeat; other languages render as a single page. */
function languagesFor(language: InvoiceLanguage): InvoiceLanguage[] {
  return language === "am" ? ["am", "en"] : [language];
}

function createFile(filePath: string, invoice: InvoicePdfData, language: InvoiceLanguage): Promise<void> {
  return renderToFile(filePath, POS_RECEIPT_OPTIONS, (doc) => renderInvoiceDocument(doc, invoice, languagesFor(language)));
}

function createBuffer(invoice: InvoicePdfData, language: InvoiceLanguage): Promise<Buffer> {
  return renderToBuffer(POS_RECEIPT_OPTIONS, (doc) => renderInvoiceDocument(doc, invoice, languagesFor(language)));
}

/** Amharic invoice: two pages — Amharic first, then an English repeat — item.description as the Amharic display name, ኪሎ/ግራም weight suffixes. */
export function createInvoicePdf(filePath: string, invoice: InvoicePdfData): Promise<void> {
  return createFile(filePath, invoice, "am");
}

/** Arabic invoice: English labels (per business preference), item.itemName as the display name, Arabic-translated units. */
export function createInvoicePdfArabic(filePath: string, invoice: InvoicePdfData): Promise<void> {
  return createFile(filePath, invoice, "ar");
}

/** English invoice: English labels, item.itemName as the display name, English units. */
export function createInvoicePdfEnglish(filePath: string, invoice: InvoicePdfData): Promise<void> {
  return createFile(filePath, invoice, "en");
}

/** Same as createInvoicePdf, but returns the PDF bytes directly instead of writing to a file. */
export function createInvoicePdfBuffer(invoice: InvoicePdfData): Promise<Buffer> {
  return createBuffer(invoice, "am");
}

/** Same as createInvoicePdfArabic, but returns the PDF bytes directly instead of writing to a file. */
export function createInvoicePdfArabicBuffer(invoice: InvoicePdfData): Promise<Buffer> {
  return createBuffer(invoice, "ar");
}

/** Same as createInvoicePdfEnglish, but returns the PDF bytes directly instead of writing to a file. */
export function createInvoicePdfEnglishBuffer(invoice: InvoicePdfData): Promise<Buffer> {
  return createBuffer(invoice, "en");
}

/** Generates an invoice PDF buffer in the given language ("am" | "ar" | "en"). */
export function createInvoicePdfBufferForLanguage(
  invoice: InvoicePdfData,
  language: InvoiceLanguage,
): Promise<Buffer> {
  return createBuffer(invoice, language);
}
