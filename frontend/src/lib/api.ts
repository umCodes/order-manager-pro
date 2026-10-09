import type { CatalogItem, Contact, CustomerPayment, DraftInvoice, DraftLineItemSummary, InvoiceDetail, PrepOrder } from "../types";
import { cachedFetch, invalidateCache, updateCachedValue } from "./requestCache";

/**
 * Thin fetch wrappers over the backend REST API. Every function throws an
 * Error (using the response body's `error` field when present) on a
 * non-2xx response, so callers can rely on try/catch or .catch() alone.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

/**
 * fetch wrapper that adds the ngrok-skip-browser-warning header so requests
 * through an ngrok tunnel reach the API directly instead of ngrok's HTML
 * browser-warning interstitial (which has no CORS headers and reads as a
 * CORS failure in devtools).
 */
function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "ngrok-skip-browser-warning": "true",
      ...init?.headers,
    },
  });
}

/**
 * Pings the backend's root-level health check — no /api prefix, no auth, no
 * Zoho/Redis dependency. Used once on app load to detect a sleeping Render
 * instance waking up, ahead of any real data fetch.
 */
export async function fetchServerHealth(): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new Error(`Server health check failed (${response.status})`);
}

async function fetchItemsUncached(): Promise<CatalogItem[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/items`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch items (${response.status})`);
  }
  const data = await response.json();

  return data.items;
}

/**
 * Clears the PWA service worker's copy of the items list. `/api/items` is
 * served CacheFirst from the "api-cache" cache (see vite.config.ts), so
 * without this a forced refetch would still get the stale cached catalog.
 */
async function clearItemsServiceWorkerCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open("api-cache");
    const keys = await cache.keys();
    await Promise.all(
      keys.filter((request) => new URL(request.url).pathname.startsWith("/api/items")).map((request) => cache.delete(request)),
    );
  } catch {
    // Cache API unavailable (e.g. private mode) — nothing to clear.
  }
}

export function fetchItems(options?: { force?: boolean }): Promise<CatalogItem[]> {
  if (options?.force) {
    invalidateCache("items");
    return cachedFetch("items", () => clearItemsServiceWorkerCache().then(fetchItemsUncached));
  }
  return cachedFetch("items", fetchItemsUncached);
}

async function fetchCustomersUncached(): Promise<Contact[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch customers (${response.status})`);
  }

  const data = await response.json();
  return data.customers;
}

export function fetchCustomers(options?: { force?: boolean }): Promise<Contact[]> {
  if (options?.force) invalidateCache("customers");
  return cachedFetch("customers", fetchCustomersUncached);
}

/**
 * Fetches one customer fresh from the server and writes it back into the
 * cached customers list, so anything reading balances from that list (e.g.
 * the invoice details page) sees the update without reloading the whole list.
 */
export async function refreshCachedCustomer(customerId: string): Promise<Contact> {
  const customer = await fetchCustomerById(customerId);
  updateCachedValue<Contact[]>("customers", (customers) =>
    customers.map((c) => (c.contact_id === customerId ? { ...c, ...customer } : c)),
  );
  return customer;
}

export type CustomerType = "business" | "individual";
export type PreferredLanguage = "am" | "ar" | "en";
export type BusinessType = "Grocery" | "Restaurant" | "Roastry";

export type CreateCustomerPayload = {
  contact_name: string;
  company_name: string;
  customer_sub_type: CustomerType;
  preferred_language: PreferredLanguage;
  business_type: BusinessType;
  address: { city: string; district: string; street: string; location_link: string };
  /** Zoho stores phone on the contact person, not the contact itself. */
  contact_persons: { first_name: string; phone: string }[];
};

export async function createCustomer(payload: CreateCustomerPayload): Promise<Contact> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to create customer (${response.status})`);
  }

  const data = await response.json();
  return data.customer;
}

