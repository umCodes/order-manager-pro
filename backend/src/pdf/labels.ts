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
  },
};

/** Receipt-template title (distinct from the classic template's plain "Invoice"/"ደረሰኝ"). */
export const RECEIPT_TITLE: Record<InvoiceLanguage, string> = {
  am: "የግዢ ደረሰኝ",
  ar: "Purchase Invoice",
  en: "Purchase Invoice",
};
