/**
 * Zoho requires a `reason` on any update to an invoice that's no longer a
 * draft. The app sends a specific one (what changed); these fall back to a
 * generic description so an update never fails just for lacking a reason.
 */
const MAX_REASON_LENGTH = 250;

export function invoiceUpdateReason(provided: unknown, fallback: string): string {
    const reason = typeof provided === "string" && provided.trim() ? provided.trim() : fallback;
    return reason.length > MAX_REASON_LENGTH ? `${reason.slice(0, MAX_REASON_LENGTH - 1)}…` : reason;
}