export async function updateCustomer(customerId: string, payload: CreateCustomerPayload): Promise<Contact> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update customer (${response.status})`);
  }

  const data = await response.json();
  return data.customer;
}

/** Marks a customer active or inactive. */
export async function setCustomerActive(customerId: string, active: boolean): Promise<Contact> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ active }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update customer status (${response.status})`);
  }

  const data = await response.json();
  // The customer list (fetchCustomers) is cached and has no other way to learn
  // its active/inactive filter just went stale, so drop it here rather than
  // leaving it to whichever page happens to show the list next.
  invalidateCache("customers");
  return data.customer;
}

/**
 * Anything carrying a contact's custom fields — a full Contact, or just the
 * `custom_fields` attached to a draft invoice (see DraftInvoice.customer_custom_fields).
 */
export type CustomFieldsHolder = Pick<Contact, "custom_fields">;

/** customfield_id for the "preferred_language" custom field on contacts, in this Zoho org. */
export const PREFERRED_LANGUAGE_CUSTOMFIELD_ID = "4645478000004349196";

/** Reads a contact's raw preferred_language custom field, or undefined if unset/invalid — no fallback. */
export function getRawContactPreferredLanguage(contact: CustomFieldsHolder): PreferredLanguage | undefined {
  const field = contact.custom_fields?.find(
    (cf) => (cf.customfield_id ?? cf.field_id) === PREFERRED_LANGUAGE_CUSTOMFIELD_ID,
  );
  const value = field?.value;
  return value === "am" || value === "ar" || value === "en" ? value : undefined;
}

/** Reads a contact's preferred_language custom field, falling back to Amharic if unset/invalid. */
export function getContactPreferredLanguage(contact: CustomFieldsHolder): PreferredLanguage {
  return getRawContactPreferredLanguage(contact) ?? "am";
}

/** customfield_id for the "business_type" custom field on contacts, in this Zoho org. */
export const BUSINESS_TYPE_CUSTOMFIELD_ID = "4645478000004558014";

/** Reads a contact's raw business_type custom field, or undefined if unset. */
export function getRawContactBusinessType(contact: CustomFieldsHolder): BusinessType | undefined {
  if (!BUSINESS_TYPE_CUSTOMFIELD_ID) return undefined;
  const field = contact.custom_fields?.find(
    (cf) => (cf.customfield_id ?? cf.field_id) === BUSINESS_TYPE_CUSTOMFIELD_ID,
  );
  const value = field?.value;
  return value === "Grocery" || value === "Restaurant" || value === "Roastry" ? value : undefined;
}

/** customfield_id for the "address" custom field on contacts (stores "city, district, street"), in this Zoho org. */
export const ADDRESS_CUSTOMFIELD_ID = "4645478000004558007";

/** Reads a contact's raw "address" custom field value ("city, district, street"), or undefined if unset. */
export function getRawContactAddress(contact: CustomFieldsHolder): string | undefined {
  if (!ADDRESS_CUSTOMFIELD_ID) return undefined;
  const field = contact.custom_fields?.find(
    (cf) => (cf.customfield_id ?? cf.field_id) === ADDRESS_CUSTOMFIELD_ID,
  );
  return typeof field?.value === "string" && field.value ? field.value : undefined;
}

export async function fetchCustomerById(customerId: string): Promise<Contact> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch customer (${response.status})`);
  }

  const data = await response.json();
  return data.customer;
}

export async function fetchCustomerDraftInvoices(customerId: string): Promise<DraftInvoice[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/invoices/drafts`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch customer invoices (${response.status})`);
  }

  const data = await response.json();
  return data.drafts;
}

export async function recordCustomerPayment(
  customerId: string,
  amount: number,
  notify?: boolean,
  notifyContactIds?: string[],
) {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      notify: !!notify,
      ...(notifyContactIds?.length ? { notify_contact_ids: notifyContactIds } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to record payment (${response.status})`);
  }

  return response.json();
}

