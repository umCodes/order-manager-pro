import { redisClient } from "../config/redis.js"

/**
 * What happens on WhatsApp when an invoice is marked as sent: by default its
 * message (with the PDF) goes to every contact of the customer without
 * asking; with `askBeforeSending`, the app asks whether to send and to
 * which contacts first. Chosen in Settings → Invoices.
 */
export type InvoiceSentNotifySetting = { askBeforeSending: boolean }

const SETTINGS_KEY = "settings:invoice-sent-notify"
const DEFAULT_SETTING: InvoiceSentNotifySetting = { askBeforeSending: false }

export async function getInvoiceSentNotifySetting(): Promise<InvoiceSentNotifySetting> {
    const raw = await redisClient.get(SETTINGS_KEY).catch(() => null)
    if (!raw) return DEFAULT_SETTING
    try {
        return { askBeforeSending: JSON.parse(raw)?.askBeforeSending === true }
    } catch {
        return DEFAULT_SETTING
    }
}

export async function saveInvoiceSentNotifySetting(input: any): Promise<InvoiceSentNotifySetting> {
    if (typeof input?.askBeforeSending !== "boolean") throw new Error("askBeforeSending must be true or false")
    const setting = { askBeforeSending: input.askBeforeSending }
    await redisClient.set(SETTINGS_KEY, JSON.stringify(setting))
    return setting
}
