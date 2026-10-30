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
  /** Credit not used yet (e.g. a return when nothing was owed); taken off the next invoices automatically. */
  unused_credits_receivable_amount?: number;
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
  /** The item's Zoho Inventory category, or null when it has none. */
  category?: string | null;
};

export type CartLine = {
  description: string;
  rate: number;
  quantity: number;
  excludeFromTelegram: boolean;
  /** The line's unit when it differs from the catalog item's (general items, chosen in Settings); unset = the item's own unit. */
  unit?: string;
  /** invoice_id of the draft this line was loaded from, if any. Unset for manually-added lines. */
  fromDraftId?: string;
  /**
   * The line's item when its cart key isn't the item id: a second (third…)
   * line of the same item, keyed "<item_id>~2" and so on. General items
   * (Settings) can be added any number of times this way. Unset = the key.
   */
  item_id?: string;
};

/** Lines by cart key: an item's id, or "<item_id>~n" for its extra lines (see CartLine.item_id). */
export type Cart = Record<string, CartLine>;

export type InvoiceLineItem = CartLine & {
  /** The line's key in the cart. */
  cartKey: string;
  item_id: string;
  name: string;
  unit: string;
};

export type TabKey = "invoices" | "messages" | "drafts" | "items" | "customers";

/** "new" always creates a fresh invoice; "update" edits a specific existing draft, chosen by invoice number. */
/** "items" sends only the item list to Telegram — no invoice, no customer. */
export type InvoiceMode = "new" | "update" | "items";

/**
 * One row of a customer's payments list: a recorded payment, or a return
 * whose credit was used against their invoices ("return_credit" — numbered
 * by its credit note), which lowers the balance the same way.
 */
export type CustomerPayment = {
  payment_id: string;
  payment_number?: string;
  date: string;
  amount: number;
  payment_mode?: string;
  kind?: "payment" | "return_credit";
};

export type DraftInvoice = {
  invoice_id: string;
  invoice_number: string;
  company_name: string;
  customer_name: string;
  status: string;
  date: string;
  total: number;
  customer_id?: string;
  /**
   * The customer's own custom fields (address, business type, preferred
   * language, ...), attached by the drafts endpoint. Only present on the
   * main drafts list, not other DraftInvoice-shaped lists.
   */
  customer_custom_fields?: ContactCustomField[];
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
  /** The source draft's scheduled (invoice) date. */
  date: string;
  quantity: number;
  unit: string;
  /** Set client-side when the draft's date has passed and it's shown under today instead. */
  isCarriedOver?: boolean;
};

export type DraftLineItemSummary = {
  name: string;
  description: string;
  quantity: number;
  unit: string;
  /** The item's Zoho Inventory category, or null when it has none. */
  category: string | null;
  breakdown: DraftItemBreakdownEntry[];
};

/** Items posted to Telegram without an invoice ("Items Only"), kept 30 days under a BK- id. */
export type BackupList = {
  id: string;
  created_at: string;
  items: { number: number; item_id: string; name: string; description: string; quantity: number; unit: string }[];
  message_id: number | null;
};

/**
 * An item reported short in the preparers' Telegram group (`3 M` / `3 5`
 * replies to the order's message): what the order needs now, what's
 * available, and each report behind it — as the Telegram message counts it,
 * in `unit` (kg, or "pcs" for a pack). Listed as long as it has a report,
 * even once it's no longer short.
 */
export type OrderShortageItem = {
  number: number;
  item_id: string;
  /** The Zoho item id, plus "|description" for a general item. */
  item_key: string;
  description: string;
  unit: "kg" | "pcs";
  ordered: number;
  available: number;
  short: number;
  reports: {
    message_id: number;
    from: { id: number | null; name: string; username: string | null };
    sent_at: string;
    updated_at: string;
    edited: boolean;
    /** The line as typed, e.g. "3 5". */
    line: string;
    /** The quantity on the message it replied to, and what was reported available of it. */
    ordered: number;
    available: number;
    missing: boolean;
  }[];
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