/** The customer's payments, newest first. */
export async function fetchCustomerPayments(customerId: string): Promise<CustomerPayment[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/payments`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch payments (${response.status})`);
  }

  const data = await response.json();
  return data.payments;
}

/** Sends the WhatsApp payment confirmation for one of the customer's existing payments. */
export async function sendCustomerPaymentNotification(
  customerId: string,
  paymentId: string,
  notifyContactIds?: string[],
): Promise<{ notified: boolean }> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/payments/${paymentId}/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(notifyContactIds?.length ? { notify_contact_ids: notifyContactIds } : {}),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to send notification (${response.status})`);
  }

  return response.json();
}

export type AddContactPayload = {
  first_name: string;
  phone: string;
  is_primary_contact?: boolean;
};

export async function addCustomerContact(customerId: string, payload: AddContactPayload): Promise<Contact> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/contacts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to add contact (${response.status})`);
  }

  const data = await response.json();
  return data.customer;
}

export async function updateCustomerContact(
  customerId: string,
  contactPersonId: string,
  payload: { first_name: string; phone: string },
): Promise<Contact> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/contacts/${contactPersonId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update contact (${response.status})`);
  }

  const data = await response.json();
  return data.customer;
}

export async function deleteCustomerContact(customerId: string, contactPersonId: string): Promise<Contact> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/contacts/${contactPersonId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to delete contact (${response.status})`);
  }

  const data = await response.json();
  return data.customer;
}

export async function markCustomerContactPrimary(customerId: string, contactPersonId: string): Promise<Contact> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/contacts/${contactPersonId}/primary`, {
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to set primary contact (${response.status})`);
  }

  const data = await response.json();
  return data.customer;
}

export type InvoiceLineItemPayload = {
  item_id: string;
  description: string;
  quantity: number;
  rate: number;
  unit: string;
};

export type CreateInvoicePayload = {
  contact_id: string;
  date?: string;
  invoice_id?: string;
  line_items: InvoiceLineItemPayload[];
  /** Skips the Telegram notification for this submission — Zoho invoice only. */
  skip_telegram?: boolean;
};

export async function createInvoice(payload: CreateInvoicePayload) {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to create invoice (${response.status})`);
  }

  return response.json();
}

async function fetchDraftInvoicesUncached(): Promise<DraftInvoice[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/drafts`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch draft invoices (${response.status})`);
  }

  const data = await response.json();
  return data.drafts;
}

export function fetchDraftInvoices(options?: { force?: boolean }): Promise<DraftInvoice[]> {
  if (options?.force) invalidateCache("draftInvoices");
  return cachedFetch("draftInvoices", fetchDraftInvoicesUncached);
}

export type TodayEstimate = {
  estimatedTotal: number;
  collectedToday: number;
  draftCountToday: number;
  /** Unsent drafts dated before today (shown under today) — computed live, never part of the cached estimate. */
  pastDueTotal?: number;
  pastDueCount?: number;
};

/**
 * The Drafts tab's "estimated amount for the day" plus how much of it has
 * been collected so far — computed and cached server-side (Redis) so the
 * estimate doesn't shrink as today's drafts get paid/sent. Always fetched
 * fresh (never cached client-side): it reflects payments recorded from
 * anywhere in the app, not just this tab.
 */
export async function fetchTodayEstimate(): Promise<TodayEstimate> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/estimate/today`, { cache: "no-store" });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch today's estimate (${response.status})`);
  }

  return response.json();
}

/**
 * Invoices from the last 30 days that aren't drafts — fetched all at once
 * (no pagination/lazy loading), for the Drafts tab's "Previous Transactions" view.
 */
export async function fetchRecentInvoices(): Promise<DraftInvoice[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/recent`, { cache: "no-store" });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch recent invoices (${response.status})`);
  }

  const data = await response.json();
  return data.invoices;
}

