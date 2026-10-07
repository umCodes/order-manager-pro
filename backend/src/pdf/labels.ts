import type { InvoiceLanguage } from "./types.js";

/** Every piece of fixed text a template prints, per language. */
export type Labels = {
  title: string;
  logoPlaceholder: string;
  invoiceNumber: string;
  customer: string;
  date: string;
  qty: string;
  item: string;
  weightQty: string;
  rate: string;
  amount: string;
  total: string;
  discount: string;
  paid: string;
  balanceDue: string;
  subTotal: string;
  /** POS-receipt template's item-table header for its rightmost (line total) column. */
  colTotal: string;
  /** POS-receipt template's footer line. */
  thankYou: string;
  /** Invoice totals: credit from returns taken off this invoice. */
  returned: string;
  /** Return notice (credit note): page title, its own number, and the invoice it returns goods from. */
  returnTitle: string;
  returnNumber: string;
  referenceInvoice: string;
};

/** Arabic invoices deliberately use English labels, per business preference. */
export const LABELS: Record<InvoiceLanguage, Labels> = {
  am: {
    title: "ደረሰኝ",
    logoPlaceholder: "ሎጎ",
    invoiceNumber: "የደረሰኝ ቁጥር:",
    customer: "ደንበኛ:",
    date: "ቀን:",
    qty: "ብዛት",
    item: "እቃ",
    weightQty: "የኪሎ ብዛት",
    rate: "ዋጋ",
    amount: "ድምር",
    total: "ጠቅላላ ድምር:",
    discount: "ቅናሽ:",
    paid: "የተከፈለ:",
    balanceDue: "ቀሪ ሂሳብ:",
    subTotal: "ንዑስ ድምር:",
    colTotal: "ድምር",
    thankYou: "እናመሰግናለን!",
    returned: "ተመላሽ:",
    returnTitle: "የተመላሽ እቃ ማሳወቅያ",
    returnNumber: "የተመላሽ ቁጥር:",
    referenceInvoice: "የተመለሰበት ደረሰኝ:",
  },
  ar: {
    title: "Invoice",
    logoPlaceholder: "LOGO",
    invoiceNumber: "Invoice Number:",
    customer: "Customer:",
    date: "Date:",
    qty: "Qty",
    item: "Item",
    weightQty: "Weight Qty",
    rate: "Rate",
    amount: "Amount",
    total: "Total:",
    discount: "Discount:",
    paid: "Paid:",
    balanceDue: "Balance Due:",
    subTotal: "Subtotal:",
    colTotal: "Total",
    thankYou: "Thank you!",
    returned: "Returned:",
    returnTitle: "Return Notice",
    returnNumber: "Return Number:",
    referenceInvoice: "Reference Invoice:",
  },
  en: {
    title: "Invoice",
    logoPlaceholder: "LOGO",
    invoiceNumber: "Invoice Number:",
    customer: "Customer:",
    date: "Date:",
    qty: "Qty",
    item: "Item",
    weightQty: "Weight Qty",
    rate: "Rate",
    amount: "Amount",
    total: "Total:",
    discount: "Discount:",
    paid: "Paid:",
    balanceDue: "Balance Due:",
    subTotal: "Subtotal:",
    colTotal: "Total",
    thankYou: "Thank you!",
    returned: "Returned:",
    returnTitle: "Return Notice",
    returnNumber: "Return Number:",
    referenceInvoice: "Reference Invoice:",
  },
};

/** Receipt-template title (distinct from the classic template's plain "Invoice"/"ደረሰኝ"). */
export const RECEIPT_TITLE: Record<InvoiceLanguage, string> = {
  am: "የግዢ ደረሰኝ",
  ar: "Purchase Invoice",
  en: "Purchase Invoice",
};
