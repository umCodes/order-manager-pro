import { ZohoApi } from "./zoho/client.js"
import { isInvoiceReturn } from "./returns/invoiceReturns.js"

/**
 * A customer's transactions of one type — invoices, payments or returns —
 * dated within a period, read straight from Zoho (no 30-day limit), with the
 * period's totals. Every page of the period is read (Zoho caps a page at
 * 200), so the totals cover the whole period, not just what's shown.
 */

export type TransactionType = "invoices" | "payments" | "returns"
export const TRANSACTION_TYPES: TransactionType[] = ["invoices", "payments", "returns"]

export type InvoiceTransaction = {
    invoice_id: string
    invoice_number: string
    date: string
    status: string
    total: number
    balance: number
}

export type PaymentTransaction = {
    payment_id: string
    payment_number?: string
    date: string
    amount: number
    payment_mode?: string
    /** The invoices it paid, as Zoho lists them ("INV-1, INV-2"). */
    invoice_numbers?: string
}

export type ReturnTransaction = {
    creditnote_id: string
    creditnote_number: string
    date: string
    status: string
    total: number
    /** The invoice it was returned against (Zoho's reference number holds its number). */
    invoice_number?: string
    invoice_id?: string
    /** Whether the app made it, so its return notice PDF can be downloaded. */
    has_notice: boolean
}

export type CustomerTransactions =
    | { type: "invoices"; from: string; to: string; items: InvoiceTransaction[]; totals: { count: number; total: number; balance: number } }
    | { type: "payments"; from: string; to: string; items: PaymentTransaction[]; totals: { count: number; amount: number } }
    | { type: "returns"; from: string; to: string; items: ReturnTransaction[]; totals: { count: number; total: number } }

const PER_PAGE = 200
/** Enough for a few thousand transactions of one customer and type in one period. */
const MAX_PAGES = 15
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const round2 = (value: number) => Math.round(value * 100) / 100
const sum = (values: number[]) => round2(values.reduce((total, value) => total + value, 0))
const byDateDesc = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date)

/** Every row of a Zoho list endpoint for these filters, page by page. */
async function listAll(headers: string, endPoint: string, key: string, params: Record<string, string>) {
    const rows: any[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
        const query = new URLSearchParams({ ...params, page: String(page), per_page: String(PER_PAGE) }).toString()
        const response = await ZohoApi(`${endPoint}?${query}`, headers)
        if (!Array.isArray(response?.[key])) throw new Error(response?.message ?? `Failed to read ${endPoint} from Zoho`)
        rows.push(...response[key])
        if (!response.page_context?.has_more_page) break
    }
    return rows
}

export function validatePeriod(from: unknown, to: unknown) {
    if (typeof from !== "string" || typeof to !== "string" || !DAY_PATTERN.test(from) || !DAY_PATTERN.test(to)) {
        throw new Error("from and to must be dates (YYYY-MM-DD)")
    }
    if (from > to) throw new Error("The period's start is after its end")
    return { from, to }
}

export async function getCustomerTransactions(
    headers: string,
    customerId: string,
    customerName: string,
    type: TransactionType,
    from: string,
    to: string,
): Promise<CustomerTransactions> {
    // Dates are also checked here, in case Zoho ignores a date filter.
    const inPeriod = (row: { date?: string }) => !!row.date && row.date >= from && row.date <= to
    const period = { date_start: from, date_end: to }

    if (type === "invoices") {
        const rows = await listAll(headers, "invoices", "invoices", { customer_id: customerId, ...period, sort_column: "date" })
        const items: InvoiceTransaction[] = rows
            .filter((row) => String(row.customer_id) === customerId && inPeriod(row))
            // Drafts are orders not delivered yet (they're under Drafts); voided ones never happened.
            .filter((row) => row.status !== "draft" && row.status !== "void")
            .map((row) => ({
                invoice_id: String(row.invoice_id),
                invoice_number: String(row.invoice_number),
                date: row.date,
                status: row.status,
                total: round2(Number(row.total) || 0),
                balance: round2(Number(row.balance) || 0),
            }))
            .sort(byDateDesc)
        return {
            type, from, to, items,
            totals: { count: items.length, total: sum(items.map((i) => i.total)), balance: sum(items.map((i) => i.balance)) },
        }
    }

    if (type === "payments") {
        // Filtered by name (see ZohoGetCustomerPayments), then by id in case the name filter is a partial match.
        const rows = await listAll(headers, "customerpayments", "customerpayments", { customer_name: customerName, ...period, sort_column: "date" })
        const items: PaymentTransaction[] = rows
            .filter((row) => String(row.customer_id) === customerId && inPeriod(row))
            .map((row) => ({
                payment_id: String(row.payment_id),
                ...(row.payment_number ? { payment_number: String(row.payment_number) } : {}),
                date: row.date,
                amount: round2(Number(row.amount) || 0),
                ...(row.payment_mode ? { payment_mode: String(row.payment_mode) } : {}),
                ...(row.invoice_numbers ? { invoice_numbers: String(row.invoice_numbers) } : {}),
            }))
            .sort(byDateDesc)
        return { type, from, to, items, totals: { count: items.length, amount: sum(items.map((i) => i.amount)) } }
    }

    const rows = await listAll(headers, "creditnotes", "creditnotes", { customer_id: customerId, ...period })
    const notes = rows
        .filter((row) => String(row.customer_id) === customerId && inPeriod(row))
        .filter((row) => row.status !== "void")
        .sort(byDateDesc)

    // The returned invoice, found by its number; one lookup per invoice.
    const numbers = [...new Set(notes.map((row) => String(row.reference_number ?? "").trim()).filter(Boolean))]
    const invoiceIds = new Map<string, string>()
    await Promise.all(
        numbers.map(async (number) => {
            try {
                const response = await ZohoApi(`invoices?${new URLSearchParams({ customer_id: customerId, invoice_number: number })}`, headers)
                const match = (response?.invoices ?? []).find((inv: any) => String(inv.invoice_number) === number)
                if (match) invoiceIds.set(number, String(match.invoice_id))
            } catch (error) {
                console.error(`Customer transactions: couldn't find invoice ${number}`, error)
            }
        }),
    )

    const items: ReturnTransaction[] = await Promise.all(
        notes.map(async (row) => {
            const invoiceNumber = String(row.reference_number ?? "").trim()
            const invoiceId = invoiceIds.get(invoiceNumber)
            const creditNoteId = String(row.creditnote_id)
            const hasNotice = invoiceId ? await isInvoiceReturn(invoiceId, creditNoteId) : false
            return {
                creditnote_id: creditNoteId,
                creditnote_number: String(row.creditnote_number),
                date: row.date,
                status: row.status,
                total: round2(Number(row.total) || 0),
                ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
                ...(invoiceId ? { invoice_id: invoiceId } : {}),
                has_notice: !!hasNotice,
            }
        }),
    )
    return { type, from, to, items, totals: { count: items.length, total: sum(items.map((i) => i.total)) } }
}
