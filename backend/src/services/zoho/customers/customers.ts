import { ZohoApi } from "../client.js"
import { PREFERRED_LANGUAGE_CUSTOMFIELD_ID } from "./constants.js"
import type { CreateCustomerPayload } from "./types.js"

/** Strips everything but digits, then drops a leading '00' or a leading country-exit '0' so numbers in differing formats (+2519..., 2519..., 09...) compare equal on their trailing digits. */
function normalizePhoneForMatch(phone: string): string {
    const digits = String(phone).replace(/\D/g, "")
    return digits.replace(/^00/, "").replace(/^0/, "")
}

/** Fetches every customer (Zoho "contact") in the organization. */
export async function ZohoGetCustomers(headers: string){

    try {
        const response = await ZohoApi("contacts", headers)
        return response.contacts;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Fetches one customer, including its contact_persons and custom fields. */
export async function ZohoGetCustomerById(headers: string, customerId: string){

    try {
        const response = await ZohoApi(`contacts/${customerId}`, headers)
        return response.contact;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Finds the Zoho customer (and matched contact person, if any) whose phone
 * number matches the given number — used to attribute an inbound WhatsApp
 * message (identified only by phone) to a customer. Uses Zoho's
 * `phone_contains` contact search (which matches on contact persons' phone
 * numbers, not just the top-level contact fields) to avoid fetching every
 * customer, then confirms with an exact compare on the last 9 digits to
 * tolerate country-code/leading-zero formatting differences between
 * WhatsApp's wa_id and however the number was entered in Zoho.
 */
export async function findCustomerByPhone(headers: string, phone: string): Promise<{ contact: any; contactPerson: any | undefined } | undefined> {
    const target = normalizePhoneForMatch(phone).slice(-9)
    if (!target) return undefined

    const response = await ZohoApi(`contacts?phone_contains=${encodeURIComponent(target)}`, headers)
    const candidates: any[] = response.contacts ?? []

    for (const contact of candidates) {
        const persons: any[] = contact?.contact_persons ?? []
        const matchedPerson = persons.find((cp) => {
            const candidate = cp?.phone || cp?.mobile
            return candidate && normalizePhoneForMatch(candidate).slice(-9) === target
        })
        if (matchedPerson) return { contact, contactPerson: matchedPerson }

        const legacyCandidate = contact?.phone || contact?.mobile
        if (legacyCandidate && normalizePhoneForMatch(legacyCandidate).slice(-9) === target) {
            return { contact, contactPerson: undefined }
        }
    }
    return undefined
}

/** Creates a customer along with its initial contact person(s). */
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
