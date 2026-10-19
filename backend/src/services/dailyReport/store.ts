import { redisClient } from "../../config/redis.js"
import { businessDayKey } from "../../utils/businessDate.js"

/**
 * The daily report's own record of what happened each business day (4am to
 * 4am, see businessDate.ts), written at the moment it happens — when an
 * invoice is created or marked as sent, a payment is recorded, edited or
 * deleted, a return is made, an invoice is voided — so the report needs
 * (almost) no Zoho calls: Zoho can't filter by that window anyway.
 *
 * Kept in Redis per day, one hash per kind keyed by its id:
 *   daily-report:<day>:payments | :invoices | :returns | :drafts
 * plus `daily-report:index:<kind>:<id>` → day, so a later edit, delete or
 * void finds the day its record is under. Everything expires after
 * RETENTION_SECONDS, or a few hours after that day's report is downloaded
 * (see scheduleDayCleanup). Recording is best-effort: a failure here is
 * logged and never fails the action itself.
 */

/** `unit` is the Zoho unit code ("box", "pack", …); missing on lines recorded before it was kept. */
export type ReportLine = { item_id: string; name: string; description: string; quantity: number; rate: number; unit?: string }

export type ReportPayment = { payment_id: string; number: string; customer: string; amount: number; mode: string; at: string }
export type ReportInvoice = {
    invoice_id: string
    number: string
    customer: string
    date?: string
    at: string
    total: number
    balance: number
    lines: ReportLine[]
}
export type ReportReturn = { creditnote_id: string; number: string; customer: string; invoice_number: string; at: string; total: number; lines: ReportLine[] }
export type ReportDraft = { invoice_id: string; number: string; customer: string; date?: string; at: string; total: number }

type Kind = "payments" | "invoices" | "returns" | "drafts"

const RETENTION_SECONDS = 8 * 24 * 60 * 60
/** How long a finished day's data is kept once its report has been downloaded. */
export const CLEANUP_AFTER_DOWNLOAD_SECONDS = 6 * 60 * 60

const dayKey = (day: string, kind: Kind) => `daily-report:${day}:${kind}`
const indexKey = (kind: Kind, id: string) => `daily-report:index:${kind}:${id}`
const KINDS: Kind[] = ["payments", "invoices", "returns", "drafts"]

const round2 = (value: number) => Math.round(value * 100) / 100

