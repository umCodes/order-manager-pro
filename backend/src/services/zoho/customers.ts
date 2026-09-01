import { getAppliedInvoices } from "../../utils/getAppliedInvoices.js";
import { ZohoApi } from "./client.js"
import { ZohoGetInvoices } from "./invoices.js";

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



/** Adds a new contact person to an existing Zoho contact. */
export async function ZohoAddContactPerson(headers: string, customerId: string, payload: ContactPersonPayload) {
    try {
        const response = await ZohoApi(`contacts/${customerId}/contactpersons`, headers, "POST", payload)
        if (response.code !== 0) {
            throw new Error(response.message || "Zoho rejected the contact person creation");
        }
        return response.contact_person;
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
        const response = await ZohoApi(
            `contacts/${customerId}/contactpersons/${contactPersonId}`,
            headers,
            "PUT",
            payload,
        )
        if (response.code !== 0) {
            throw new Error(response.message || "Zoho rejected the contact person update");
        }
        return response.contact_person;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Deletes a contact person from a Zoho contact. */
export async function ZohoDeleteContactPerson(headers: string, customerId: string, contactPersonId: string) {
    try {
        const response = await ZohoApi(`contacts/${customerId}/contactpersons/${contactPersonId}`, headers, "DELETE")
        if (response.code !== 0) {
            throw new Error(response.message || "Zoho rejected the contact person deletion");
        }
        return true;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Marks a contact person as the primary/default contact for the customer. */
export async function ZohoMarkContactPersonPrimary(headers: string, customerId: string, contactPersonId: string) {
    try {
        const response = await ZohoApi(
            `contacts/${customerId}/contactpersons/${contactPersonId}/primary`,
            headers,
            "POST",
        )
        if (response.code !== 0) {
            throw new Error(response.message || "Zoho rejected marking the contact person as primary");
        }
        return response.contact_person;
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
            date: new Date().toISOString().slice(0, 10),
            amount,
            // date: new Date().toISOString().slice(0, 10),
            invoices: getAppliedInvoices(invoices, amount)
        })
        return response.payment;
    } catch (error) {
        console.error(error);
        throw error;
    }
}