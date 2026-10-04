import { redisClient } from "../../config/redis.js"
import { todayInBusinessTimezone } from "../../utils/businessDate.js"

/**
 * Customer visits, recorded by the app itself (not read back from Zoho, which
 * would cost too many API calls). One small Redis hash per customer:
 *
 *   customer-visits:<customer_id>
 *     created_at       YYYY-MM-DD  when the customer was created (if known)
 *     purchases        JSON array of YYYY-MM-DD, the latest MAX_PURCHASES
 *                      days an invoice was marked sent (one per day)
 *     purchase_count   total purchases ever recorded
 *     last_visit       YYYY-MM-DD
 *     last_visit_kind  "purchase" | "payment" | "manual"
 *     last_visit_note  free text from "Mark visited" (optional)
 *     potential        "1": an old contact never invoiced (from the import)
 *
 * No expiry: this is the app's own record. ~300 bytes per customer.
 */

const recordKey = (customerId: string) => `customer-visits:${customerId}`
export const IMPORTED_AT_KEY = "customer-visits:imported_at"

/** Enough purchases to judge a customer's rhythm from the recent ones. */
const MAX_PURCHASES = 8

/** A customer stays "new" until this many purchases. */
export const PURCHASES_TO_CLASSIFY = 3

/** Typical gap between purchases (days): up to here is regular, then occasional, beyond is rare. */
export const REGULAR_MAX_GAP_DAYS = 20
export const OCCASIONAL_MAX_GAP_DAYS = 60

/** How often each kind of customer should be visited. */
export const REGULAR_VISIT_INTERVAL_DAYS = 7
export const OTHER_VISIT_INTERVAL_DAYS = 14

export type VisitKind = "purchase" | "payment" | "manual"
export type CustomerType = "new" | "regular" | "occasional" | "rare" | "potential"

export type VisitRecord = {
    created_at?: string
    purchases: string[]
    purchase_count: number
    last_visit?: string
    last_visit_kind?: VisitKind
    last_visit_note?: string
    potential: boolean
}

function parseRecord(hash: Record<string, string>): VisitRecord {
    let purchases: string[] = []
    try {
        const parsed = JSON.parse(hash.purchases ?? "[]")
        if (Array.isArray(parsed)) purchases = parsed.filter((d) => typeof d === "string")
    } catch {
        // malformed: start over
    }
    return {
        ...(hash.created_at && { created_at: hash.created_at }),
        purchases,
        purchase_count: Number(hash.purchase_count) || purchases.length,
        ...(hash.last_visit && { last_visit: hash.last_visit }),
        ...(hash.last_visit_kind && { last_visit_kind: hash.last_visit_kind as VisitKind }),
        ...(hash.last_visit_note && { last_visit_note: hash.last_visit_note }),
        potential: hash.potential === "1",
    }
}

export async function getVisitRecords(customerIds: string[]): Promise<Map<string, VisitRecord>> {
    const hashes = await Promise.all(customerIds.map((id) => redisClient.hGetAll(recordKey(id))))
    return new Map(customerIds.map((id, i) => [id, parseRecord(hashes[i] ?? {})]))
}

/** Sets the last visit, unless a later one is already recorded. */
async function setLastVisit(customerId: string, date: string, kind: VisitKind, note?: string) {
    const key = recordKey(customerId)
    const current = await redisClient.hGet(key, "last_visit")
    if (current && current > date) return
    await redisClient.hSet(key, { last_visit: date, last_visit_kind: kind, last_visit_note: note ?? "" })
}

/** Adds purchase days (deduplicated, sorted, latest MAX_PURCHASES kept). Returns how many were new. */
async function addPurchases(customerId: string, dates: string[]): Promise<number> {
    const key = recordKey(customerId)
    const record = parseRecord(await redisClient.hGetAll(key))
    const known = new Set(record.purchases)
    const added = dates.filter((d) => !known.has(d))
    if (added.length === 0) return 0
    const purchases = Array.from(new Set([...record.purchases, ...added])).sort().slice(-MAX_PURCHASES)
    await redisClient.hSet(key, {
        purchases: JSON.stringify(purchases),
        purchase_count: String(record.purchase_count + new Set(added).size),
        potential: "0",
    })
    return added.length
}

/**
 * Never lets visit tracking break the action it rides along with (a payment
 * or a sent invoice has already happened in Zoho by now).
 */
async function safely(label: string, work: () => Promise<unknown>) {
    try {
        await work()
    } catch (error) {
        console.error(`Failed to record customer visit (${label}):`, error)
    }
}

