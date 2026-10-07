import { redisClient } from "../../config/redis.js"
import { ZohoGetInvoiceById, ZohoGetInvoices } from "../zoho/invoices/index.js"
import {
    ZohoAddCreditNoteComment,
    ZohoApplyCreditNoteToInvoice,
    ZohoApplyCreditNoteToInvoices,
    ZohoCreateCreditNote,
    ZohoGetCreditNote,
    type ZohoCreditNote,
} from "../zoho/creditNotes.js"
import type { LineItem, ZohoInvoice } from "../zoho/types.js"
import { todayInBusinessTimezone } from "../../utils/businessDate.js"

/**
 * "Return Invoice" in the app = a Zoho credit note against the original
 * invoice. Everything a return contains (customer, items, prices, taxes) is
 * taken from the original invoice as stored in Zoho — the caller only says
 * which items and how many.
 *
 * Zoho can't list credit notes by invoice, so the ids of the returns made
 * here are kept per invoice in Redis (`invoice-returns:<invoice_id>`, a set,
 * no expiry) and re-read from Zoho on every check, so a return deleted or
 * voided in Zoho no longer counts. Returns created directly in Zoho's own
 * UI aren't known to the app.
 */

const returnsKey = (invoiceId: string) => `invoice-returns:${invoiceId}`
const lockKey = (invoiceId: string) => `invoice-returns:lock:${invoiceId}`
const LOCK_MS = 60_000

/** Quantities are compared with a little slack for decimal units (kg, litres). */
const EPSILON = 1e-6

const NOT_RETURNABLE_STATUSES = new Set(["draft", "void"])

export type ReturnableItem = {
    item_id: string
    name: string
    description: string
    unit: string
    /** Price credited per unit: the line's price after its own and the invoice-wide discount. */
    rate: number
    invoiced: number
    returned: number
    returnable: number
}

export type PastReturn = {
    creditnote_id: string
    creditnote_number: string
    date: string
    status: string
    total: number
}

export type ReturnSummary = {
    invoice_id: string
    invoice_number: string
    customer_name: string
    items: ReturnableItem[]
    returns: PastReturn[]
}

function round2(value: number) {
    return Math.round(value * 100) / 100
}

/**
 * Share of each line's value still owed after an invoice-wide (entity-level)
 * discount, e.g. 0.95 for a 50 discount on a 1,000 subtotal. Returns are
 * credited at the discounted price so a customer is never refunded more
 * than they were charged.
 */
function invoiceDiscountFactor(invoice: ZohoInvoice): number {
    if (invoice.discount_type !== "entity_level" || !invoice.discount || !invoice.sub_total) return 1
    const raw = String(invoice.discount)
    const amount = raw.trim().endsWith("%") ? (parseFloat(raw) / 100) * invoice.sub_total : Number(raw)
    if (!Number.isFinite(amount) || amount <= 0) return 1
    return Math.max(0, 1 - amount / invoice.sub_total)
}

/** The invoice's lines grouped by item (the same item can appear on more than one line). */
function invoicedByItem(invoice: ZohoInvoice) {
    const factor = invoiceDiscountFactor(invoice)
    const items = new Map<string, { line: LineItem; quantity: number; value: number }>()
    for (const line of invoice.line_items ?? []) {
        if (!line.item_id || !(line.quantity > 0)) continue
        const id = String(line.item_id)
        const existing = items.get(id)
        // item_total is after the line's own discount.
        const value = (line.item_total ?? line.rate * line.quantity) * factor
        items.set(id, {
            line: existing?.line ?? line,
            quantity: (existing?.quantity ?? 0) + line.quantity,
            value: (existing?.value ?? 0) + value,
        })
    }
    return items
}

/** This invoice's returns still present (and not void) in Zoho. */
async function loadReturns(headers: string, invoiceId: string): Promise<ZohoCreditNote[]> {
    const ids = await redisClient.sMembers(returnsKey(invoiceId))
    const notes = await Promise.all(ids.map((id) => ZohoGetCreditNote(headers, id)))
    const active: ZohoCreditNote[] = []
    for (const [index, note] of notes.entries()) {
        if (!note) {
            // Deleted in Zoho: forget it, which frees its quantities again.
            await redisClient.sRem(returnsKey(invoiceId), ids[index]!)
            continue
        }
        if (note.status !== "void") active.push(note)
    }
    return active
}

function returnedByItem(returns: ZohoCreditNote[]) {
    const returned = new Map<string, number>()
    for (const note of returns) {
        for (const line of note.line_items ?? []) {
            const id = String(line.item_id)
            returned.set(id, (returned.get(id) ?? 0) + Number(line.quantity || 0))
        }
    }
    return returned
}

