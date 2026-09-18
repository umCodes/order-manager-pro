import type { BusinessType, CustomerAddress, PreferredLanguage } from "./types.js";

/** customfield_id for the "preferred_language" custom field on contacts, in this Zoho org. */
export const PREFERRED_LANGUAGE_CUSTOMFIELD_ID = "4645478000004349196";

/** The languages a contact's preferred_language field is allowed to hold. */
export const PREFERRED_LANGUAGES: PreferredLanguage[] = ["am", "ar", "en"];

/** customfield_id for the "business_type" custom field on contacts, in this Zoho org. */
export const BUSINESS_TYPE_CUSTOMFIELD_ID = "4645478000004558014";

/** The business types a contact's business_type field is allowed to hold. */
export const BUSINESS_TYPES: BusinessType[] = ["Grocery", "Restaurant", "Roastry"];

/** customfield_id for the "address" custom field on contacts (stores "city, district, street, location_link"), in this Zoho org. */
export const ADDRESS_CUSTOMFIELD_ID = "4645478000004558007";

/**
 * Joins a customer's address parts into the single string stored in the
 * "address" custom field: "city, district, street" plus, when set, a 4th
 * part with the Google Maps link. The link is appended as-is (never split),
 * so it's free to contain its own commas (e.g. coordinate query params) —
 * see parseAddress in contactDetails.ts for the matching reconstruction.
 */
export function formatAddress({ city, district, street, location_link }: CustomerAddress): string {
    const parts = [city, district, street].map((part) => part.trim());
    if (location_link?.trim()) parts.push(location_link.trim());
    return parts.join(", ");
}

/**
 * Sentinel id the frontend uses for a synthetic contact it synthesizes for
 * customers that predate the contact persons list (legacy top-level
 * phone/mobile only, no real contact_persons entries) — see
 * LEGACY_CONTACT_ID in frontend/src/lib/contacts.ts. Not a real Zoho id.
 */
export const LEGACY_CONTACT_ID = "legacy";