export async function sendTelegramMessage(text: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/telegram/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to send message (${response.status})`);
  }

  return response.json();
}

export async function replyToTelegramMessage(text: string, invoice_id: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/telegram/messages/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, invoice_id }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to reply to message (${response.status})`);
  }

  return response.json();
}

export type TelegramLogMessage = {
  message_id: number;
  chat_id: string;
  text: string;
  created_at: number;
  edited?: boolean;
};

/**
 * Messages sent through this app to the Telegram channel in the last 72
 * hours. There's no way for a bot to fetch a channel's full history, so
 * this list only ever covers messages this app itself sent.
 */
export async function fetchTelegramMessages(): Promise<TelegramLogMessage[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/telegram/messages`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch messages (${response.status})`);
  }

  const data = await response.json();
  return data.messages;
}

export async function editTelegramMessage(messageId: number, text: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/telegram/messages/${messageId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to edit message (${response.status})`);
  }

  return response.json();
}

export async function deleteTelegramMessage(messageId: number) {
  const response = await apiFetch(`${API_BASE_URL}/api/telegram/messages/${messageId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to delete message (${response.status})`);
  }

  return response.json();
}

/** URL for the invoice's PDF. Append `?download=1` to have it served as an attachment. */
export function invoicePdfUrl(invoiceId: string): string {
  return `${API_BASE_URL}/api/invoices/${invoiceId}/pdf`;
}

export async function fetchInvoiceById(invoiceId: string): Promise<InvoiceDetail> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch invoice (${response.status})`);
  }

  const data = await response.json();
  return data.invoice;
}

export function invoiceCacheKey(invoiceId: string) {
  return `invoice:${invoiceId}`;
}

/**
 * Cached read of an invoice's details, shared across components and kept
 * warm across remounts (e.g. navigating away from Drafts and back) so the
 * expensive per-draft prefetch in DraftsPage doesn't refetch on every visit.
 * Callers that need post-mutation freshness should use fetchInvoiceById
 * directly, or invalidate `invoiceCacheKey(invoiceId)` first.
 */
export function fetchInvoiceByIdCached(invoiceId: string): Promise<InvoiceDetail> {
  return cachedFetch(invoiceCacheKey(invoiceId), () => fetchInvoiceById(invoiceId));
}

export type UpdateLineItemPayload = {
  item_id: string;
  description: string;
  quantity: number;
  rate: number;
  unit: string;
};

/**
 * Persists edited line items on an existing invoice. Must always include the
 * full current set of line items. `reason` is required by the backend when
 * the invoice is already sent (not a draft).
 */
export async function updateInvoiceLineItems(
  invoiceId: string,
  lineItems: UpdateLineItemPayload[],
  reason?: string,
): Promise<InvoiceDetail> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/line-items`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ line_items: lineItems, ...(reason ? { reason } : {}) }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update invoice line items (${response.status})`);
  }

  const data = await response.json();
  return data.invoice;
}

/** Reassigns an invoice to a different customer. `reason` is required by the backend when the invoice is already sent. */
export async function updateInvoiceCustomer(
  invoiceId: string,
  customerId: string,
  reason?: string,
): Promise<InvoiceDetail> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/customer`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customer_id: customerId, ...(reason ? { reason } : {}) }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update invoice customer (${response.status})`);
  }

  const data = await response.json();
  return data.invoice;
}

export async function splitInvoiceToSelectedItems(
  invoiceId: string,
  selectedLineItemIds: string[],
  createNewDraft: boolean,
): Promise<InvoiceDetail> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/split`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ selected_line_item_ids: selectedLineItemIds, create_new_draft: createNewDraft }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to split invoice (${response.status})`);
  }

  const data = await response.json();
  return data.invoice;
}

/**
 * Whether the payment/balance WhatsApp notification actually went out.
 * Exactly one of the two is meaningful per call, matching which branch the
 * backend took (invoice was a draft vs. already sent) — the other stays false.
 */
