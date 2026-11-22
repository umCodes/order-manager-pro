import { redisClient } from "../../../config/redis.js"
import { BUSINESS_UTC_OFFSET_HOURS, todayInBusinessTimezone } from "../../../utils/businessDate.js"

/**
 * Dated invoices: an invoice for a later day isn't posted to Telegram when
 * it's made. It's held here and posted at the send time (Settings, midnight
 * by default) on its day, business time. "Later" is by the calendar day,
 * not the 4am business day: an invoice for today, or with no date, goes out
 * at once as before.
 *
 *   telegram:held-invoices          sorted set: invoice id → when it's due (ms)
 *   telegram:held-invoice:<id>      JSON: the day it's for and when it was held
 *
 * Only the fact that it's held is kept, never its items: the invoice is read
 * from Zoho when it's posted, so edits made meanwhile are always included.
 */

const HELD_KEY = "telegram:held-invoices"
const heldInfoKey = (invoiceId: string) => `telegram:held-invoice:${invoiceId}`
const SETTINGS_KEY = "settings:telegram-schedule"

export type TelegramScheduleSetting = { sendTime: string }
export type HeldInvoice = { invoice_id: string; invoice_number: string; date: string; due_at: number; held_at: number }

const DEFAULT_SETTING: TelegramScheduleSetting = { sendTime: "00:00" }
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function getTelegramScheduleSetting(): Promise<TelegramScheduleSetting> {
    const raw = await redisClient.get(SETTINGS_KEY).catch(() => null)
    if (!raw) return DEFAULT_SETTING
    try {
        const sendTime = JSON.parse(raw)?.sendTime
        return TIME_PATTERN.test(sendTime) ? { sendTime } : DEFAULT_SETTING
    } catch {
        return DEFAULT_SETTING
    }
}

/** Saves the send time ("HH:MM", 24-hour, business time) and moves every held invoice to it. */
export async function saveTelegramScheduleSetting(input: any): Promise<TelegramScheduleSetting> {
    const sendTime = String(input?.sendTime ?? "")
    if (!TIME_PATTERN.test(sendTime)) throw new Error("sendTime must be a time like 00:00 or 01:30")
    const setting = { sendTime }
    await redisClient.set(SETTINGS_KEY, JSON.stringify(setting))
    for (const held of await listHeldInvoices()) {
        await redisClient.zAdd(HELD_KEY, { score: dueAt(held.date, sendTime), value: held.invoice_id })
    }
    return setting
}

/** Whether an invoice dated `date` is for a later calendar day than today (business time), so it waits. */
export function isLaterDay(date: string | null | undefined): date is string {
    return !!date && DATE_PATTERN.test(date) && date > todayInBusinessTimezone()
}

/** The instant `sendTime` ("HH:MM") falls on `date` (YYYY-MM-DD), business time. */
export function dueAt(date: string, sendTime: string): number {
    const [year = 0, month = 1, day = 1] = date.split("-").map(Number)
    const [hours = 0, minutes = 0] = sendTime.split(":").map(Number)
    return Date.UTC(year, month - 1, day, hours, minutes) - BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000
}

/** Holds an invoice's message until its day's send time (moving it, if it was already held). */
export async function holdInvoiceMessage(invoice: { invoice_id: any; invoice_number?: any; date: string }): Promise<HeldInvoice> {
    const { sendTime } = await getTelegramScheduleSetting()
    const held: HeldInvoice = {
        invoice_id: String(invoice.invoice_id),
        invoice_number: String(invoice.invoice_number ?? ""),
        date: invoice.date,
        due_at: dueAt(invoice.date, sendTime),
        held_at: Date.now(),
    }
    await redisClient.multi()
        .zAdd(HELD_KEY, { score: held.due_at, value: held.invoice_id })
        .set(heldInfoKey(held.invoice_id), JSON.stringify(held))
        .exec()
    console.log(`Telegram: invoice ${held.invoice_number || held.invoice_id} held until ${new Date(held.due_at).toISOString()}`)
    return held
}

/** Stops holding an invoice's message (it's being posted now, or cancelled). Returns whether it was held. */
export async function releaseHeldInvoice(invoiceId: string): Promise<boolean> {
    const [removed] = await redisClient.multi().zRem(HELD_KEY, invoiceId).del(heldInfoKey(invoiceId)).exec()
    return Number(removed) > 0
}

/** The invoice's held message, or null when it isn't held. */
export async function heldInvoice(invoiceId: string): Promise<HeldInvoice | null> {
    const [score, raw] = await Promise.all([redisClient.zScore(HELD_KEY, invoiceId), redisClient.get(heldInfoKey(invoiceId))])
    if (score === null || !raw) return null
    return { ...(JSON.parse(raw) as HeldInvoice), due_at: score }
}

/** Every held invoice, soonest first. */
export async function listHeldInvoices(): Promise<HeldInvoice[]> {
    const ids = await redisClient.zRange(HELD_KEY, 0, -1)
    const held = await Promise.all(ids.map((id) => heldInvoice(id)))
    return held.filter((entry): entry is HeldInvoice => !!entry)
}

/** Held invoices whose time has come. */
export async function dueHeldInvoiceIds(now = Date.now()): Promise<string[]> {
    return redisClient.zRangeByScore(HELD_KEY, 0, now)
}

/**
 * Claims a due invoice for posting: only one caller (of two servers running
 * side by side during a deploy) gets true. Its info stays until it's posted.
 */
export async function claimHeldInvoice(invoiceId: string): Promise<boolean> {
    return (await redisClient.zRem(HELD_KEY, invoiceId)) > 0
}

/** Puts a claimed invoice back after a failed post, so the next run tries again. */
export async function unclaimHeldInvoice(invoiceId: string, dueAtMs: number) {
    await redisClient.zAdd(HELD_KEY, { score: dueAtMs, value: invoiceId })
}

export async function forgetHeldInvoiceInfo(invoiceId: string) {
    await redisClient.del(heldInfoKey(invoiceId))
}
