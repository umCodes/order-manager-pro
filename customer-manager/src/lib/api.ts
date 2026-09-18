import type { Contact } from "../types";

/**
 * Thin fetch wrappers over the order-manager-pro backend's customer API —
 * the same backend the main app talks to. This app only adds a focused UI
 * on top of the existing customer endpoints; it introduces no new backend.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "ngrok-skip-browser-warning": "true",
      ...init?.headers,
    },
  });
}

/** Pings the backend's root-level health check — used once on load to detect a sleeping Render instance waking up. */
export async function fetchServerHealth(): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new Error(`Server health check failed (${response.status})`);
}

export async function fetchCustomers(): Promise<Contact[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/customers`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch customers (${response.status})`);
  }
  const data = await response.json();
  return data.customers;
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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

/** customfield_id for the "business_type" custom field on contacts, in this Zoho org. */
export const BUSINESS_TYPE_CUSTOMFIELD_ID = "4645478000004558014";

/** customfield_id for the "address" custom field on contacts (stores "city, district, street"), in this Zoho org. */
export const ADDRESS_CUSTOMFIELD_ID = "4645478000004558007";

function readCustomField(contact: Contact, customfieldId: string): string | undefined {
  const field = contact.custom_fields?.find((cf) => (cf.customfield_id ?? cf.field_id) === customfieldId);
  return typeof field?.value === "string" && field.value ? field.value : undefined;
}

/** Reads a contact's preferred_language custom field, falling back to Amharic if unset/invalid. */
export function getContactPreferredLanguage(contact: Contact): PreferredLanguage {
  const value = readCustomField(contact, PREFERRED_LANGUAGE_CUSTOMFIELD_ID);
  return value === "am" || value === "ar" || value === "en" ? value : "am";
}

/** Reads a contact's raw business_type custom field, or undefined if unset. */
export function getRawContactBusinessType(contact: Contact): BusinessType | undefined {
  const value = readCustomField(contact, BUSINESS_TYPE_CUSTOMFIELD_ID);
  return value === "Grocery" || value === "Restaurant" || value === "Roastry" ? value : undefined;
}

/** Reads a contact's raw "address" custom field value ("city, district, street"), or undefined if unset. */
export function getRawContactAddress(contact: Contact): string | undefined {
  return readCustomField(contact, ADDRESS_CUSTOMFIELD_ID);
}
