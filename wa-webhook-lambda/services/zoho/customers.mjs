import { ZohoApi } from "./client.mjs";

/** Strips non-digits, then drops a leading '00' or country-exit '0' so numbers in differing formats compare equal on their trailing digits. */
function normalizePhoneForMatch(phone) {
    const digits = String(phone).replace(/\D/g, "");
    return digits.replace(/^00/, "").replace(/^0/, "");
}

/**
 * Finds the Zoho customer (and matched contact person, if any) whose phone
 * number matches the given number — used to attribute an inbound WhatsApp
 * message (identified only by phone) to a customer.
 */
export async function findCustomerByPhone(phone) {
    const target = normalizePhoneForMatch(phone).slice(-9);
    if (!target) return undefined;

    const response = await ZohoApi(`contacts?phone_contains=${encodeURIComponent(target)}`);
    const candidates = response.contacts ?? [];

    for (const contact of candidates) {
        const persons = contact?.contact_persons ?? [];
        const matchedPerson = persons.find((cp) => {
            const candidate = cp?.phone || cp?.mobile;
            return candidate && normalizePhoneForMatch(candidate).slice(-9) === target;
        });
        if (matchedPerson) return { contact, contactPerson: matchedPerson };

        const legacyCandidate = contact?.phone || contact?.mobile;
        if (legacyCandidate && normalizePhoneForMatch(legacyCandidate).slice(-9) === target) {
            return { contact, contactPerson: undefined };
        }
    }
    return undefined;
}

/** Minimal contact summary for the message-notification email: name, phone, and outstanding balance. */
export function summarizeCustomer(match) {
    if (!match) return undefined;
    const { contact, contactPerson } = match;
    return {
        name: contactPerson?.first_name
            ? `${contactPerson.first_name} ${contactPerson.last_name ?? ""}`.trim()
            : contact?.contact_name,
        companyName: contact?.company_name,
        phone: contactPerson?.phone || contactPerson?.mobile || contact?.phone || contact?.mobile,
        outstandingBalance: contact?.outstanding_receivable_amount,
    };
}
