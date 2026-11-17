import { redisClient } from "../config/redis.js"
import { businessDayKey, businessDayWindow } from "../utils/businessDate.js"
import { orderPreparation, type GroupOrderMessage, type GroupReport, type OrderPreparation, type PreparationStatus } from "./telegram/groupOrders.js"
import { readOrderLoading } from "./telegram/loading.js"
import { toAmharicUnit } from "../utils/units.js"

/**
 * The preparation report: for a business day (4am to 4am), who in the
 * Telegram group prepared which orders — each invoice and backup list
 * credited to everyone who confirmed it that day (👍, a saved shortage
 * report, a ❤️ "all missing"; for a backup list, any reply or reaction) —
 * and the orders posted that day that nobody confirmed. Read from what the
 * webhook Lambda saves; orders already delivered still count, since their
 * group records are kept after their messages are deleted (30 days).
 */

/**
 * What the driver found, against what the preparers said: per item (in its
 * own unit) what the order asks for, what the preparers said is there, and
 * what the driver confirmed received (null: not confirmed yet). Only items
 * worth showing: short, or where the two disagree.
 */
export type ItemCheck = { description: string; unit: string; ordered: number; prepared: number; received: number | null; problem: "not_found" | "found" | null }
export type DriverCheck = {
    /** loaded: every item confirmed and matching; mismatch: the driver's count differs; partly: some items not confirmed; not_checked: none; none: a backup list (not confirmed by the driver). */
    status: "loaded" | "mismatch" | "partly" | "not_checked" | "none"
    items: ItemCheck[]
}

/** Something to look at again: an order where the preparers and the driver disagree, or that wasn't checked. */
export type ReportIssue = {
    order_id: string
    order_number: string
    kind: GroupOrderMessage["kind"]
    /** Who confirmed it (empty: nobody). */
    people: string[]
    severity: "high" | "medium"
    /** What's wrong, in Amharic. */
    text: string
}

export type PersonOrder = {
    order_id: string
    order_number: string
    kind: GroupOrderMessage["kind"]
    /** When this person first confirmed it that day. */
    at: string
    how: "thumb" | "report" | "all_missing" | "seen"
    /** The order's status now, as the app shows it. */
    status: PreparationStatus
    items: number
    short: { description: string; short: number; unit: string; available: number }[]
    check: DriverCheck
}

export type PersonReport = {
    /** The Telegram user id (or "name:<name>" for an older record without one). */
    id: string
    name: string
    orders: PersonOrder[]
    /** Shortage reports this person sent that day (saved, not deleted). */
    reports: number
    /** Their orders where the driver's count differs from what was reported. */
    problems: number
}

export type PreparationReportData = {
    day: string
    generatedAt: Date
    /** False while the business day is still running. */
    isComplete: boolean
    people: PersonReport[]
    /** Orders first posted that day that nobody confirmed. */
    unreported: { order_id: string; order_number: string; kind: GroupOrderMessage["kind"]; posted_at: string; items: number; check: DriverCheck }[]
    /** Every problem of the day, the most serious first. */
    issues: ReportIssue[]
}

const round = (value: number) => Math.round(value * 1000) / 1000

/** The driver's loading of an order against what the preparers reported (see DriverCheck). */
async function driverCheck(current: GroupOrderMessage[], preparation: OrderPreparation): Promise<DriverCheck> {
    if (current[0]?.kind === "backup_list") return { status: "none", items: [] }
    // What the order asks for now, per item.
    const ordered = new Map<string, { description: string; unit: string; quantity: number }>()
    for (const message of current) {
        for (const item of message.items) {
            ordered.set(item.item_key, { description: item.description, unit: item.unit, quantity: item.change ? (item.order_quantity ?? 0) : item.quantity })
        }
    }
    const reported = new Map(preparation.items.map((item) => [item.item_key, item.available]))
    const loading = await readOrderLoading(preparation.order_id).catch(() => null)
    const received = new Map((loading?.items ?? []).map((item) => [item.item_key, item.received]))

    const items: ItemCheck[] = []
    let confirmed = 0
    let total = 0
    let mismatch = false
    for (const [key, item] of ordered) {
        if (item.quantity <= 0) continue
        total++
        const prepared = round(Math.min(item.quantity, reported.get(key) ?? item.quantity))
        const got = received.has(key) ? round(received.get(key)!) : null
        if (got !== null) confirmed++
        const problem = got === null || got === prepared ? null : got < prepared ? "not_found" : "found"
        if (problem) mismatch = true
        if (problem || prepared < item.quantity || (got !== null && got < item.quantity)) {
            items.push({ description: item.description, unit: item.unit, ordered: round(item.quantity), prepared, received: got, problem })
        }
    }
    const status = mismatch ? "mismatch" : confirmed === 0 ? "not_checked" : confirmed < total ? "partly" : "loaded"
    return { status, items }
}

