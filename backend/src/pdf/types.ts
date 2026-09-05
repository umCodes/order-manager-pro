/** The three languages an invoice can be rendered in. */
export type InvoiceLanguage = "am" | "ar" | "en";

/** One row of the invoice's items table, already stripped of Zoho-specific fields. */
export type InvoiceLineItem = {
  description: string;
  itemName: string;
  quantity: number;
  unit: string;
  rate: number;
};

/** Everything a template needs to render an invoice — see toInvoicePdfData for the mapping from a Zoho invoice. */
export type InvoicePdfData = {
  invoiceNumber: string;
  customerName: string;
  date: string;
  lineItems: InvoiceLineItem[];
  totalPrice: number;
  paidAmount: number;
  discountAmount?: number;
  currency?: string;
  logoPath?: string;
  /** Pre-discount total. Required by the receipt template's Subtotal row; optional elsewhere. */
  subTotal?: number;
};
