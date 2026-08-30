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
    contact_persons: { first_name: string; phone: string }[];
};

const PREFERRED_LANGUAGES: PreferredLanguage[] = ["am", "ar", "en"];

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

export async function ZohoUpdateCustomer(headers: string, customerId: string, payload: CreateCustomerPayload){

    try {
        const response = await ZohoApi(`contacts/${customerId}`, headers, "PUT", {
            contact_name: payload.contact_name,
            company_name: payload.company_name,
            customer_sub_type: payload.customer_sub_type,
            contact_persons: payload.contact_persons,
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