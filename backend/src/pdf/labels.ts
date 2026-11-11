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
  /** Item-table column: the line's quantity in packs (the smaller unit inside a box), from the item's name. */
  packs: string;
  rate: string;
  amount: string;
  total: string;
  discount: string;
  paid: string;
  balanceDue: string;
  subTotal: string;
  /** Totals row adding up the discounts of lines sold below the item's regular price. */
  itemDiscounts: string;
  /** POS-receipt template's item-table header for its rightmost (line total) column. */
  colTotal: string;
  /** POS-receipt template's footer line. */
  thankYou: string;
  /** Invoice totals: credit from returns taken off this invoice. */
  returned: string;
  /** Return notice (credit note): page title, its own number, and the invoice it returns goods from. */
  returnTitle: string;
  returnNumber: string;
  /** Invoice item table: the label over the items the customer returned, listed after the ones kept. */
  returnedItems: string;
  referenceInvoice: string;
};

export const LABELS: Record<InvoiceLanguage, Labels> = {
  am: {
    title: "ደረሰኝ",
    logoPlaceholder: "ሎጎ",
    invoiceNumber: "የደረሰኝ ቁጥር:",
    customer: "ደንበኛ:",
    date: "ቀን:",
    qty: "ብዛት",
    item: "እቃ",
    weightQty: "ክብደት",
    packs: "እሽግ ብዛት",
    rate: "ዋጋ",
    amount: "ድምር",
    total: "ጠቅላላ ድምር:",
    discount: "ቅናሽ:",
    paid: "የተከፈለ:",
    balanceDue: "ቀሪ ሂሳብ:",
    subTotal: "ንዑስ ድምር:",
    itemDiscounts: "የእቃ ቅናሽ:",
    colTotal: "ድምር",
    thankYou: "እናመሰግናለን!",
    returned: "ተመላሽ:",
    returnTitle: "የተመላሽ እቃ ማሳወቅያ",
    returnNumber: "የተመላሽ ቁጥር:",
    returnedItems: "የተመለሱ እቃዎች",
    referenceInvoice: "የተመለሰበት ደረሰኝ:",
  },
  ar: {
    title: "فاتورة",
    logoPlaceholder: "الشعار",
    invoiceNumber: "رقم الفاتورة:",
    customer: "العميل:",
    date: "التاريخ:",
    qty: "الكمية",
    item: "الصنف",
    weightQty: "الوزن",
    packs: "العبوات",
    rate: "السعر",
    amount: "المبلغ",
    total: "الإجمالي:",
    discount: "الخصم:",
    paid: "المدفوع:",
    balanceDue: "المبلغ المتبقي:",
    subTotal: "المجموع الفرعي:",
    itemDiscounts: "خصم الأصناف:",
    colTotal: "الإجمالي",
    thankYou: "شكراً لتعاملكم معنا!",
    returned: "المرتجع:",
    returnTitle: "إشعار مرتجع",
    returnNumber: "رقم المرتجع:",
    returnedItems: "الأصناف المرتجعة",
    referenceInvoice: "الفاتورة المرجعية:",
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
    packs: "Packs",
    rate: "Rate",
    amount: "Amount",
    total: "Total:",
    discount: "Discount:",
    paid: "Paid:",
    balanceDue: "Balance Due:",
    subTotal: "Subtotal:",
    itemDiscounts: "Item discounts:",
    colTotal: "Total",
    thankYou: "Thank you!",
    returned: "Returned:",
    returnTitle: "Return Notice",
    returnNumber: "Return Number:",
    returnedItems: "Returned items",
    referenceInvoice: "Reference Invoice:",
  },
};

/** Receipt-template title (distinct from the classic template's plain "Invoice"/"ደረሰኝ"). */
export const RECEIPT_TITLE: Record<InvoiceLanguage, string> = {
  am: "የግዢ ደረሰኝ",
  ar: "فاتورة شراء",
  en: "Purchase Invoice",
};

/** Currency codes printed in Arabic on Arabic documents; other languages print the code as is. */
const ARABIC_CURRENCY: Record<string, string> = { SAR: "ر.س" };

/** The currency as an invoice in `language` prints it ("SAR" -> "ر.س" in Arabic). */
export function currencyLabel(currency: string, language: InvoiceLanguage): string {
  return language === "ar" ? ARABIC_CURRENCY[currency.toUpperCase()] ?? currency : currency;
}