const amount = (value: number, unit: string) => `${value} ${toAmharicUnit(unit)}`.trim()

/** The day's problems with an order, if any (see ReportIssue). */
function issuesOf(
    order: { order_id: string; order_number: string; kind: GroupOrderMessage["kind"]; check: DriverCheck },
    people: string[],
    status: PreparationStatus,
): ReportIssue[] {
    const base = { order_id: order.order_id, order_number: order.order_number, kind: order.kind, people }
    const issues: ReportIssue[] = []
    for (const item of order.check.items) {
        if (item.problem === "not_found") {
            issues.push({ ...base, severity: "high", text: `${item.description}፦ ተዘጋጅቷል ተብሎ ${amount(item.prepared, item.unit)} — ሹፌሩ ያገኘው ${amount(item.received ?? 0, item.unit)}` })
        } else if (item.problem === "found") {
            issues.push({ ...base, severity: "high", text: `${item.description}፦ ${item.prepared === 0 ? "የለም ተብሎ" : `${amount(item.prepared, item.unit)} ብቻ ተብሎ`} — ሹፌሩ ያገኘው ${amount(item.received ?? 0, item.unit)}` })
        }
    }
    if (order.kind === "invoice") {
        if (status === "not_reported" && order.check.status !== "not_checked") {
            issues.push({ ...base, severity: "high", text: "ማንም አላረጋገጠም — ሹፌሩ ግን ጭኖታል" })
        } else if (status !== "not_reported" && order.check.status === "not_checked") {
            issues.push({ ...base, severity: "medium", text: "ሹፌሩ መጫኑን ገና አላረጋገጠም" })
        } else if (order.check.status === "partly") {
            issues.push({ ...base, severity: "medium", text: "ሹፌሩ ያረጋገጠው ከፊሉን እቃ ብቻ ነው" })
        }
    }
    return issues
}

type Confirmation = { personId: string; name: string; at: string; how: PersonOrder["how"] }

async function hashEntries(key: string): Promise<[string, { name: string; at: string }][]> {
    const stored = (await redisClient.hGetAll(key)) ?? {}
    return Object.entries(stored).map(([id, raw]) => [id, JSON.parse(raw) as { name: string; at: string }])
}

/** Every order with a record in the group (deleted messages too), by order id. */
async function ordersInGroup(): Promise<Map<string, GroupOrderMessage[]>> {
    const keys: string[] = []
    for await (const batch of redisClient.scanIterator({ MATCH: "telegram:group-order:*", COUNT: 500 })) {
        for (const key of Array.isArray(batch) ? batch : [batch]) keys.push(String(key))
    }
    const orders = new Map<string, GroupOrderMessage[]>()
    for (let i = 0; i < keys.length; i += 200) {
        const raws = await redisClient.mGet(keys.slice(i, i + 200))
        for (const raw of raws) {
            if (!raw) continue
            const message = JSON.parse(raw) as GroupOrderMessage
            orders.set(message.order_id, [...(orders.get(message.order_id) ?? []), message])
        }
    }
    return orders
}

/** Who confirmed an order, on any of its current messages: 👍 (or a saved report's), ❤️, or — a backup list — any interaction. */
async function confirmationsOf(messages: GroupOrderMessage[]): Promise<Confirmation[]> {
    const found: Confirmation[] = []
    for (const message of messages) {
        if (message.kind === "backup_list") {
            for (const [id, entry] of await hashEntries(`telegram:group-interactions:${message.message_id}`)) {
                found.push({ personId: id, name: entry.name, at: entry.at, how: "seen" })
            }
            continue
        }
        for (const [id, entry] of await hashEntries(`telegram:group-thumbs:${message.message_id}`)) {
            if (id.startsWith("report:")) {
                // A saved report's 👍: credited to whoever sent the report.
                const raw = await redisClient.get(`telegram:group-report:${id.slice("report:".length)}`)
                const report = raw ? (JSON.parse(raw) as GroupReport) : null
                const personId = report?.from.id ? String(report.from.id) : `name:${entry.name}`
                found.push({ personId, name: report?.from.name || entry.name, at: entry.at, how: "report" })
            } else {
                found.push({ personId: id, name: entry.name, at: entry.at, how: "thumb" })
            }
        }
        for (const [id, entry] of await hashEntries(`telegram:group-all-missing:${message.message_id}`)) {
            found.push({ personId: id, name: entry.name, at: entry.at, how: "all_missing" })
        }
    }
    return found
}

/**
 * The day's preparation report; with `personId`, only that person (still
 * listed when they did nothing that day, so their report says so).
 */
