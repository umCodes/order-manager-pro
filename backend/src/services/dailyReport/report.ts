import { ZohoApi } from "../zoho/client.js"
import { redisClient } from "../../config/redis.js"
import { businessDayKey, businessDayWindow } from "../../utils/businessDate.js"
import { backupListsRemainingAt, type BackupList } from "../backupLists.js"
import { remainingBackup } from "../backupUsage.js"
import { readReportDay, type ReportDraft, type ReportLine, type ReportReturn } from "./store.js"
import { checkZohoTimezone, type ZohoTimezoneCheck } from "../zoho/orgTimezone.js"
import { ZohoGetCustomersCached, getContactAddress } from "../zoho/customers/index.js"
import { listDoneVisits } from "../visits.js"

export type InvoiceStatus = "paid" | "partial" | "unpaid"

/** What was done at a customer on the day: delivered an invoice, took a payment, took a return, or marked a visit done. */
export type DistrictActivity = "delivery" | "payment" | "return" | "visit"

/** A district gone to on the day, with the customers there and what was done at each. */
export type ReportDistrict = {
    /** Empty when the customer has no address saved (all such customers are grouped together). */
    district: string
    city: string
    customers: { name: string; activities: DistrictActivity[] }[]
}

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
    /** Backup lists still open when the day ended (or now, while it's running), oldest first — each item cut to what's left (reported available, less what quick invoices took). */
    backupLists: BackupList[]
    /** The districts gone to on the day (deliveries, payments, returns, visits done), most customers first. */
    districts: ReportDistrict[]
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

const ACTIVITY_ORDER: DistrictActivity[] = ["delivery", "payment", "return", "visit"]
const nameKey = (name: string) => name.trim().toLowerCase()

/**
 * The districts gone to on `day`: every customer an invoice was delivered
 * to, a payment taken from, a return taken from, or a visit marked done for
 * that day, grouped by the district and city in their Zoho address (one
 * read of the cached customer list). Customers are matched by id where the
 * record has one (visits), else by name (Zoho display names are unique);
 * those with no address saved are grouped under an empty district.
 */
async function districtsGoneTo(
    accessToken: string,
    day: string,
    activity: { delivery: string[]; payment: string[]; return: string[] },
): Promise<ReportDistrict[]> {
    const { start, end } = businessDayWindow(day)
    const visits = (await listDoneVisits(500).catch((error) => {
        console.error("Daily report: couldn't read the visits", error)
        return []
    })).filter((visit) => {
        const at = Date.parse(visit.visited_at)
        return at >= start.getTime() && at < end.getTime()
    })

    let contacts: any[] = []
    try {
        contacts = ((await ZohoGetCustomersCached(accessToken)) as any[]) ?? []
    } catch (error) {
        console.error("Daily report: couldn't read the customers for districts", error)
    }
    const byId = new Map(contacts.map((contact) => [String(contact.contact_id), contact]))
    const byName = new Map(contacts.map((contact) => [nameKey(String(contact.contact_name ?? "")), contact]))

    // One entry per customer: their name and everything done there.
    const customers = new Map<string, { name: string; contact: any; activities: Set<DistrictActivity> }>()
    function add(name: string, kind: DistrictActivity, customerId?: string) {
        const contact = (customerId && byId.get(customerId)) || byName.get(nameKey(name))
        const key = contact ? `id:${contact.contact_id}` : `name:${nameKey(name)}`
        if (!name.trim() && !contact) return
        const entry = customers.get(key) ?? { name: String(contact?.contact_name ?? name), contact, activities: new Set() }
        entry.activities.add(kind)
        customers.set(key, entry)
    }
    for (const name of activity.delivery) add(name, "delivery")
    for (const name of activity.payment) add(name, "payment")
    for (const name of activity.return) add(name, "return")
    for (const visit of visits) add(visit.customer_name, "visit", visit.customer_id)

    const districts = new Map<string, ReportDistrict>()
    for (const { name, contact, activities } of customers.values()) {
        const address = contact ? getContactAddress(contact) : undefined
        const district = address?.district?.trim() ?? ""
        const city = district ? (address?.city?.trim() ?? "") : ""
        const key = `${district.toLowerCase()}|${city.toLowerCase()}`
        const entry = districts.get(key) ?? { district, city, customers: [] }
        entry.customers.push({ name, activities: ACTIVITY_ORDER.filter((kind) => activities.has(kind)) })
        districts.set(key, entry)
    }
    for (const entry of districts.values()) entry.customers.sort((a, b) => a.name.localeCompare(b.name))
    // Known districts first (most customers first), customers with no address last.
    return [...districts.values()].sort(
        (a, b) => Number(!a.district) - Number(!b.district) || b.customers.length - a.customers.length || a.district.localeCompare(b.district),
    )
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
    const isComplete = day < businessDayKey()
    const [states, zohoTimezone, drafts, backupLists] = await Promise.all([
        currentInvoiceStates(accessToken, ids, dates),
        checkZohoTimezone(accessToken),
        undeliveredOrders(accessToken, day, recorded.drafts),
        // What's actually left: as reported available in the Telegram group, less what quick invoices took.
        backupListsRemainingAt(isComplete ? businessDayWindow(day).end : new Date()).then(remainingBackup).catch((error) => {
            console.error("Daily report: couldn't read the backup lists", error)
            return []
        }),
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

    const districts = await districtsGoneTo(accessToken, day, {
        delivery: invoices.map((invoice) => invoice.customer),
        payment: recorded.payments.map((payment) => payment.customer),
        return: recorded.returns.map((ret) => ret.customer),
    }).catch((error) => {
        console.error("Daily report: couldn't work out the districts", error)
        return [] as ReportDistrict[]
    })

    return {
        day,
        generatedAt: new Date(),
        isComplete,
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
        backupLists,
        districts,
    }
}
