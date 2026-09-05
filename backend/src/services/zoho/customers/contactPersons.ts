import { ZohoApi } from "../client.js"
import { ZohoGetCustomerById } from "./customers.js"
import type { ContactPersonPayload } from "./types.js"

/**
 * Zoho Invoice v3's `contacts/{id}/contactpersons` sub-resource is read-only
 * (GET only — POST/PUT/DELETE on it return code 37, "method not allowed").
 * The only way to add/edit/remove/promote a contact person is to PUT the
 * customer's entire `contact_persons` array back to `contacts/{id}`, the same
 * endpoint ZohoUpdateCustomer uses for top-level fields. These helpers fetch
 * the current array, apply one change in memory, and PUT the whole thing back.
 */
async function replaceContactPersons(headers: string, customerId: string, contactPersons: any[]) {
    // Zoho rejects `is_primary_contact: false` outright ("Invalid value passed
    // for is_primary_contact") — it only accepts the field when `true`, and
    // otherwise auto-derives primary status. So it must be omitted, never
    // sent as false, on every entry we're not explicitly promoting.
    const sanitized = contactPersons.map(({ is_primary_contact, ...rest }) =>
        is_primary_contact ? { ...rest, is_primary_contact: true } : rest,
    )
    const response = await ZohoApi(`contacts/${customerId}`, headers, "PUT", { contact_persons: sanitized })
    if (response.code !== 0) {
        throw new Error(response.message || "Zoho rejected the contact person update");
    }
    return response.contact as any;
}

/** Adds a new contact person to an existing Zoho contact. */
export async function ZohoAddContactPerson(headers: string, customerId: string, payload: ContactPersonPayload) {
    try {
        const existing = await ZohoGetCustomerById(headers, customerId)
        const currentPersons: any[] = existing?.contact_persons ?? []
        const nextPersons = payload.is_primary_contact
            ? [...currentPersons.map((cp) => ({ ...cp, is_primary_contact: undefined })), payload]
            : [...currentPersons, payload]

        const updated = await replaceContactPersons(headers, customerId, nextPersons)
        const created = (updated?.contact_persons ?? []).find(
            (cp: any) => !currentPersons.some((existingCp) => String(existingCp.contact_person_id) === String(cp.contact_person_id)),
        )
        return created ?? updated?.contact_persons?.at(-1);
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Updates an existing contact person's name/phone. */
export async function ZohoUpdateContactPerson(
    headers: string,
    customerId: string,
    contactPersonId: string,
    payload: Partial<ContactPersonPayload>,
) {
    try {
        const existing = await ZohoGetCustomerById(headers, customerId)
        const currentPersons: any[] = existing?.contact_persons ?? []
        if (!currentPersons.some((cp) => String(cp.contact_person_id) === String(contactPersonId))) {
            throw new Error("Contact person not found")
        }

        const nextPersons = currentPersons.map((cp) =>
            String(cp.contact_person_id) === String(contactPersonId) ? { ...cp, ...payload } : cp,
        )

        const updated = await replaceContactPersons(headers, customerId, nextPersons)
        return (updated?.contact_persons ?? []).find((cp: any) => String(cp.contact_person_id) === String(contactPersonId));
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Deletes a contact person from a Zoho contact. */
export async function ZohoDeleteContactPerson(headers: string, customerId: string, contactPersonId: string) {
    try {
        const existing = await ZohoGetCustomerById(headers, customerId)
        const currentPersons: any[] = existing?.contact_persons ?? []
        if (!currentPersons.some((cp) => String(cp.contact_person_id) === String(contactPersonId))) {
            throw new Error("Contact person not found")
        }

        const nextPersons = currentPersons.filter((cp) => String(cp.contact_person_id) !== String(contactPersonId))
        await replaceContactPersons(headers, customerId, nextPersons)
        return true;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Marks a contact person as the primary/default contact for the customer. */
export async function ZohoMarkContactPersonPrimary(headers: string, customerId: string, contactPersonId: string) {
    try {
        const existing = await ZohoGetCustomerById(headers, customerId)
        const currentPersons: any[] = existing?.contact_persons ?? []
        if (!currentPersons.some((cp) => String(cp.contact_person_id) === String(contactPersonId))) {
            throw new Error("Contact person not found")
        }

        const nextPersons = currentPersons.map((cp) => ({
            ...cp,
            is_primary_contact: String(cp.contact_person_id) === String(contactPersonId),
        }))

        const updated = await replaceContactPersons(headers, customerId, nextPersons)
        return (updated?.contact_persons ?? []).find((cp: any) => String(cp.contact_person_id) === String(contactPersonId));
    } catch (error) {
        console.error(error);
        throw error;
    }
}
