import { ZohoApi } from "../client.js"
import { getCache, setTTLCache } from "../../../utils/cache.js"
import {
    ADDRESS_CUSTOMFIELD_ID,
    BUSINESS_TYPE_CUSTOMFIELD_ID,
    PREFERRED_LANGUAGE_CUSTOMFIELD_ID,
    formatAddress,
} from "./constants.js"
import type { CreateCustomerPayload } from "./types.js"

/**
 * Builds the custom_fields array for a create/update request: preferred_language
 * always, plus business_type/address only when both this payload carries a
 * value and the corresponding customfield_id has been configured (empty id
 * means that custom field hasn't been set up in Zoho yet — omitting it keeps
 * the request from being rejected wholesale over an unknown field id).
 */
function buildCustomFields(payload: CreateCustomerPayload) {
    const fields: { customfield_id: string; value: string }[] = [
        { customfield_id: PREFERRED_LANGUAGE_CUSTOMFIELD_ID, value: payload.preferred_language },
    ]
    if (BUSINESS_TYPE_CUSTOMFIELD_ID && payload.business_type) {
        fields.push({ customfield_id: BUSINESS_TYPE_CUSTOMFIELD_ID, value: payload.business_type })
    }
    if (ADDRESS_CUSTOMFIELD_ID && payload.address) {
        fields.push({ customfield_id: ADDRESS_CUSTOMFIELD_ID, value: formatAddress(payload.address) })
    }
    return fields
}

/**
 * Builds the billing/shipping address Zoho stores on the contact (and pulls
 * onto invoices) from the form's city/district/street. Both addresses are
 * set to the same value — this app doesn't distinguish billing from shipping.
 */
function buildZohoAddress(address: CreateCustomerPayload["address"]) {
    if (!address) return undefined
    return {
        address: address.street,
        street2: address.district,
        city: address.city,
        country: "Saudi Arabia",
    }
}

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

/** Customer list cache lifetime: 12h, invalidated eagerly on every write (see the write/contacts controllers). */
const CUSTOMERS_CACHE_TTL_SECONDS = 43200;

/**
 * The full customer list, served from the in-memory "customers" cache when
 * it's warm (one Zoho request to fill it otherwise). Shared by the customers
 * list endpoint and anything that needs to look customers up in bulk — e.g.
 * the drafts list attaching each customer's custom fields — so those never
 * fall back to one request per customer.
 */
export async function ZohoGetCustomersCached(headers: string){
    const cached = getCache("customers")
    if (cached) return cached

    const customers = await ZohoGetCustomers(headers)
    setTTLCache("customers", customers, CUSTOMERS_CACHE_TTL_SECONDS)
    return customers
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
    const zohoAddress = buildZohoAddress(payload.address)

    try {
        const response = await ZohoApi("contacts", headers, "POST", {
            contact_name: payload.contact_name,
            company_name: payload.company_name,
            customer_sub_type: payload.customer_sub_type,
            contact_persons: payload.contact_persons,
            custom_fields: buildCustomFields(payload),
            ...(zohoAddress && { billing_address: zohoAddress, shipping_address: zohoAddress }),
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
    const zohoAddress = buildZohoAddress(payload.address)

    try {
        const response = await ZohoApi(`contacts/${customerId}`, headers, "PUT", {
            contact_name: payload.contact_name,
            company_name: payload.company_name,
            customer_sub_type: payload.customer_sub_type,
            custom_fields: buildCustomFields(payload),
            ...(zohoAddress && { billing_address: zohoAddress, shipping_address: zohoAddress }),
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
 * Marks a customer active or inactive in Zoho (its own dedicated endpoints —
 * not a field on the regular update payload). Zoho's response here doesn't
 * carry the updated contact, so the caller gets back a fresh GET instead of
 * this response.
 */
export async function ZohoSetCustomerStatus(headers: string, customerId: string, active: boolean){
    try {
        const response = await ZohoApi(`contacts/${customerId}/${active ? "active" : "inactive"}`, headers, "POST")
        if (response.code !== 0) {
            throw new Error(response.message || `Zoho rejected marking the contact ${active ? "active" : "inactive"}`);
        }
        return ZohoGetCustomerById(headers, customerId);
    } catch (error) {
        console.error(error);
        throw error;
    }
}
