import { ZohoApi } from "../zoho/client.js"
import { redisClient } from "../../config/redis.js"
import { businessDayKey } from "../../utils/businessDate.js"
import { readReportDay, type ReportDraft, type ReportLine, type ReportReturn } from "./store.js"
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
    /** `discount` is the invoice-wide discount: its lines' value less its total (0 when none). */
    invoices: { number: string; customer: string; at: string; total: number; discount: number; paid: number; balance: number; status: InvoiceStatus; lines: ReportLine[] }[]
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

const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * The orders not delivered by the end of `day`: every draft dated that day
 * or earlier — an order due and missed stays on every day's report until
 * it's delivered — read from Zoho, so drafts made in Zoho count too. For a
 * day that has passed, orders delivered (marked as sent through the app)
 * only after it ended still count as undelivered on it. Oldest first.
 * If Zoho can't be read, the drafts the app recorded that day stand in.
 */
async function undeliveredOrders(accessToken: string, day: string, recordedDrafts: ReportDraft[]): Promise<DailyReportData["drafts"]> {
    const orders = new Map<string, DailyReportData["drafts"][number] & { id: string }>()
    try {
        for (let page = 1; page <= 10; page++) {
            const query = new URLSearchParams({ status: "draft", date_end: day, per_page: "200", page: String(page) })
            const response = await ZohoApi(`invoices?${query}`, accessToken)
            if (!Array.isArray(response.invoices)) throw new Error(response.message ?? "Failed to list drafts")
            for (const invoice of response.invoices) {
                // Checked here too, in case Zoho ignores a filter.
                if (invoice.status !== "draft" || !invoice.date || invoice.date > day) continue
                orders.set(String(invoice.invoice_id), {
                    id: String(invoice.invoice_id),
                    number: String(invoice.invoice_number),
                    customer: String(invoice.customer_name ?? ""),
                    at: String(invoice.created_time ?? ""),
                    date: invoice.date,
                    total: round2(Number(invoice.total) || 0),
                })
            }
            if (!response.page_context?.has_more_page) break
        }
    } catch (error) {
        console.error("Daily report: couldn't read the undelivered orders from Zoho", error)
        for (const draft of recordedDrafts) {
            if (draft.date && draft.date > day) continue
            if (await redisClient.exists(`daily-report:index:invoices:${draft.invoice_id}`)) continue
            orders.set(draft.invoice_id, { id: draft.invoice_id, number: draft.number, customer: draft.customer, at: draft.at, ...(draft.date ? { date: draft.date } : {}), total: draft.total })
        }
    }

    // Delivered on a later business day: still undelivered at the end of this one.
    const today = businessDayKey()
    for (let later = nextDay(day); later <= today; later = nextDay(later)) {
        for (const sent of (await readReportDay(later)).invoices) {
            if (!sent.date || sent.date > day || orders.has(sent.invoice_id)) continue
            orders.set(sent.invoice_id, { id: sent.invoice_id, number: sent.number, customer: sent.customer, at: sent.at, date: sent.date, total: sent.total })
        }
    }

    return [...orders.values()]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.number.localeCompare(b.number))
        .map(({ id: _id, ...order }) => order)
}

function statusOf(total: number, balance: number): InvoiceStatus {
    if (balance <= 0.004) return "paid"
    return balance < total - 0.004 ? "partial" : "unpaid"
}

/**
 * Builds a business day's report from what was recorded (see store.ts),
 * refreshing paid/outstanding with a single Zoho call; the undelivered
 * orders come from Zoho (see undeliveredOrders).
 */
export async function buildDailyReport(accessToken: string, day: string): Promise<DailyReportData> {
    const recorded = await readReportDay(day)

    const ids = new Set(recorded.invoices.map((record) => record.invoice_id))
    const dates = recorded.invoices.map((record) => record.date).filter((date): date is string => !!date)
    const [states, zohoTimezone, drafts] = await Promise.all([
        currentInvoiceStates(accessToken, ids, dates),
        checkZohoTimezone(accessToken),
        undeliveredOrders(accessToken, day, recorded.drafts),
    ])

    // Invoices voided since are dropped; the rest take Zoho's current balance when known.
    const invoices = recorded.invoices
        .map((invoice) => {
            const state = states?.get(invoice.invoice_id)
            if (state?.status === "void") return null
            const total = state ? round2(Number(state.total)) : invoice.total
            const balance = state ? round2(Number(state.balance)) : invoice.balance
            // Lines are kept at the price charged, so whatever the total is short of them is the
            // invoice's discount — however it got there (when sent, with a payment, or later).
            const linesValue = round2(invoice.lines.reduce((sum, line) => sum + line.quantity * line.rate, 0))
            return {
                number: invoice.number,
                customer: invoice.customer,
                at: invoice.at,
                total,
                discount: Math.max(0, round2(linesValue - total)),
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
