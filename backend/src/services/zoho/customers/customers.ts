import { ZohoApi } from "../client.js"
import { PREFERRED_LANGUAGE_CUSTOMFIELD_ID } from "./constants.js"
import type { CreateCustomerPayload } from "./types.js"

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