/** An invoice was marked as sent: a purchase, and a visit. */
export function recordPurchase(customerId: string | number | undefined) {
    if (!customerId) return Promise.resolve()
    const id = String(customerId)
    const today = todayInBusinessTimezone()
    return safely("purchase", async () => {
        await addPurchases(id, [today])
        await setLastVisit(id, today, "purchase")
    })
}

/** A payment was recorded: a visit (but not a purchase). */
export function recordPayment(customerId: string | number | undefined) {
    if (!customerId) return Promise.resolve()
    return safely("payment", () => setLastVisit(String(customerId), todayInBusinessTimezone(), "payment"))
}

/** "Mark visited" — a visit with no sale or payment (marketing, a reminder, ...). */
export async function recordManualVisit(customerId: string, note?: string) {
    await setLastVisit(customerId, todayInBusinessTimezone(), "manual", note?.trim().slice(0, 200))
}

/** A customer was created in the app: new, to be visited. */
export function recordCustomerCreated(customerId: string | number | undefined) {
    if (!customerId) return Promise.resolve()
    return safely("created", () =>
        redisClient.hSetNX(recordKey(String(customerId)), "created_at", todayInBusinessTimezone()),
    )
}

/** Used by the one-time import from Zoho. */
export async function importCustomerHistory(
    customerId: string,
    history: { created_at?: string; purchases: string[]; payments: string[]; potential: boolean },
) {
    const key = recordKey(customerId)
    if (history.created_at) await redisClient.hSetNX(key, "created_at", history.created_at)
    await addPurchases(customerId, history.purchases)
    const lastPurchase = history.purchases.reduce((a, b) => (b > a ? b : a), "")
    const lastPayment = history.payments.reduce((a, b) => (b > a ? b : a), "")
    if (lastPurchase || lastPayment) {
        if (lastPurchase >= lastPayment) await setLastVisit(customerId, lastPurchase, "purchase")
        else await setLastVisit(customerId, lastPayment, "payment")
    }
    const record = parseRecord(await redisClient.hGetAll(key))
    if (history.potential && record.purchase_count === 0) await redisClient.hSet(key, "potential", "1")
}

// ---------- classification ----------

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string) {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

function median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * New until PURCHASES_TO_CLASSIFY purchases; then by the typical (median)
 * gap between the recent purchases, so one unusually long or short gap
 * doesn't flip the type. Payments and manual visits never count here.
 */
export function classifyCustomer(record: VisitRecord): { type: CustomerType; typical_gap_days?: number } {
    if (record.potential && record.purchase_count === 0) return { type: "potential" }
    if (record.purchase_count < PURCHASES_TO_CLASSIFY || record.purchases.length < 2) return { type: "new" }
    const gaps: number[] = []
    for (let i = 1; i < record.purchases.length; i++) gaps.push(daysBetween(record.purchases[i - 1]!, record.purchases[i]!))
    const typical = Math.round(median(gaps.slice(-5)))
    if (typical <= REGULAR_MAX_GAP_DAYS) return { type: "regular", typical_gap_days: typical }
    if (typical <= OCCASIONAL_MAX_GAP_DAYS) return { type: "occasional", typical_gap_days: typical }
    return { type: "rare", typical_gap_days: typical }
}

export type VisitStatus = {
    type: CustomerType
    typical_gap_days?: number
    /** Days between visits for this type; undefined for potential customers (no reminders). */
    interval_days?: number
    /** Days since the last visit, or since creation if never visited; undefined if neither is known. */
    days_since?: number
    due: boolean
    /** How far past due (0 when not due). Unknown dates count as just due. */
    overdue_days: number
    /** Visited within the current cycle: shown green. */
    visited_recently: boolean
}

export function visitStatus(record: VisitRecord, today: string = todayInBusinessTimezone()): VisitStatus {
    const { type, typical_gap_days } = classifyCustomer(record)
    if (type === "potential") {
        return { type, due: false, overdue_days: 0, visited_recently: false, ...(record.last_visit && { days_since: daysBetween(record.last_visit, today) }) }
    }
    const interval = type === "regular" ? REGULAR_VISIT_INTERVAL_DAYS : OTHER_VISIT_INTERVAL_DAYS
    const reference = record.last_visit ?? record.created_at
    const days_since = reference ? Math.max(0, daysBetween(reference, today)) : undefined
    // Never visited and creation date unknown: due now.
    const due = days_since === undefined || (record.last_visit ? days_since >= interval : true)
    const overdue_days = days_since === undefined ? 0 : Math.max(0, days_since - (record.last_visit ? interval : 0))
    return {
        type,
        ...(typical_gap_days !== undefined && { typical_gap_days }),
        interval_days: interval,
        ...(days_since !== undefined && { days_since }),
        due,
        overdue_days,
        visited_recently: !!record.last_visit && !due,
    }
}