function buildSummary(invoice: ZohoInvoice, returns: ZohoCreditNote[]): ReturnSummary {
    const invoiced = invoicedByItem(invoice)
    const returned = returnedByItem(returns)
    const items: ReturnableItem[] = []
    for (const [id, { line, quantity, value }] of invoiced) {
        const alreadyReturned = returned.get(id) ?? 0
        items.push({
            item_id: id,
            name: line.name,
            description: line.description ?? "",
            unit: line.unit ?? "",
            rate: round2(value / quantity),
            invoiced: quantity,
            returned: alreadyReturned,
            returnable: Math.max(0, round2(quantity - alreadyReturned)),
        })
    }
    return {
        invoice_id: String(invoice.invoice_id),
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        items,
        returns: returns.map((note) => ({
            creditnote_id: String(note.creditnote_id),
            creditnote_number: note.creditnote_number,
            date: note.date,
            status: note.status,
            total: note.total,
        })),
    }
}

function assertReturnable(invoice: ZohoInvoice) {
    if (NOT_RETURNABLE_STATUSES.has(invoice.status)) {
        throw new Error(invoice.status === "draft" ? "A draft invoice can't be returned — edit its items instead." : "A void invoice can't be returned.")
    }
}

/** What can still be returned from an invoice, and the returns made so far. */
export async function getInvoiceReturnSummary(headers: string, invoiceId: string): Promise<ReturnSummary> {
    const invoice: ZohoInvoice = await ZohoGetInvoiceById(headers, invoiceId)
    assertReturnable(invoice)
    return buildSummary(invoice, await loadReturns(headers, invoiceId))
}

export type ReturnRequestItem = { item_id: string; quantity: number }

export type CreatedReturn = {
    creditnote_id: string
    creditnote_number: string
    total: number
    /** Credit applied to the original invoice's unpaid balance (0 if it was already paid). */
    applied_to_invoice: number
    /** The rest, applied to the customer's other unpaid invoices, oldest first. */
    applied_to_other_invoices: { invoice_id: string; invoice_number: string; amount: number }[]
    /** Whatever's left after that (the customer owes nothing more): kept as credit on their account. */
    left_as_credit: number
    /** Set when the return was created but a follow-up step (applying credit, saving the reason) failed. */
    warnings: string[]
}

/** Validates the request shape: a non-empty list of known items with positive quantities, each item once. */
export function parseReturnItems(body: unknown): ReturnRequestItem[] {
    if (!Array.isArray(body) || body.length === 0) throw new Error("Choose at least one item to return")
    const seen = new Set<string>()
    return body.map((entry: any) => {
        const item_id = String(entry?.item_id ?? "")
        const quantity = Number(entry?.quantity)
        if (!item_id) throw new Error("Each returned item needs an item_id")
        if (seen.has(item_id)) throw new Error("Each item can only be listed once")
        seen.add(item_id)
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Returned quantities must be greater than zero")
        return { item_id, quantity }
    })
}

/**
 * Creates a return (credit note) for some of an invoice's items. Quantities
 * are checked again here against what's still returnable — under a per-invoice
 * lock, so two returns at once can't both pass the check. The return's
 * credit then comes straight off what the customer owes: first the original
 * invoice's unpaid balance, then their other unpaid invoices, oldest first.
 * Only what's left after all of that (they owe nothing more) stays as
 * credit on their account.
 */
