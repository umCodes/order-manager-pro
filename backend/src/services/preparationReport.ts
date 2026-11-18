import { redisClient } from "../config/redis.js"
import { businessDayKey, businessDayWindow } from "../utils/businessDate.js"
import { orderPreparation, type GroupOrderMessage, type GroupReport, type PreparationStatus } from "./telegram/groupOrders.js"

/**
 * The preparation report: for a business day (4am to 4am), who in the
 * Telegram group prepared which orders — each invoice and backup list
 * credited to everyone who confirmed it that day (👍, a saved shortage
 * report, a ❤️ "all missing"; for a backup list, any reply or reaction) —
 * and the orders posted that day that nobody confirmed. Read from what the
 * webhook Lambda saves; orders already delivered still count, since their
 * group records are kept after their messages are deleted (30 days).
 */

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
    /** Items the preparers reported short: ordered, and what they said is available (in the item's own unit). */
    short: { description: string; short: number; unit: string; available: number; ordered: number }[]
}

export type PersonReport = {
    /** The Telegram user id (or "name:<name>" for an older record without one). */
    id: string
    name: string
    orders: PersonOrder[]
    /** Shortage reports this person sent that day (saved, not deleted). */
    reports: number
}

export type PreparationReportData = {
    day: string
    generatedAt: Date
    /** False while the business day is still running. */
    isComplete: boolean
    people: PersonReport[]
    /** Orders first posted that day that nobody confirmed. */
    unreported: { order_id: string; order_number: string; kind: GroupOrderMessage["kind"]; posted_at: string; items: number }[]
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
        const created: PersonReport = { id, name: name || "?", orders: [], reports: 0 }
        people.set(id, created)
        return created
    }
    const unreported: PreparationReportData["unreported"] = []

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
        const items = new Set(current.flatMap((message) => message.items.map((item) => item.item_key))).size
        const short = preparation.items
            .filter((item) => item.short > 0)
            .map((item) => ({ description: item.description, short: item.short, unit: item.unit, available: item.available, ordered: item.ordered }))

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
            })
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
            unreported.push({ order_id: orderId, order_number: first.order_number, kind: first.kind, posted_at: first.posted_at, items })
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
    }
}

/**
 * Everyone who confirmed an order or sent a shortage report that day, for
 * the app's "report per person" list: id, name, and how many of each.
 */
export async function preparationPeople(day: string) {
    const report = await buildPreparationReport(day)
    return report.people.map((entry) => ({ id: entry.id, name: entry.name, orders: entry.orders.length, reports: entry.reports }))
}
