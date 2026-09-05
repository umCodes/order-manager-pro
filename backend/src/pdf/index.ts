/**
 * Invoice PDF generation. Two templates share one mixed-script text engine:
 * `templates/classic` (full Letter page) and `templates/receipt` (compact
 * 420x700 receipt). Import from here rather than reaching into the
 * individual modules.
 */
export * from "./types.js";
export * from "./invoicePdfData.js";
export * from "./classicInvoicePdf.js";
export * from "./receiptInvoicePdf.js";