export async function createInvoiceReturn(
    headers: string,
    invoiceId: string,
    requested: ReturnRequestItem[],
    reason?: string,
): Promise<CreatedReturn> {
    const locked = await redisClient.set(lockKey(invoiceId), "1", { NX: true, PX: LOCK_MS })
    if (!locked) throw new Error("Another return for this invoice is being saved — try again in a moment.")

    try {
        const invoice: ZohoInvoice = await ZohoGetInvoiceById(headers, invoiceId)
        assertReturnable(invoice)
        const summary = buildSummary(invoice, await loadReturns(headers, invoiceId))
        const invoiced = invoicedByItem(invoice)

        const lineItems = requested.map(({ item_id, quantity }) => {
            const item = summary.items.find((i) => i.item_id === item_id)
            const source = invoiced.get(item_id)?.line
            if (!item || !source) throw new Error("One of the returned items isn't on this invoice")
            if (quantity > item.returnable + EPSILON) {
                throw new Error(
                    item.returnable > 0
                        ? `Only ${item.returnable} of ${item.name} can still be returned`
                        : `${item.name} has already been fully returned`,
                )
            }
            return {
                item_id,
                name: source.name,
                description: source.description,
                quantity,
                rate: item.rate,
                ...(source.unit && { unit: source.unit }),
                ...(source.tax_id && { tax_id: String(source.tax_id) }),
                ...(source.product_type && { product_type: source.product_type }),
                item_total: round2(item.rate * quantity),
            }
        })

        const creditNote = await ZohoCreateCreditNote(headers, invoiceId, {
            customer_id: String(invoice.customer_id),
            date: todayInBusinessTimezone(),
            // Ties the return back to the invoice in Zoho's own lists.
            reference_number: invoice.invoice_number,
            line_items: lineItems,
        })
        const creditNoteId = String(creditNote.creditnote_id)
        await redisClient.sAdd(returnsKey(invoiceId), creditNoteId)

        const warnings: string[] = []

        let appliedToInvoice = 0
        let creditLeft = 0
        try {
            // Re-read both: Zoho may already have applied the credit itself.
            const [freshInvoice, freshNote] = await Promise.all([
                ZohoGetInvoiceById(headers, invoiceId) as Promise<ZohoInvoice>,
                ZohoGetCreditNote(headers, creditNoteId),
            ])
            creditLeft = round2(freshNote?.balance ?? 0)
            const amount = round2(Math.min(freshInvoice.balance ?? 0, creditLeft))
            if (amount > 0) {
                await ZohoApplyCreditNoteToInvoice(headers, creditNoteId, invoiceId, amount)
                appliedToInvoice = amount
                creditLeft = round2(creditLeft - amount)
            }
        } catch (error) {
            console.error(`Return ${creditNote.creditnote_number}: applying credit to invoice ${invoiceId} failed:`, error)
            warnings.push("The return was saved, but its credit couldn't be applied to the invoice — apply it in Zoho.")
            creditLeft = 0 // unknown: don't spread it over other invoices either
        }

        let appliedToOthers: CreatedReturn["applied_to_other_invoices"] = []
        if (creditLeft > 0) {
            try {
                appliedToOthers = await applyToOtherUnpaidInvoices(headers, creditNoteId, String(invoice.customer_id), invoiceId, creditLeft)
                creditLeft = round2(creditLeft - appliedToOthers.reduce((sum, a) => sum + a.amount, 0))
            } catch (error) {
                console.error(`Return ${creditNote.creditnote_number}: applying credit to other invoices failed:`, error)
                warnings.push("The return was saved, but its credit couldn't be taken off the customer's other invoices — apply it in Zoho.")
            }
        }

        const trimmedReason = reason?.trim()
        if (trimmedReason) {
            try {
                await ZohoAddCreditNoteComment(headers, creditNoteId, trimmedReason)
            } catch (error) {
                console.error(`Return ${creditNote.creditnote_number}: saving the reason failed:`, error)
                warnings.push("The return was saved, but its reason couldn't be added.")
            }
        }

        return {
            creditnote_id: creditNoteId,
            creditnote_number: creditNote.creditnote_number,
            total: creditNote.total,
            applied_to_invoice: appliedToInvoice,
            applied_to_other_invoices: appliedToOthers,
            left_as_credit: creditLeft,
            warnings,
        }
    } finally {
        await redisClient.del(lockKey(invoiceId))
    }
}

/**
 * Spreads `amount` of a return's credit over the customer's other unpaid
 * invoices, oldest first, so it reduces what they owe instead of sitting as
 * unused credit. Returns what went where.
 */
async function applyToOtherUnpaidInvoices(
    headers: string,
    creditNoteId: string,
    customerId: string,
    originalInvoiceId: string,
    amount: number,
): Promise<CreatedReturn["applied_to_other_invoices"]> {
    const invoices: ZohoInvoice[] = (await ZohoGetInvoices(headers, { customer_id: customerId, per_page: 200 })) ?? []
    const unpaid = invoices
        .filter((inv) => String(inv.invoice_id) !== originalInvoiceId && !NOT_RETURNABLE_STATUSES.has(inv.status) && (inv.balance ?? 0) > 0)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))

    let remaining = amount
    const allocations: CreatedReturn["applied_to_other_invoices"] = []
    for (const inv of unpaid) {
        if (remaining <= 0) break
        const share = round2(Math.min(inv.balance, remaining))
        if (share <= 0) continue
        allocations.push({ invoice_id: String(inv.invoice_id), invoice_number: inv.invoice_number, amount: share })
        remaining = round2(remaining - share)
    }
    if (allocations.length) {
        await ZohoApplyCreditNoteToInvoices(
            headers,
            creditNoteId,
            allocations.map((a) => ({ invoice_id: a.invoice_id, amount_applied: a.amount })),
        )
    }
    return allocations
}

/**
 * A return made from this invoice, with the invoice itself — for its return
 * notice PDF. Only returns this app recorded for the invoice can be read,
 * so a credit note id from elsewhere can't be fetched through it.
 */
export async function getInvoiceReturn(headers: string, invoiceId: string, creditNoteId: string) {
    if (!(await redisClient.sIsMember(returnsKey(invoiceId), creditNoteId))) throw new Error("Return not found for this invoice")
    const [invoice, creditNote] = await Promise.all([
        ZohoGetInvoiceById(headers, invoiceId) as Promise<ZohoInvoice>,
        ZohoGetCreditNote(headers, creditNoteId),
    ])
    if (!creditNote) throw new Error("This return no longer exists in Zoho")
    return { invoice, creditNote }
}

/**
 * Just the returns made from an invoice (for its page's "Returns" list).
 * Reads Zoho only when the app has recorded any, so viewing an invoice with
 * no returns costs no Zoho calls.
 */
export async function listInvoiceReturns(headers: string, invoiceId: string): Promise<PastReturn[]> {
    if ((await redisClient.sCard(returnsKey(invoiceId))) === 0) return []
    return (await loadReturns(headers, invoiceId)).map((note) => ({
        creditnote_id: String(note.creditnote_id),
        creditnote_number: note.creditnote_number,
        date: note.date,
        status: note.status,
        total: note.total,
    }))
}
