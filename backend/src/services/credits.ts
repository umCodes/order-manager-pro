import { getAppliedInvoices } from "../utils/getAppliedInvoices.js"
import { ZohoApi } from "./zoho/client.js"
import { ZohoApplyCreditNoteToInvoices } from "./zoho/creditNotes.js"
import { ZohoGetInvoices } from "./zoho/invoices/index.js"

/**
 * A customer's unused credit — what's left on their returns (credit notes)
 * once nothing was owed to take it off — is used up automatically: when an
 * invoice is delivered (marked as sent) or a payment is recorded, it's
 * applied to their open invoices, oldest credit first, oldest invoice
 * first (the same split a payment uses, see getAppliedInvoices). Zoho
 * doesn't do this by itself.
 */

const round2 = (value: number) => Math.round(value * 100) / 100

export type AppliedCredit = { creditnote_id: string; creditnote_number: string; invoice_id: string; amount: number }

/** The customer's credit notes with credit left on them, oldest first. */
async function unusedCreditNotes(headers: string, customerId: string) {
    const query = new URLSearchParams({ customer_id: customerId, status: "open", per_page: "200" }).toString()
    const response = await ZohoApi(`creditnotes?${query}`, headers)
    if (!Array.isArray(response?.creditnotes)) throw new Error(response?.message ?? "Failed to read the customer's credit notes")
    return (response.creditnotes as any[])
        .filter((note) => String(note.customer_id) === customerId && round2(Number(note.balance) || 0) > 0)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

/**
 * Applies the customer's unused credit to their open invoices. Never throws
 * — a failure here mustn't fail the delivery or payment it follows; it's
 * logged, and whatever was applied before it is kept. Returns what went where.
 */
export async function applyUnusedCredits(headers: string, customerId: string | number | undefined | null): Promise<AppliedCredit[]> {
    if (customerId === undefined || customerId === null || customerId === "") return []
    const id = String(customerId)
    const applied: AppliedCredit[] = []
    try {
        const notes = await unusedCreditNotes(headers, id)
        if (notes.length === 0) return []

        const invoices: any[] = ((await ZohoGetInvoices(headers, { customer_id: id, per_page: 200 })) ?? [])
            .filter((inv: any) => String(inv.customer_id) === id)
            .map((inv: any) => ({ ...inv, balance: round2(Number(inv.balance) || 0) }))

        for (const note of notes) {
            const allocations = getAppliedInvoices(invoices.filter((inv) => inv.balance > 0), round2(Number(note.balance)))
            if (allocations.length === 0) break // nothing left owed
            await ZohoApplyCreditNoteToInvoices(headers, String(note.creditnote_id), allocations)
            for (const allocation of allocations) {
                const invoice = invoices.find((inv) => String(inv.invoice_id) === String(allocation.invoice_id))
                if (invoice) invoice.balance = round2(invoice.balance - allocation.amount_applied)
                applied.push({
                    creditnote_id: String(note.creditnote_id),
                    creditnote_number: String(note.creditnote_number),
                    invoice_id: String(allocation.invoice_id),
                    amount: allocation.amount_applied,
                })
            }
        }

        if (applied.length) {
            console.log(`Credits: applied ${applied.map((a) => `${a.amount} of ${a.creditnote_number} to ${a.invoice_id}`).join(", ")} for customer ${id}`)
        }
    } catch (error) {
        console.error(`Credits: failed to apply the unused credit of customer ${id}`, error)
    }
    return applied
}
