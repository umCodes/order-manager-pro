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

export async function fetchCustomerDraftToMergeInto(customerId: string): Promise<InvoiceDetail | null> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/invoices/draft-to-merge-into`);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch customer's draft invoice (${response.status})`);
  }

  const data = await response.json();
  return data.draft;
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

export async function recordCustomerPayment(customerId: string, amount: number) {
  const response = await apiFetch(`${API_BASE_URL}/api/customers/${customerId}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to record payment (${response.status})`);
  }

  return response.json();
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

export async function recordInvoicePayment(invoiceId: string, amount: number) {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to record payment (${response.status})`);
  }

  return response.json();
}

export async function markInvoiceAsSent(invoiceId: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/invoices/${invoiceId}/status/sent`, {
    method: "POST",
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