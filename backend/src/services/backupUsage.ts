import { redisClient } from "../config/redis.js"
import { listBackupLists, withReportedAvailability, type BackupList, type BackupListItemWithReport } from "./backupLists.js"
import { getGeneralItemIds } from "./generalItems.js"
import { itemKeyFor } from "./telegram/invoices/itemNumbers.js"
import { fromTelegramAmount, telegramAmount } from "../utils/quantity.js"
import { businessDayWindow, businessDayKey } from "../utils/businessDate.js"

/**
 * Backup stock taken by quick invoices: an invoice marked as sent (or paid
 * as a draft) within QUICK_MINUTES of being created was handed over from
 * backup stock rather than prepared, whether or not it went to Telegram. Its
 * items are taken from the backup lists, oldest list first — the same item
 * (a general item by its description too) in an amount both count the same
 * way (kg, a box being 10kg, or a count for a pack), partial amounts
 * allowed. What no list has is recorded as missing. Each list item's
 * starting amount is what the preparers reported available, or its quantity.
 *
 * Bookkeeping in Redis only; nothing in Zoho changes. Kept 30 days, like the lists.
 *
 *   backup-usage:<invoice id> → BackupUsage (JSON)
 *   backup-usages             → sorted set of invoice ids by when they were sent
 */

export const QUICK_MINUTES = 15
const KEEP_SECONDS = 30 * 24 * 60 * 60
const usageKey = (invoiceId: string) => `backup-usage:${invoiceId}`
const INDEX_KEY = "backup-usages"
const LOCK_KEY = "backup-usage:lock"

/** Part of a backup list item taken by an invoice, in the list item's unit. */
export type BackupTake = { list_id: string; number: number; item_id: string; description: string; quantity: number; unit: string }
/** Part of an invoice's item no backup list had, in the invoice's unit. */
export type BackupMissing = { item_id: string; name: string; description: string; quantity: number; unit: string }

export type BackupUsage = {
    invoice_id: string
    invoice_number: string
    customer_name: string
    at: string
    takes: BackupTake[]
    missing: BackupMissing[]
}

const round = (quantity: number) => Math.round(quantity * 1000) / 1000

/** Zoho's created_time ("2026-10-31T10:15:00+0300") as a time. */
function createdAt(invoice: any): number {
    return Date.parse(String(invoice.created_time ?? "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"))
}

/** Whether an invoice sent `at` was sent within QUICK_MINUTES of being created. */
export function isQuickInvoice(invoice: any, at: Date = new Date()): boolean {
    const created = createdAt(invoice)
    return Number.isFinite(created) && at.getTime() - created <= QUICK_MINUTES * 60 * 1000
}

async function allUsages(): Promise<BackupUsage[]> {
    await redisClient.zRemRangeByScore(INDEX_KEY, 0, Date.now() - KEEP_SECONDS * 1000)
    const ids = await redisClient.zRange(INDEX_KEY, 0, -1)
    if (ids.length === 0) return []
    return (await redisClient.mGet(ids.map(usageKey))).filter((raw): raw is string => !!raw).map((raw) => JSON.parse(raw) as BackupUsage)
}

/** How much of each list item (`<list id>:<number>`) invoices have taken, in its own unit. */
export async function takenFromBackup(): Promise<Map<string, { quantity: number; by: { invoice_number: string; customer_name: string; quantity: number }[] }>> {
    const taken = new Map<string, { quantity: number; by: { invoice_number: string; customer_name: string; quantity: number }[] }>()
    for (const usage of await allUsages()) {
        for (const take of usage.takes) {
            const key = `${take.list_id}:${take.number}`
            const entry = taken.get(key) ?? { quantity: 0, by: [] }
            entry.quantity = round(entry.quantity + take.quantity)
            entry.by.push({ invoice_number: usage.invoice_number, customer_name: usage.customer_name, quantity: take.quantity })
            taken.set(key, entry)
        }
    }
    return taken
}