export async function buildPreparationReport(day: string, personId?: string): Promise<PreparationReportData> {
    const { start, end } = businessDayWindow(day)
    const inDay = (iso: string) => {
        const at = new Date(iso).getTime()
        return at >= start.getTime() && at < end.getTime()
    }

    const people = new Map<string, PersonReport>()
    const person = (id: string, name: string) => {
        const existing = people.get(id)
        if (existing) {
            if (name) existing.name = name
            return existing
        }
        const created: PersonReport = { id, name: name || "?", orders: [], reports: 0, problems: 0 }
        people.set(id, created)
        return created
    }
    const unreported: PreparationReportData["unreported"] = []
    const issues: ReportIssue[] = []

    for (const [orderId, records] of await ordersInGroup()) {
        // Posted after the day: nothing to count.
        if (!records.some((record) => record.posted_at < end.toISOString())) continue
        // Its current messages (the newest full message and the changes after it), deleted ones too.
        const sorted = [...records].sort((a, b) => a.posted_at.localeCompare(b.posted_at))
        const lastFull = sorted.map((message) => message.message_type).lastIndexOf("order")
        const current = lastFull === -1 ? sorted : sorted.slice(lastFull)
        const first = current[0]!

        const confirmations = (await confirmationsOf(current)).filter((confirmation) => inDay(confirmation.at))
        const reportIds = await redisClient.sMembers(`telegram:group-reports:${orderId}`)
        // Nothing about this order that day: skip the heavier reads.
        if (confirmations.length === 0 && reportIds.length === 0 && !inDay(first.posted_at)) continue

        const preparation = await orderPreparation(orderId, true)
        const check = await driverCheck(current, preparation)
        const items = new Set(current.flatMap((message) => message.items.map((item) => item.item_key))).size
        const short = preparation.items
            .filter((item) => item.short > 0)
            .map((item) => ({ description: item.description, short: item.short, unit: item.unit, available: item.available }))

        const byPerson = new Map<string, Confirmation>()
        for (const confirmation of confirmations) {
            const earlier = byPerson.get(confirmation.personId)
            if (!earlier || confirmation.at < earlier.at) byPerson.set(confirmation.personId, confirmation)
        }
        for (const confirmation of byPerson.values()) {
            person(confirmation.personId, confirmation.name).orders.push({
                order_id: orderId,
                order_number: first.order_number,
                kind: first.kind,
                at: confirmation.at,
                how: confirmation.how,
                status: preparation.status,
                items,
                short,
                check,
            })
        }
        const orderIssues = issuesOf({ order_id: orderId, order_number: first.order_number, kind: first.kind, check }, [...byPerson.values()].map((c) => c.name), preparation.status)
        if (byPerson.size > 0 || inDay(first.posted_at)) issues.push(...orderIssues)
        if (orderIssues.some((issue) => issue.severity === "high")) {
            for (const confirmation of byPerson.values()) person(confirmation.personId, confirmation.name).problems++
        }

        // Shortage reports sent that day, credited to their senders.
        if (reportIds.length) {
            const raws = await redisClient.mGet(reportIds.map((id) => `telegram:group-report:${id}`))
            for (const raw of raws) {
                if (!raw) continue
                const report = JSON.parse(raw) as GroupReport & { deleted_at?: string }
                if (report.deleted_at || report.lines.length === 0 || !inDay(report.sent_at)) continue
                person(report.from.id ? String(report.from.id) : `name:${report.from.name}`, report.from.name).reports++
            }
        }

        if (preparation.status === "not_reported" && inDay(first.posted_at)) {
            unreported.push({ order_id: orderId, order_number: first.order_number, kind: first.kind, posted_at: first.posted_at, items, check })
        }
    }

    for (const entry of people.values()) entry.orders.sort((a, b) => a.at.localeCompare(b.at))
    let list = [...people.values()].sort((a, b) => b.orders.length - a.orders.length || a.name.localeCompare(b.name))
    if (personId) list = list.filter((entry) => entry.id === personId)

    return {
        day,
        generatedAt: new Date(),
        isComplete: day < businessDayKey(),
        people: list,
        unreported: personId ? [] : unreported.sort((a, b) => a.posted_at.localeCompare(b.posted_at)),
        issues: issues
            .filter((issue) => !personId || list.some((entry) => entry.orders.some((order) => order.order_id === issue.order_id)))
            .sort((a, b) => (a.severity === b.severity ? a.order_number.localeCompare(b.order_number) : a.severity === "high" ? -1 : 1)),
    }
}

/**
 * Everyone who confirmed an order or sent a shortage report that day, for
 * the app's "report per person" list: id, name, and how many of each.
 */
export async function preparationPeople(day: string) {
    const report = await buildPreparationReport(day)
    return report.people.map((entry) => ({ id: entry.id, name: entry.name, orders: entry.orders.length, reports: entry.reports, problems: entry.problems }))
}
