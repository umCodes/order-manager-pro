import type { CatalogItem, Contact, DraftInvoice, DraftLineItemSummary, InvoiceDetail } from "../types";
import { cachedFetch, invalidateCache } from "./requestCache";

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

async function fetchItemsUncached(): Promise<CatalogItem[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/items`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch items (${response.status})`);
  }
  const data = await response.json();

  return data.items;
}

export function fetchItems(options?: { force?: boolean }): Promise<CatalogItem[]> {
  if (options?.force) invalidateCache("items");
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

export type CustomerType = "business" | "individual";
export type PreferredLanguage = "am" | "ar" | "en";

export type CreateCustomerPayload = {
  contact_name: string;
  company_name: string;
  customer_sub_type: CustomerType;
  preferred_language: PreferredLanguage;
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

/** customfield_id for the "preferred_language" custom field on contacts, in this Zoho org. */
export const PREFERRED_LANGUAGE_CUSTOMFIELD_ID = "4645478000004349196";

/** Reads a contact's raw preferred_language custom field, or undefined if unset/invalid — no fallback. */
export function getRawContactPreferredLanguage(contact: Contact): PreferredLanguage | undefined {
  const field = contact.custom_fields?.find(
    (cf) => (cf.customfield_id ?? cf.field_id) === PREFERRED_LANGUAGE_CUSTOMFIELD_ID,
  );
  const value = field?.value;
  return value === "am" || value === "ar" || value === "en" ? value : undefined;
}

/** Reads a contact's preferred_language custom field, falling back to Amharic if unset/invalid. */
export function getContactPreferredLanguage(contact: Contact): PreferredLanguage {
  return getRawContactPreferredLanguage(contact) ?? "am";
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
  notifyContactId?: string,
) {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      notify: !!notify,
      ...(notifyContactId ? { notify_contact_id: notifyContactId } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to record payment (${response.status})`);
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
  line_items: InvoiceLineItemPayload[];
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

/** URL for the invoice's PDF, meant to be opened directly (new tab) rather than fetched via JS. */
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

/** Persists edited line items on an existing invoice. Must always include the full current set of line items. */
export async function updateInvoiceLineItems(
  invoiceId: string,
  lineItems: UpdateLineItemPayload[],
): Promise<InvoiceDetail> {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/line-items`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ line_items: lineItems }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update invoice line items (${response.status})`);
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

export async function recordInvoicePayment(
  invoiceId: string,
  amount: number,
  discount?: number,
  notify?: boolean,
  notifyContactId?: string,
) {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      ...(discount ? { discount } : {}),
      notify: !!notify,
      ...(notifyContactId ? { notify_contact_id: notifyContactId } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to record payment (${response.status})`);
  }

  return response.json();
}

export async function markInvoiceAsSent(invoiceId: string, notify?: boolean, notifyContactId?: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/status/sent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ notify: !!notify, ...(notifyContactId ? { notify_contact_id: notifyContactId } : {}) }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to mark invoice as sent (${response.status})`);
  }

  return response.json();
}

export async function updateInvoiceDate(invoiceId: string, date: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/date`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ date }),
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