/** One invoice at a time, so two quick invoices never take the same stock. */
async function withLock<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (await redisClient.set(LOCK_KEY, "1", { NX: true, PX: 10_000 })) {
            try {
                return await work()
            } finally {
                await redisClient.del(LOCK_KEY)
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error("Backup stock is busy; try again")
}

/**
 * Takes a quick invoice's items from the backup lists (see above). Does
 * nothing for an invoice that wasn't quick, or was already taken for.
 * Best-effort: a failure is logged, never thrown, so sending the invoice
 * never fails over it. Returns what was recorded, if anything.
 */
export async function takeBackupForQuickInvoice(invoice: any, sentAt: Date = new Date()): Promise<BackupUsage | null> {
    try {
        if (!isQuickInvoice(invoice, sentAt)) return null
        const invoiceId = String(invoice.invoice_id)
        return await withLock(async () => {
            if (await redisClient.exists(usageKey(invoiceId))) return null

            const keyOf = itemKeyFor(await getGeneralItemIds())
            const lists = (await withReportedAvailability(await listBackupLists())).reverse() // oldest first
            const taken = await takenFromBackup()
            const left = new Map<string, number>()
            const leftOf = (list: BackupList, item: BackupList["items"][number] & { available?: number }) => {
                const key = `${list.id}:${item.number}`
                if (!left.has(key)) left.set(key, round((item.available ?? item.quantity) - (taken.get(key)?.quantity ?? 0)))
                return left.get(key)!
            }

            const usage: BackupUsage = {
                invoice_id: invoiceId,
                invoice_number: String(invoice.invoice_number ?? ""),
                customer_name: String(invoice.customer_name ?? ""),
                at: sentAt.toISOString(),
                takes: [],
                missing: [],
            }

            for (const line of invoice.line_items ?? []) {
                const need = telegramAmount(Number(line.quantity) || 0, String(line.unit ?? ""))
                let remaining = need.amount
                for (const list of lists) {
                    for (const item of list.items) {
                        if (remaining <= 0) break
                        if (keyOf(item) !== keyOf(line)) continue
                        const has = telegramAmount(leftOf(list, item), item.unit)
                        if (has.unit !== need.unit || has.amount <= 0) continue
                        const take = Math.min(has.amount, remaining)
                        const inItsUnit = round(fromTelegramAmount(take, item.unit))
                        left.set(`${list.id}:${item.number}`, round(leftOf(list, item) - inItsUnit))
                        remaining = round(remaining - take)
                        usage.takes.push({ list_id: list.id, number: item.number, item_id: item.item_id, description: item.description, quantity: inItsUnit, unit: item.unit })
                    }
                }
                if (remaining > 0) {
                    usage.missing.push({
                        item_id: String(line.item_id ?? ""),
                        name: String(line.name ?? ""),
                        description: String(line.description ?? ""),
                        quantity: round(fromTelegramAmount(remaining, String(line.unit ?? ""))),
                        unit: String(line.unit ?? ""),
                    })
                }
            }

            await redisClient.set(usageKey(invoiceId), JSON.stringify(usage), { EX: KEEP_SECONDS })
            await redisClient.zAdd(INDEX_KEY, { score: sentAt.getTime(), value: invoiceId })
            console.log(`Backup: ${usage.invoice_number} took ${usage.takes.length} item(s) from backup, ${usage.missing.length} missing`)
            return usage
        })
    } catch (error) {
        console.error(`Backup: couldn't take ${invoice?.invoice_number}'s items from backup`, error)
        return null
    }
}

/** Gives a voided invoice's backup stock back. */
export async function releaseBackupUsage(invoiceId: string) {
    await redisClient.del(usageKey(invoiceId))
    await redisClient.zRem(INDEX_KEY, invoiceId)
}

/** Items quick invoices sent today (business day) that no backup list had — the Items tab's "Missing from backup". */
export async function missingFromBackupToday(): Promise<(BackupMissing & { invoice_number: string; customer_name: string; at: string })[]> {
    const { start } = businessDayWindow(businessDayKey())
    return (await allUsages())
        .filter((usage) => Date.parse(usage.at) >= start.getTime())
        .flatMap((usage) => usage.missing.map((item) => ({ ...item, invoice_number: usage.invoice_number, customer_name: usage.customer_name, at: usage.at })))
}

export type BackupListItemWithUse = BackupList["items"][number] & {
    available?: number
    short?: number
    /** How much quick invoices took, and which. */
    taken?: number
    taken_by?: { invoice_number: string; customer_name: string; quantity: number }[]
    /** What's left: what was reported available (or the quantity), less what was taken. */
    remaining: number
}

/** Each list with what was reported short (see withReportedAvailability) and what quick invoices took. */
export async function withBackupUse(lists: BackupList[]): Promise<(BackupList & { items: BackupListItemWithUse[] })[]> {
    const [reported, taken] = await Promise.all([withReportedAvailability(lists), takenFromBackup()])
    return reported.map((list) => ({
        ...list,
        items: (list.items as BackupListItemWithReport[]).map((item) => {
            const use = taken.get(`${list.id}:${item.number}`)
            const start = item.available ?? item.quantity
            return {
                ...item,
                ...(use ? { taken: use.quantity, taken_by: use.by } : {}),
                remaining: round(Math.max(0, start - (use?.quantity ?? 0))),
            }
        }),
    }))
}

/** The lists as they actually are: each item's quantity is what's left, and items with nothing left are left out. */
export async function remainingBackup(lists: BackupList[]): Promise<BackupList[]> {
    return (await withBackupUse(lists)).map((list) => ({
        ...list,
        items: (list.items as BackupListItemWithUse[])
            .filter((item) => item.remaining > 0)
            .map(({ number, item_id, name, description, unit, remaining }) => ({ number, item_id, name, description, unit, quantity: remaining })),
    }))
}
