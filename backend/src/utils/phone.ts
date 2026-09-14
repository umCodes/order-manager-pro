/**
 * Prepares a phone number for the WhatsApp Cloud API's `to` field, which
 * expects plain digits only — full country code, no leading "+", no
 * spaces/dashes/parentheses. Numbers are stored in Zoho exactly as typed
 * (e.g. "+966-50-123-4567"), so this strips everything that isn't a digit
 * and drops a leading "00" (the international dialing prefix some people
 * type instead of "+"). It does not invent a missing country code — a
 * number entered in purely local format (a leading trunk "0" with no
 * country code) is a data problem this can't safely guess its way out of,
 * since contacts span more than one country.
 */
export function normalizePhoneForSending(phone: string): string {
    const digits = String(phone).replace(/\D/g, "")
    return digits.replace(/^00/, "")
}