export type PaymentNotifiedResult = { balance: boolean; payment: boolean };

export async function recordInvoicePayment(
  invoiceId: string,
  amount: number,
  discount?: number,
  notify?: boolean,
  notifyContactIds?: string[],
): Promise<{ payment: { date?: string } & Record<string, unknown>; notified: PaymentNotifiedResult }> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      ...(discount ? { discount } : {}),
      notify: !!notify,
      ...(notifyContactIds?.length ? { notify_contact_ids: notifyContactIds } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to record payment (${response.status})`);
  }

  return response.json();
}

export async function markInvoiceAsSent(
  invoiceId: string,
  notify?: boolean,
  notifyContactIds?: string[],
): Promise<{ invoice: InvoiceDetail; notified: boolean }> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/status/sent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ notify: !!notify, ...(notifyContactIds?.length ? { notify_contact_ids: notifyContactIds } : {}) }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to mark invoice as sent (${response.status})`);
  }

  return response.json();
}

/**
 * Re-sends just the WhatsApp notification for an invoice — never repeats
 * the payment or status change that triggered it the first time, so it's
 * safe to retry after a failed notification without side effects.
 */
export async function resendInvoiceNotification(
  invoiceId: string,
  payload: { kind: "sent" } | { kind: "payment"; amount: number; date?: string },
  notifyContactIds?: string[],
): Promise<{ notified: boolean }> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...payload, ...(notifyContactIds?.length ? { notify_contact_ids: notifyContactIds } : {}) }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to resend notification (${response.status})`);
  }

  return response.json();
}

/** `reason` is required by the backend when the invoice is already sent (not a draft). */
export async function updateInvoiceDate(invoiceId: string, date: string, reason?: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/date`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ date, ...(reason ? { reason } : {}) }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update invoice date (${response.status})`);
  }

  return response.json();
}

async function fetchDraftLineItemsUncached(): Promise<DraftLineItemSummary[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/draftitems`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch draft items (${response.status})`);
  }

  const data = await response.json();
  return data.items;
}

export function fetchDraftLineItems(options?: { force?: boolean }): Promise<DraftLineItemSummary[]> {
  if (options?.force) invalidateCache("draftLineItems");
  return cachedFetch("draftLineItems", fetchDraftLineItemsUncached);
}

export async function fetchZohoUsage(): Promise<{ date: string; count: number }> {
  const response = await apiFetch(`${API_BASE_URL}/api/zoho-usage`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch Zoho usage (${response.status})`);
  }

  return response.json();
}

