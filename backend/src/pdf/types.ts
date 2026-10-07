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
  /** Paid by actual payments (not returns — see returnedAmount). */
  paidAmount: number;
  /** Credit from returns applied to this invoice; shown as its own line, apart from payments. */
  returnedAmount?: number;
  discountAmount?: number;
  currency?: string;
  logoPath?: string;
  /** Pre-discount total. Required by the receipt template's Subtotal row; optional elsewhere. */
  subTotal?: number;
  /**
   * Set for a return (Zoho credit note) instead of a sale: the page is
   * titled "Return Notice", shows the return's number and the invoice it's
   * from, and only a Total (no subtotal, discount, paid or balance).
   * `invoiceNumber` / `date` are then the return's own.
   */
  returnNotice?: {
    referenceInvoiceNumber: string;
    /** The customer's total balance due right after this return was recorded. */
    balanceDue?: number;
  };
};
