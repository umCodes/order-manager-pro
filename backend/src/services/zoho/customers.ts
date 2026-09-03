import { getAppliedInvoices } from "../../utils/getAppliedInvoices.js";
import { ZohoApi } from "./client.js"
import { ZohoGetInvoices } from "./invoices.js";
import { todayInBusinessTimezone } from "../../utils/businessDate.js";

export async function ZohoGetCustomers(headers: string){

    try {
        const response = await ZohoApi("contacts", headers)
        return response.contacts;
    } catch (error) {
        console.error(error);
        throw error;
    }
}



export async function ZohoGetCustomerById(headers: string, customerId: string){

    try {
        const response = await ZohoApi(`contacts/${customerId}`, headers)
        return response.contact;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** customfield_id for the "preferred_language" custom field on contacts, in this Zoho org. */
const PREFERRED_LANGUAGE_CUSTOMFIELD_ID = "4645478000004349196";

export type CustomerType = "business" | "individual";
export type PreferredLanguage = "am" | "ar" | "en";

export type CreateCustomerPayload = {
    contact_name: string;
    company_name: string;
    customer_sub_type: CustomerType;
    preferred_language: PreferredLanguage;
    /** Zoho stores phone on the contact person, not the contact itself; the caller builds this entry. */
    contact_persons: { first_name: string; phone: string; is_primary_contact?: boolean }[];
};

export type ContactPersonPayload = {
    first_name: string;
    phone?: string;
    mobile?: string;
    is_primary_contact?: boolean;
};

const PREFERRED_LANGUAGES: PreferredLanguage[] = ["am", "ar", "en"];

/**
 * Resolves the phone number to notify for a customer: the primary contact
 * person's phone/mobile if one is flagged, otherwise the first contact
 * person's (only considering contacts that actually have a phone/mobile on
 * file), falling back to the legacy top-level phone/mobile fields.
 */
export function getContactPhone(contact: any): string | undefined {
    const persons: any[] = (contact?.contact_persons ?? []).filter((cp: any) => cp?.phone || cp?.mobile)
    const primary = persons.find((cp) => cp?.is_primary_contact) ?? persons[0]
    return primary?.phone || primary?.mobile || contact?.mobile || contact?.phone
}

/**
 * Sentinel id the frontend uses for a synthetic contact it synthesizes for
 * customers that predate the contact persons list (legacy top-level
 * phone/mobile only, no real contact_persons entries) — see
 * LEGACY_CONTACT_ID in frontend/src/lib/contacts.ts. Not a real Zoho id.
 */
const LEGACY_CONTACT_ID = "legacy"

/**
 * Resolves the phone number for a specific contact person by id, scoped to
 * this customer's own contact list — used to safely honor a caller-selected
 * "notify this contact" choice without trusting a raw phone number from the
 * client. Falls back to the legacy top-level phone/mobile fields when the id
 * is the legacy-contact sentinel. Returns undefined if nothing matches.
 */
export function getContactPhoneById(contact: any, contactPersonId: string): string | undefined {
    if (contactPersonId === LEGACY_CONTACT_ID) return contact?.phone || contact?.mobile

    const persons: any[] = contact?.contact_persons ?? []
    const match = persons.find((cp) => String(cp?.contact_person_id) === String(contactPersonId))
    return match?.phone || match?.mobile
}

/** Reads the "preferred_language" custom field off a fetched Zoho contact, falling back to Amharic if unset/invalid. */
export function getContactPreferredLanguage(contact: any): PreferredLanguage {
    const field = contact?.custom_fields?.find(
        (cf: any) => String(cf.customfield_id ?? cf.field_id) === PREFERRED_LANGUAGE_CUSTOMFIELD_ID,
    )
    const value = field?.value
    return PREFERRED_LANGUAGES.includes(value) ? value : "am"
}

export async function ZohoCreateCustomer(headers: string, payload: CreateCustomerPayload){

    try {
        const response = await ZohoApi("contacts", headers, "POST", {
            contact_name: payload.contact_name,
            company_name: payload.company_name,
            customer_sub_type: payload.customer_sub_type,
            contact_persons: payload.contact_persons,
            custom_fields: [
                { customfield_id: PREFERRED_LANGUAGE_CUSTOMFIELD_ID, value: payload.preferred_language },
            ],
        })
        if (response.code !== 0) {
            throw new Error(response.message || "Zoho rejected the contact creation");
        }
        return response.contact;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Updates the customer's top-level fields (name, company, type, language).
 * Deliberately omits `contact_persons` — Zoho would otherwise replace the
 * customer's entire contact list with whatever single entry is passed here,
 * wiping out any additional contacts managed separately via the
 * contactpersons sub-resource endpoints (see ZohoAddContactPerson etc.).
 */
export async function ZohoUpdateCustomer(headers: string, customerId: string, payload: CreateCustomerPayload){

    try {
        const response = await ZohoApi(`contacts/${customerId}`, headers, "PUT", {
            contact_name: payload.contact_name,
            company_name: payload.company_name,
            customer_sub_type: payload.customer_sub_type,
            custom_fields: [
                { customfield_id: PREFERRED_LANGUAGE_CUSTOMFIELD_ID, value: payload.preferred_language },
            ],
        })
        if (response.code !== 0) {
            throw new Error(response.message || "Zoho rejected the contact update");
        }
        return response.contact;
    } catch (error) {
        console.error(error);
        throw error;
    }
}



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

type PaymentMode = "cash" | "creditcard" | "banktransfer"


export async function recordCustomerPayment(headers: string, customerId: string, amount: number, paymentMode: PaymentMode = "cash"){

    try {
        const invoices = await ZohoGetInvoices(headers, { customer_id: customerId })
        const response = await ZohoApi("customerpayments", headers, "POST", {
            customer_id: customerId,
            payment_mode: paymentMode,
            date: todayInBusinessTimezone(),
            amount,
            invoices: getAppliedInvoices(invoices, amount)
        })
        return response.payment;
    } catch (error) {
        console.error(error);
        throw error;
    }
}