export type CustomerType = "business" | "individual";
export type PreferredLanguage = "am" | "ar" | "en";
export type BusinessType = "Grocery" | "Restaurant" | "Roastry";

/** A customer's address, as entered on the customer form. */
export type CustomerAddress = {
    city: string;
    district: string;
    street: string;
};

/** Payload for creating or updating a customer. */
export type CreateCustomerPayload = {
    contact_name: string;
    company_name: string;
    customer_sub_type: CustomerType;
    preferred_language: PreferredLanguage;
    business_type?: BusinessType;
    address?: CustomerAddress;
    /** Zoho stores phone on the contact person, not the contact itself; the caller builds this entry. */
    contact_persons: { first_name: string; phone: string; is_primary_contact?: boolean }[];
};

/** One entry of a customer's contact_persons list. */
export type ContactPersonPayload = {
    first_name: string;
    phone?: string;
    mobile?: string;
    is_primary_contact?: boolean;
};
