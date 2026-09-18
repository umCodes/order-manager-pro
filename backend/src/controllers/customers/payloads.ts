import type {
    BusinessType,
    ContactPersonPayload,
    CreateCustomerPayload,
    CustomerAddress,
    CustomerType,
    PreferredLanguage,
} from "../../services/zoho/customers/index.js";

const CUSTOMER_TYPES: CustomerType[] = ["business", "individual"];
const PREFERRED_LANGUAGES: PreferredLanguage[] = ["am", "ar", "en"];
const BUSINESS_TYPES: BusinessType[] = ["Grocery", "Restaurant", "Roastry"];

/**
 * Request-body validation for the customer routes. Each parser throws a
 * plain Error whose message is what the caller sees in the 400 response.
 */

/**
 * Validates the optional business_type/address fields shared by create and
 * update. Both are optional (older customers may not have them yet), but
 * whatever is provided must be well-formed.
 */
function parseOptionalBusinessFields(body: any): { business_type?: BusinessType; address?: CustomerAddress } {
    const { business_type, address } = body ?? {};

    const result: { business_type?: BusinessType; address?: CustomerAddress } = {};

    if (business_type !== undefined && business_type !== null && business_type !== "") {
        if (!BUSINESS_TYPES.includes(business_type)) {
            throw new Error("business_type must be 'Grocery', 'Restaurant', or 'Roastry'")
        }
        result.business_type = business_type;
    }

    if (address !== undefined && address !== null) {
        const { city, district, street } = address ?? {};
        if (typeof city !== "string" || typeof district !== "string" || typeof street !== "string") {
            throw new Error("address must include city, district, and street")
        }
        result.address = { city, district, street };
    }

    return result;
}

/** Validates the payload for creating a new customer, including its initial (primary) contact person. */
export function parseCreateCustomerPayload(body: any): CreateCustomerPayload {
    const { contact_name, company_name, customer_sub_type, preferred_language, contact_persons } = body ?? {};

    if (!contact_name) throw new Error("Contact name is required")
    if (!company_name) throw new Error("Company name is required")
    if (!Array.isArray(contact_persons) || contact_persons.length === 0 || !contact_persons[0]?.phone) {
        throw new Error("Phone is required")
    }
    if (!CUSTOMER_TYPES.includes(customer_sub_type)) throw new Error("customer_sub_type must be 'business' or 'individual'")
    if (!PREFERRED_LANGUAGES.includes(preferred_language)) throw new Error("preferred_language must be 'am', 'ar', or 'en'")

    return {
        contact_name,
        company_name,
        customer_sub_type,
        preferred_language,
        contact_persons,
        ...parseOptionalBusinessFields(body),
    }
}

/** Validates the payload for updating a customer's top-level fields (name/company/type/language/business_type/address only). */
export function parseUpdateCustomerPayload(body: any): CreateCustomerPayload {
    const { contact_name, company_name, customer_sub_type, preferred_language } = body ?? {};

    if (!contact_name) throw new Error("Contact name is required")
    if (!company_name) throw new Error("Company name is required")
    if (!CUSTOMER_TYPES.includes(customer_sub_type)) throw new Error("customer_sub_type must be 'business' or 'individual'")
    if (!PREFERRED_LANGUAGES.includes(preferred_language)) throw new Error("preferred_language must be 'am', 'ar', or 'en'")

    return {
        contact_name,
        company_name,
        customer_sub_type,
        preferred_language,
        contact_persons: [],
        ...parseOptionalBusinessFields(body),
    }
}

/** Validates one contact person's name/phone, trimming both. */
export function parseContactPersonPayload(body: any): ContactPersonPayload & { first_name: string; phone: string } {
    const { first_name, phone, is_primary_contact } = body ?? {};
    if (!first_name || !String(first_name).trim()) throw new Error("Contact name is required")
    if (!phone || !String(phone).trim()) throw new Error("Phone is required")
    return { first_name: String(first_name).trim(), phone: String(phone).trim(), ...(is_primary_contact ? { is_primary_contact: true } : {}) }
}
