import { redisClient } from "../config/redis.js"
import { BUSINESS_UTC_OFFSET_HOURS, oneMonthFromTodayInBusinessTimezone } from "../utils/businessDate.js"

/**
 * How long a new invoice has before Zoho marks it overdue: its due date is
 * set this long after the day it's created. Either one calendar month (the
 * default) or a number of days, chosen in Settings. Only invoices created
 * after a change get the new period.
 */

export type InvoiceDueSetting = { period: "month" } | { period: "days"; days: number }

const SETTINGS_KEY = "settings:invoice-due"
const DEFAULT_SETTING: InvoiceDueSetting = { period: "month" }
export const MAX_DUE_DAYS = 365

export async function getInvoiceDueSetting(): Promise<InvoiceDueSetting> {
    const raw = await redisClient.get(SETTINGS_KEY).catch(() => null)
    if (!raw) return DEFAULT_SETTING
    try {
        const saved = JSON.parse(raw)
        return saved?.period === "days" && Number.isInteger(saved.days) ? { period: "days", days: saved.days } : DEFAULT_SETTING
    } catch {
        return DEFAULT_SETTING
    }
}

/** Validates and saves: `{ period: "month" }` or `{ period: "days", days: 0–365 }` (0 = due the day it's created). */
export async function saveInvoiceDueSetting(input: any): Promise<InvoiceDueSetting> {
    let setting: InvoiceDueSetting
    if (input?.period === "month") setting = { period: "month" }
    else if (input?.period === "days") {
        const days = Number(input.days)
        if (!Number.isInteger(days) || days < 0 || days > MAX_DUE_DAYS) throw new Error(`days must be a whole number from 0 to ${MAX_DUE_DAYS}`)
        setting = { period: "days", days }
    } else throw new Error('period must be "month" or "days"')
    await redisClient.set(SETTINGS_KEY, JSON.stringify(setting))
    return setting
}

/** The due date (YYYY-MM-DD, business calendar) for an invoice created now. */
export async function newInvoiceDueDate(): Promise<string> {
    const setting = await getInvoiceDueSetting()
    if (setting.period === "month") return oneMonthFromTodayInBusinessTimezone()
    const today = new Date(Date.now() + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    const due = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + setting.days))
    return due.toISOString().slice(0, 10)
}