/** Turns Zoho line items into the report's shape (the "###" internal marker is dropped from descriptions). */
export function toReportLines(lineItems: any[] | undefined): ReportLine[] {
    return (lineItems ?? []).map((line) => ({
        item_id: String(line.item_id ?? ""),
        name: String(line.name ?? ""),
        description: String(line.description ?? "").replace(/###/g, "").trim(),
        quantity: Number(line.quantity) || 0,
        rate: Number(line.rate) || 0,
        ...(line.unit ? { unit: String(line.unit) } : {}),
    }))
}

async function put(kind: Kind, id: string, record: object, day = businessDayKey()) {
    try {
        const key = dayKey(day, kind)
        await redisClient.hSet(key, id, JSON.stringify(record))
        await redisClient.expire(key, RETENTION_SECONDS)
        await redisClient.set(indexKey(kind, id), day, { EX: RETENTION_SECONDS })
    } catch (error) {
        console.error(`Daily report: failed to record ${kind} ${id}`, error)
    }
}

/** The record of `id`, wherever (whichever day) it was recorded, or null. */
async function find<T>(kind: Kind, id: string): Promise<{ day: string; record: T } | null> {
    const day = await redisClient.get(indexKey(kind, id))
    if (!day) return null
    const raw = await redisClient.hGet(dayKey(day, kind), id)
    return raw ? { day, record: JSON.parse(raw) as T } : null
}

async function remove(kind: Kind, id: string) {
    try {
        const day = await redisClient.get(indexKey(kind, id))
        if (day) await redisClient.hDel(dayKey(day, kind), id)
        await redisClient.del(indexKey(kind, id))
    } catch (error) {
        console.error(`Daily report: failed to remove ${kind} ${id}`, error)
    }
}

/** A payment just recorded (customer-level or on one invoice). */
export function recordReportPayment(payment: any, fallbackCustomer = "") {
    if (!payment?.payment_id) return Promise.resolve()
    const record: ReportPayment = {
        payment_id: String(payment.payment_id),
        number: String(payment.payment_number ?? ""),
        customer: String(payment.customer_name ?? fallbackCustomer),
        amount: round2(Number(payment.amount) || 0),
        mode: String(payment.payment_mode ?? ""),
        at: new Date().toISOString(),
    }
    return put("payments", record.payment_id, record)
}

/** The business day a payment was recorded under, or null if it isn't recorded (made before this existed, or expired). */
export async function reportDayOfPayment(paymentId: string): Promise<string | null> {
    try {
        return await redisClient.get(indexKey("payments", paymentId))
    } catch (error) {
        console.error(`Daily report: failed to read the day of payment ${paymentId}`, error)
        return null
    }
}

/** A payment's amount was corrected: updates its record, if the report still has it. */
export async function updateReportPaymentAmount(paymentId: string, amount: number) {
    try {
        const found = await find<ReportPayment>("payments", paymentId)
        if (found) await put("payments", paymentId, { ...found.record, amount: round2(amount) }, found.day)
    } catch (error) {
        console.error(`Daily report: failed to update payment ${paymentId}`, error)
    }
}

/** A payment was deleted: it no longer counts as received. */
export function removeReportPayment(paymentId: string) {
    return remove("payments", paymentId)
}

/** An invoice was just marked as sent (or paid straight from draft): its lines become that day's sales. */
export function recordReportInvoiceSent(invoice: any) {
    if (!invoice?.invoice_id) return Promise.resolve()
    const id = String(invoice.invoice_id)
    const record: ReportInvoice = {
        invoice_id: id,
        number: String(invoice.invoice_number ?? ""),
        customer: String(invoice.customer_name ?? ""),
        date: invoice.date ?? undefined,
        at: new Date().toISOString(),
        total: round2(Number(invoice.total) || 0),
        balance: round2(Number(invoice.balance ?? invoice.total) || 0),
        lines: toReportLines(invoice.line_items),
    }
    return put("invoices", id, record)
}

/** A draft was just created; its total is kept up to date as it's edited (see updateReportDraft). */
export function recordReportDraft(invoice: any) {
    if (!invoice?.invoice_id) return Promise.resolve()
    const id = String(invoice.invoice_id)
    const record: ReportDraft = {
        invoice_id: id,
        number: String(invoice.invoice_number ?? ""),
        customer: String(invoice.customer_name ?? ""),
        date: invoice.date ?? undefined,
        at: new Date().toISOString(),
        total: round2(Number(invoice.total) || 0),
    }
    return put("drafts", id, record)
}

/**
 * An invoice was edited (items, date, customer): refreshes whichever record
 * the report has for it — a draft's total, or a sent invoice's lines and
 * totals — keeping it under the day it was first recorded.
 */
export async function refreshReportInvoice(invoice: any) {
    if (!invoice?.invoice_id) return
    const id = String(invoice.invoice_id)
    try {
        const draft = await find<ReportDraft>("drafts", id)
        if (draft) {
            await put(
                "drafts",
                id,
                {
                    ...draft.record,
                    customer: String(invoice.customer_name ?? draft.record.customer),
                    date: invoice.date ?? draft.record.date,
                    total: round2(Number(invoice.total) || 0),
                },
                draft.day,
            )
        }
        const sent = await find<ReportInvoice>("invoices", id)
        if (sent && invoice.line_items) {
            await put(
                "invoices",
                id,
                {
                    ...sent.record,
                    customer: String(invoice.customer_name ?? sent.record.customer),
                    date: invoice.date ?? sent.record.date,
                    total: round2(Number(invoice.total) || 0),
                    balance: round2(Number(invoice.balance ?? invoice.total) || 0),
                    lines: toReportLines(invoice.line_items),
                },
                sent.day,
            )
        }
    } catch (error) {
        console.error(`Daily report: failed to refresh invoice ${id}`, error)
    }
}

/** A return (credit note) just made. */
export function recordReportReturn(creditNote: any, invoice: any, lineItems: any[]) {
    if (!creditNote?.creditnote_id) return Promise.resolve()
    const id = String(creditNote.creditnote_id)
    const record: ReportReturn = {
        creditnote_id: id,
        number: String(creditNote.creditnote_number ?? ""),
        customer: String(invoice?.customer_name ?? ""),
        invoice_number: String(invoice?.invoice_number ?? ""),
        at: new Date().toISOString(),
        total: round2(Number(creditNote.total) || 0),
        lines: toReportLines(lineItems),
    }
    return put("returns", id, record)
}

/** An invoice was voided: it's neither a sale nor a pending draft any more. */
export async function removeReportInvoice(invoiceId: string) {
    await remove("invoices", invoiceId)
    await remove("drafts", invoiceId)
}

async function readAll<T>(day: string, kind: Kind): Promise<T[]> {
    const values = Object.values(await redisClient.hGetAll(dayKey(day, kind)))
    return values.map((raw) => JSON.parse(raw) as T).sort((a: any, b: any) => String(a.at).localeCompare(String(b.at)))
}

/** Everything recorded for a business day, each list oldest first. */
export async function readReportDay(day: string) {
    const [payments, invoices, returns, drafts] = await Promise.all([
        readAll<ReportPayment>(day, "payments"),
        readAll<ReportInvoice>(day, "invoices"),
        readAll<ReportReturn>(day, "returns"),
        readAll<ReportDraft>(day, "drafts"),
    ])
    return { payments, invoices, returns, drafts }
}

/**
 * Once a finished day's report has been downloaded, its data is kept only a
 * few more hours (in case it's needed again), then expires. Never shortens a
 * day that's still running.
 */
export async function scheduleDayCleanup(day: string) {
    if (day >= businessDayKey()) return
    try {
        for (const kind of KINDS) {
            const key = dayKey(day, kind)
            const ttl = await redisClient.ttl(key)
            if (ttl < 0 || ttl > CLEANUP_AFTER_DOWNLOAD_SECONDS) await redisClient.expire(key, CLEANUP_AFTER_DOWNLOAD_SECONDS)
        }
    } catch (error) {
        console.error(`Daily report: failed to schedule cleanup of ${day}`, error)
    }
}
