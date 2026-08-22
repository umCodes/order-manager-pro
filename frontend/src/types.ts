export type ContactPerson = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  mobile: string;
};

export type Contact = {
  contact_id: string;
  contact_name: string;
  company_name: string;
  outstanding_receivable_amount: number;
  contact_persons: ContactPerson[];
  phone: string;
  mobile: string;
  status: string;
};

export type ScheduledDate = string | null;

export type CatalogItem = {
  item_id: string;
  name: string;
  description: string;
  unit: string;
  rate: number;
};

export type CartLine = {
  description: string;
  rate: number;
  quantity: number;
  excludeFromTelegram: boolean;
};

export type Cart = Record<string, CartLine>;

export type InvoiceLineItem = CartLine & {
  item_id: string;
  name: string;
  unit: string;
};

export type TabKey = "invoices" | "messages" | "drafts" | "items" | "customers";

export type DraftInvoice = {
  invoice_id: string;
  invoice_number: string;
  company_name: string;
  customer_name: string;
  status: string;
  date: string;
  total: number;
};

export type InvoiceDetailLineItem = {
  line_item_id: string;
  item_id: string;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  item_total: number;
};

export type DraftItemBreakdownEntry = {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  quantity: number;
  unit: string;
};

export type DraftLineItemSummary = {
  name: string;
  description: string;
  quantity: number;
  unit: string;
  breakdown: DraftItemBreakdownEntry[];
};

export type InvoiceDetail = {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  status: string;
  date: string;
  currency_symbol: string;
  sub_total: number;
  total: number;
  balance: number;
  line_items: InvoiceDetailLineItem[];
};