export async function resendInvoiceTelegramMessage(invoiceId: string, date?: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/telegram/resend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(date ? { date } : {}),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to resend invoice (${response.status})`);
  }

  return response.json();
}
export type WhatsAppChatPreview = { text: string; timestamp: number; direction: "in" | "out" };

/** One row of the WhatsApp contact list: a customer's phone, or any other number with stored history. */
export type WhatsAppChat = {
  phone: string;
  name: string;
  /** "whatsapp": not a Zoho customer — `name` is the one they set on their WhatsApp profile. */
  name_source?: "whatsapp";
  customer_id?: string;
  /** The customer's name when `name` is a person under that customer — shown second, after the person's name. */
  customer_name?: string;
  /** Saved in the app's contact list: given a name, or linked to a customer. */
  saved?: "name" | "customer";
  /** From the customer's address, for filtering the list by city / district. */
  city?: string;
  district?: string;
  last_message?: WhatsAppChatPreview;
};

export type WhatsAppMessage = {
  id: string;
  direction: "in" | "out";
  timestamp: number;
  type: string;
  text: string;
  status?: string;
  /** WhatsApp's reason, on a failed message. */
  error?: string;
  reaction?: string;
  /** A template that failed or was never delivered, and can be sent again. */
  can_retry?: boolean;
  /** Set on image / voice / video / document messages; load with fetchWhatsAppMedia. */
  media?: { mime_type?: string; filename?: string; voice?: boolean };
  /** Id of the message this one replies to (quoted above it). */
  reply_to?: string;
};

/** A conversation's stored history, oldest first, and whether a free-form reply is allowed right now. */
export type WhatsAppConversation = {
  messages: WhatsAppMessage[];
  can_reply: boolean;
  reply_window_expires_at?: number;
};

export async function fetchWhatsAppChats(): Promise<WhatsAppChat[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/chats`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load chats (${response.status})`);
  }

  const data = await response.json();
  return data.chats;
}

/**
 * Saves a number (one that isn't a customer's own phone) to the app's
 * contact list: `{ name }` names it, `{ customer_id }` links it to a
 * customer. Resolves to its updated chat-list entry.
 */
export async function saveWhatsAppContact(
  phone: string,
  contact: { name: string } | { customer_id: string; name?: string },
): Promise<WhatsAppChat> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/contact`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Failed to save contact (${response.status})`);
  return body.chat;
}

/** Whether a number is already one of this customer's contact persons, and under what name. */
export async function lookupWhatsAppContact(
  phone: string,
  customerId: string,
): Promise<{ customer_name: string; contact: { contact_person_id: string; name: string | null } | null }> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/contact/lookup?customer_id=${encodeURIComponent(customerId)}`,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Failed to look up contact (${response.status})`);
  return body;
}

/** Removes a number's saved name / customer link. */
export async function removeWhatsAppContact(phone: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/contact`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to remove contact (${response.status})`);
  }
}

export async function fetchWhatsAppConversation(phone: string): Promise<WhatsAppConversation> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/messages`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load conversation (${response.status})`);
  }

  return response.json();
}

/** Sends a free-text reply (quoting `replyTo`, if given); resolves to the updated conversation. */
export async function sendWhatsAppChatMessage(phone: string, text: string, replyTo?: string): Promise<WhatsAppConversation> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, ...(replyTo && { reply_to: replyTo }) }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to send message (${response.status})`);
  }

  return response.json();
}

/**
 * Sends a failed / undelivered template message again. Resolves to the
 * updated conversation; if this attempt fails too, throws with WhatsApp's
 * reason and the conversation (which shows the new failed attempt) attached.
 */
export async function retryWhatsAppMessage(phone: string, messageId: string): Promise<WhatsAppConversation> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/messages/${encodeURIComponent(messageId)}/retry`,
    { method: "POST" },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? `Failed to send again (${response.status})`) as Error & {
      conversation?: WhatsAppConversation;
    };
    if (Array.isArray(body.messages)) error.conversation = body;
    throw error;
  }

  return body;
}

export type WhatsAppTemplateButton = { type: string; text: string; url?: string; phone_number?: string };

export type WhatsAppTemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: WhatsAppTemplateButton[];
  /** Meta's example values (body_text, header_text, body_text_named_params, …). */
  example?: Record<string, unknown>;
};

/** A message template on the WhatsApp Business Account, as Meta reports it. */
export type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  /** APPROVED, PENDING, REJECTED, PAUSED, DISABLED, … — only APPROVED can be sent. */
  status: string;
  category: string;
  components: WhatsAppTemplateComponent[];
  rejected_reason?: string;
};

export type NewWhatsAppTemplate = {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  /** TEXT (default) or a file sent with each message. */
  header_format?: WhatsAppTemplateHeaderFormat;
  header?: string;
  /** File headers: the sample file's handle, from uploadWhatsAppTemplateSample. */
  header_handle?: string;
  header_example?: string;
  body: string;
  body_examples?: string[];
  footer?: string;
  buttons?: (
    | { type: "QUICK_REPLY"; text: string }
    | { type: "URL"; text: string; url: string }
    | { type: "PHONE_NUMBER"; text: string; phone_number: string }
  )[];
};

/** Values for a template's variables, keyed by placeholder ("1", "2", …); `buttons` is keyed by button index. */
export type WhatsAppTemplateHeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export type WhatsAppTemplateValues = {
  header?: Record<string, string>;
  /** File headers: the file to send, from uploadWhatsAppTemplateMedia. */
  header_media?: { id: string; filename?: string };
  body?: Record<string, string>;
  buttons?: Record<string, string>;
};

export async function fetchWhatsAppTemplates(force = false): Promise<WhatsAppTemplate[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/templates${force ? "?refresh=1" : ""}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load templates (${response.status})`);
  }
  const data = await response.json();
  return data.templates;
}

