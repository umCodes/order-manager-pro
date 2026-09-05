import { LEGACY_CONTACT_ID, PREFERRED_LANGUAGE_CUSTOMFIELD_ID, PREFERRED_LANGUAGES } from "./constants.js"
import type { PreferredLanguage } from "./types.js"

/**
 * Reads details off an already-fetched Zoho contact. Pure functions — no
 * API calls — so callers that already hold a contact don't refetch it.
 */

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
