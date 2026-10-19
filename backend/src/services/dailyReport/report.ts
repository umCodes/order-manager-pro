import { ZohoApi } from "../zoho/client.js"
import { redisClient } from "../../config/redis.js"
import { businessDayKey } from "../../utils/businessDate.js"
import { readReportDay, type ReportLine, type ReportReturn } from "./store.js"
import { checkZohoTimezone, type ZohoTimezoneCheck } from "../zoho/orgTimezone.js"

export type InvoiceStatus = "paid" | "partial" | "unpaid"

/** Everything the daily report PDF shows, already worked out. */
export type DailyReportData = {
    day: string
    generatedAt: Date
    /** False while the business day is still running (the report shows what's in so far). */
    isComplete: boolean
    /** False when Zoho couldn't be reached: balances are as recorded when each invoice was sent. */
    balancesRefreshed: boolean
    /** Zoho's organization time zone, checked against the business's UTC+3 (the PDF warns on a mismatch). */
    zohoTimezone: ZohoTimezoneCheck
    payments: { at: string; number: string; customer: string; mode: string; amount: number }[]
    items: { name: string; description: string; unit?: string; quantity: number; value: number; low: number; high: number }[]
    invoices: { number: string; customer: string; at: string; total: number; paid: number; balance: number; status: InvoiceStatus; lines: ReportLine[] }[]
    returns: ReportReturn[]
    drafts: { number: string; customer: string; at: string; date?: string; total: number }[]
}

const round2 = (value: number) => Math.round(value * 100) / 100
const round3 = (value: number) => Math.round(value * 1000) / 1000

/**
 * The current state of `ids` in Zoho, from one list call over the invoice
 * dates they span (a few pages at most). Null if Zoho couldn't be read.
 */
async function currentInvoiceStates(accessToken: string, ids: Set<string>, dates: string[]) {
    if (ids.size === 0 || dates.length === 0) return new Map<string, any>()
    const sorted = [...dates].sort()
    const states = new Map<string, any>()
    try {
        for (let page = 1; page <= 5; page++) {
            const query = new URLSearchParams({
                date_start: sorted[0]!,
                date_end: sorted[sorted.length - 1]!,
                per_page: "200",
                page: String(page),
            })
            const response = await ZohoApi(`invoices?${query}`, accessToken)
            if (!Array.isArray(response.invoices)) throw new Error(response.message ?? "Failed to list invoices")
            for (const invoice of response.invoices) {
                if (ids.has(String(invoice.invoice_id))) states.set(String(invoice.invoice_id), invoice)
            }
            if (!response.page_context?.has_more_page || states.size === ids.size) break
        }
        return states
    } catch (error) {
        console.error("Daily report: couldn't refresh invoice balances from Zoho", error)
        return null
    }
}

function statusOf(total: number, balance: number): InvoiceStatus {
    if (balance <= 0.004) return "paid"
    return balance < total - 0.004 ? "partial" : "unpaid"
}

/**
 * Builds a business day's report from what was recorded (see store.ts),
 * refreshing paid/outstanding and draft status with a single Zoho call.
 */
export async function buildDailyReport(accessToken: string, day: string): Promise<DailyReportData> {
    const recorded = await readReportDay(day)

    const ids = new Set([...recorded.invoices, ...recorded.drafts].map((record) => record.invoice_id))
    const dates = [...recorded.invoices, ...recorded.drafts].map((record) => record.date).filter((date): date is string => !!date)
    const [states, zohoTimezone] = await Promise.all([
        currentInvoiceStates(accessToken, ids, dates),
        checkZohoTimezone(accessToken),
    ])

    // Invoices voided since are dropped; the rest take Zoho's current balance when known.
    const invoices = recorded.invoices
        .map((invoice) => {
            const state = states?.get(invoice.invoice_id)
            if (state?.status === "void") return null
            const total = state ? round2(Number(state.total)) : invoice.total
            const balance = state ? round2(Number(state.balance)) : invoice.balance
            return {
                number: invoice.number,
                customer: invoice.customer,
                at: invoice.at,
                total,
                paid: round2(total - balance),
                balance,
                status: statusOf(total, balance),
                lines: invoice.lines,
            }
        })
        .filter((invoice): invoice is NonNullable<typeof invoice> => invoice !== null)

    const items = new Map<string, DailyReportData["items"][number]>()
    for (const invoice of invoices) {
        for (const line of invoice.lines) {
            const key = line.item_id || line.name || line.description
            const entry = items.get(key) ?? { name: line.name, description: line.description, quantity: 0, value: 0, low: Infinity, high: -Infinity }
            if (!entry.unit && line.unit) entry.unit = line.unit
            entry.quantity = round3(entry.quantity + line.quantity)
            entry.value = round2(entry.value + line.quantity * line.rate)
            entry.low = Math.min(entry.low, line.rate)
            entry.high = Math.max(entry.high, line.rate)
            items.set(key, entry)
        }
    }

    // Drafts still unsent: not marked as sent through the app, and still a draft in Zoho (when it could be read).
    const drafts = []
    for (const draft of recorded.drafts) {
        const state = states?.get(draft.invoice_id)
        if (state && state.status !== "draft") continue
        if (await redisClient.exists(`daily-report:index:invoices:${draft.invoice_id}`)) continue
        drafts.push({
            number: draft.number,
            customer: state?.customer_name ?? draft.customer,
            at: draft.at,
            date: state?.date ?? draft.date,
            total: state ? round2(Number(state.total)) : draft.total,
        })
    }

    return {
        day,
        generatedAt: new Date(),
        isComplete: day < businessDayKey(),
        balancesRefreshed: states !== null,
        zohoTimezone,
        payments: recorded.payments.map((payment) => ({
            at: payment.at,
            number: payment.number,
            customer: payment.customer,
            mode: payment.mode,
            amount: payment.amount,
        })),
        items: [...items.values()].sort((a, b) => b.value - a.value),
        invoices,
        returns: recorded.returns,
        drafts,
    }
}