/** Submits a new template for WhatsApp's review; resolves to its initial status (usually PENDING). */
export async function createWhatsAppTemplate(template: NewWhatsAppTemplate): Promise<{ id: string; status: string }> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(template),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to create template (${response.status})`);
  }
  return response.json();
}

/** Deletes a template from the WhatsApp Business Account (just this language of it). */
export async function deleteWhatsAppTemplate(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to delete template (${response.status})`);
  }
}

/** Posts a file's raw bytes to a backend upload endpoint (same as sendWhatsAppMedia does). */
async function uploadRaw(url: string, file: File) {
  const response = await apiFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? (response.status === 413 ? "File is too large" : `Upload failed (${response.status})`));
  return body;
}

/** Uploads the sample file a new template's file header needs for WhatsApp's review; resolves to its handle. */
export async function uploadWhatsAppTemplateSample(format: WhatsAppTemplateHeaderFormat, file: File): Promise<string> {
  const body = await uploadRaw(`${API_BASE_URL}/api/whatsapp/templates/sample?format=${format}`, file);
  return body.handle;
}

/** Uploads the file to send in a template's file header. */
export async function uploadWhatsAppTemplateMedia(file: File): Promise<{ id: string; filename: string }> {
  return uploadRaw(`${API_BASE_URL}/api/whatsapp/templates/media`, file);
}

/**
 * Sends an approved template to a contact (allowed any time, unlike
 * free-text replies). Resolves to the updated conversation; if WhatsApp
 * rejects it, throws with the reason and the conversation attached.
 */
export async function sendWhatsAppTemplateMessage(
  phone: string,
  template: { name: string; language: string },
  values: WhatsAppTemplateValues,
): Promise<WhatsAppConversation> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: template.name, language: template.language, values }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? `Failed to send template (${response.status})`) as Error & {
      conversation?: WhatsAppConversation;
    };
    if (Array.isArray(body.messages)) error.conversation = body;
    throw error;
  }
  return body;
}

/** Largest file the backend accepts (WhatsApp's limit for audio and video). */
export const MAX_WHATSAPP_UPLOAD_BYTES = 16 * 1024 * 1024;

/**
 * Sends a file as a WhatsApp reply: images and video show inline, an
 * Ogg/Opus recording with `voice` shows as a voice note, anything else goes
 * as a document. Resolves to the updated conversation.
 */
export async function sendWhatsAppMedia(
  phone: string,
  file: Blob,
  options: { filename: string; caption?: string; voice?: boolean; replyTo?: string },
): Promise<WhatsAppConversation> {
  const params = new URLSearchParams();
  if (options.replyTo) params.set("reply_to", options.replyTo);
  if (options.caption) params.set("caption", options.caption);
  if (options.voice) params.set("voice", "1");
  const query = params.toString();
  const response = await apiFetch(
    `${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/media${query ? `?${query}` : ""}`,
    {
      method: "POST",
      headers: {
        // Raw bytes, so the backend's JSON parser never touches the file.
        "Content-Type": "application/octet-stream",
        "X-File-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(options.filename),
      },
      body: file,
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? (response.status === 413 ? "File is too large" : `Failed to send file (${response.status})`));
  }

  return response.json();
}

