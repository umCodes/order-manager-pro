import type { PreferredLanguage } from "./types.js";

/** customfield_id for the "preferred_language" custom field on contacts, in this Zoho org. */
export const PREFERRED_LANGUAGE_CUSTOMFIELD_ID = "4645478000004349196";

/** The languages a contact's preferred_language field is allowed to hold. */
export const PREFERRED_LANGUAGES: PreferredLanguage[] = ["am", "ar", "en"];

/**
 * Sentinel id the frontend uses for a synthetic contact it synthesizes for
 * customers that predate the contact persons list (legacy top-level
 * phone/mobile only, no real contact_persons entries) — see
 * LEGACY_CONTACT_ID in frontend/src/lib/contacts.ts. Not a real Zoho id.
 */
export const LEGACY_CONTACT_ID = "legacy";
