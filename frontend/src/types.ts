export type ContactPerson = {
  contact_person_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  mobile: string;
  is_primary_contact: boolean;
};

export type ContactCustomField = {
  customfield_id?: string;
  field_id?: string;
  label?: string;
  value: string;
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
  customer_sub_type?: string;
  custom_fields?: ContactCustomField[];
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
  /** invoice_id of the draft this line was loaded from, if any. Unset for manually-added lines. */
  fromDraftId?: string;
};

export type Cart = Record<string, CartLine>;

export type InvoiceLineItem = CartLine & {
  item_id: string;
  name: string;
  unit: string;
};

export type TabKey = "invoices" | "messages" | "drafts" | "items" | "customers";

/** "new" always creates a fresh invoice; "update" edits a specific existing draft, chosen by invoice number. */
export type InvoiceMode = "new" | "update";

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
  customer_id: string;
  customer_name: string;
  status: string;
  date: string;
  currency_symbol: string;
  sub_total: number;
  total: number;
  balance: number;
  line_items: InvoiceDetailLineItem[];
};