/** Downloads a message's image / voice note / file (through the backend, which fetches it from WhatsApp). */
export async function fetchWhatsAppMedia(phone: string, messageId: string): Promise<Blob> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/messages/${encodeURIComponent(messageId)}/media`,
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load media (${response.status})`);
  }

  return response.blob();
}

/** Unread inbound WhatsApp messages (since each chat was last opened in the app): the total, and per chat phone. */
export type WhatsAppUnread = { total: number; chats: Record<string, number> };

export async function fetchWhatsAppUnread(): Promise<WhatsAppUnread> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/unread`);
  if (!response.ok) throw new Error(`Failed to load unread messages (${response.status})`);
  return response.json();
}

/** Marks a chat as read in the app (on every device). */
export async function markWhatsAppChatRead(phone: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/whatsapp/chats/${encodeURIComponent(phone)}/read`, { method: "POST" });
  if (!response.ok) throw new Error(`Failed to mark chat as read (${response.status})`);
}

/** An invoice item as offered for return ("Return Invoice" = a Zoho credit note). */
export type ReturnableItem = {
  item_id: string;
  name: string;
  description: string;
  unit: string;
  /** Price credited per unit (after the invoice's discounts). */
  rate: number;
  invoiced: number;
  returned: number;
  returnable: number;
};

export type InvoiceReturnSummary = {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  items: ReturnableItem[];
  returns: { creditnote_id: string; creditnote_number: string; date: string; status: string; total: number }[];
};

export type CreatedInvoiceReturn = {
  creditnote_id: string;
  creditnote_number: string;
  total: number;
  /** Credit taken off this invoice's unpaid balance. */
  applied_to_invoice: number;
  /** The rest, taken off the customer's other unpaid invoices (oldest first). */
  applied_to_other_invoices: { invoice_id: string; invoice_number: string; amount: number }[];
  /** Anything beyond what the customer owes, kept as credit on their account. */
  left_as_credit: number;
  warnings: string[];
};

/** The returns made from an invoice (cheap: no Zoho calls when there are none). */
export async function fetchInvoiceReturnList(invoiceId: string): Promise<InvoiceReturnSummary["returns"]> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/returns/list`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load returns (${response.status})`);
  }
  return (await response.json()).returns;
}

/** URL for a return's "Return Notice" PDF. Append `?download=1` to have it served as an attachment. */
export function returnNoticePdfUrl(invoiceId: string, creditNoteId: string): string {
  return `${API_BASE_URL}/api/invoices/${invoiceId}/returns/${creditNoteId}/pdf`;
}

export async function fetchInvoiceReturns(invoiceId: string): Promise<InvoiceReturnSummary> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/returns`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load returnable items (${response.status})`);
  }
  return response.json();
}

export async function createInvoiceReturn(
  invoiceId: string,
  items: { item_id: string; quantity: number }[],
  reason?: string,
): Promise<CreatedInvoiceReturn> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/returns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, ...(reason?.trim() ? { reason: reason.trim() } : {}) }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to create the return (${response.status})`);
  }
  return response.json();
}

/** Every draft with its lines and what the preparers recorded as shipped. Never cached: it changes as they work. */
export async function fetchPrepOrders(): Promise<PrepOrder[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/prep/orders`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load orders (${response.status})`);
  }

  const data = await response.json();
  return data.orders;
}

/**
 * Records what left the warehouse for some of a draft's lines (quantity null
 * clears a line back to "not done yet"). Returns every recorded line of that
 * draft, as line_item_id → quantity.
 */
export async function savePrepShipments(
  invoiceId: string,
  lines: { line_item_id: string; quantity: number | null }[],
): Promise<Record<string, number>> {
  const response = await apiFetch(`${API_BASE_URL}/api/prep/orders/${invoiceId}/shipped`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to save (${response.status})`);
  }

  const data = await response.json();
  return data.shipped;
}
