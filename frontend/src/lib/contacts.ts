import type { Contact, ContactPerson } from "../types";

/**
 * Placeholder id for the synthetic contact synthesized below, for customers
 * that predate the contact persons list. Not a real Zoho id — the backend
 * recognizes this sentinel and resolves it back to the customer's legacy
 * top-level phone/mobile fields (see getContactPhoneById on the server).
 */
export const LEGACY_CONTACT_ID = "legacy";

/**
 * Normalizes a customer's contacts into a flat list of contact persons.
 * Falls back to the legacy top-level phone/mobile fields as a single
 * synthetic "primary" contact for customers that predate the contact
 * persons list (or whose contact_persons array is empty for any reason).
 */
export function getContactList(customer: Contact): ContactPerson[] {
  const persons = customer.contact_persons?.filter((cp) => cp.phone || cp.mobile) ?? [];
  if (persons.length > 0) return persons;

  const phone = customer.phone || customer.mobile;
  if (!phone) return [];

  return [
    {
      contact_person_id: LEGACY_CONTACT_ID,
      first_name: customer.contact_name || "Contact",
      last_name: "",
      email: "",
      phone: customer.phone || "",
      mobile: customer.mobile || "",
      is_primary_contact: true,
    },
  ];
}

/** The contact that should be preselected/used by default: the flagged primary, or the first contact. */
export function getPrimaryContact(customer: Contact): ContactPerson | undefined {
  const contacts = getContactList(customer);
  return contacts.find((c) => c.is_primary_contact) ?? contacts[0];
}

export function getPrimaryContactPhone(customer: Contact): string | undefined {
  const primary = getPrimaryContact(customer);
  return primary?.phone || primary?.mobile;
}
