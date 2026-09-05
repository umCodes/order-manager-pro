import { renderToBuffer, renderToFile } from "./documentFactory.js";
import { renderInvoiceDocument } from "./templates/classic.js";
import type { InvoiceLanguage, InvoicePdfData } from "./types.js";

/** Letter-size page with the standard 50pt margin, as the classic template's layout assumes. */
const CLASSIC_PAGE_OPTIONS = { margin: 50 };

function createFile(filePath: string, invoice: InvoicePdfData, language: InvoiceLanguage): Promise<void> {
  return renderToFile(filePath, CLASSIC_PAGE_OPTIONS, (doc) => renderInvoiceDocument(doc, invoice, language));
}

function createBuffer(invoice: InvoicePdfData, language: InvoiceLanguage): Promise<Buffer> {
  return renderToBuffer(CLASSIC_PAGE_OPTIONS, (doc) => renderInvoiceDocument(doc, invoice, language));
}

/** Amharic invoice: Amharic labels, item.description as the display name, ኪሎ/ግራም weight suffixes. */
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
