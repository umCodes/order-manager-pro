import { ZohoApi } from "./client.js"

/**
 * Zoho credit notes — shown in the app as "Return Invoice". A return is a
 * credit note created against the original invoice (`?invoice_id=`), carrying
 * the returned line items.
 */

export type ZohoCreditNoteLineItem = {
    item_id: string | number
    name?: string
    description?: string
    quantity: number
    rate: number
    unit?: string
    tax_id?: string | number
    item_total?: number
    product_type?: string
}

export type ZohoCreditNote = {
    creditnote_id: string | number
    creditnote_number: string
    date: string
    status: string
    total: number
    /** Credit not yet applied to an invoice or refunded. */
    balance: number
    line_items: ZohoCreditNoteLineItem[]
}

/** Zoho answers errors with a non-zero `code` and a `message`, often with HTTP 200. */
function assertOk(response: any, fallback: string) {
    if (response?.code !== 0) throw new Error(response?.message || fallback)
    return response
}

/** Creates a credit note associated with `invoiceId`. */
export async function ZohoCreateCreditNote(headers: string, invoiceId: string, body: Record<string, unknown>): Promise<ZohoCreditNote> {
    const response = await ZohoApi(`creditnotes?invoice_id=${encodeURIComponent(invoiceId)}`, headers, "POST", body)
    return assertOk(response, "Zoho rejected the return").creditnote
}

/** One credit note, or undefined if it no longer exists in Zoho (deleted there). */
export async function ZohoGetCreditNote(headers: string, creditNoteId: string): Promise<ZohoCreditNote | undefined> {
    const response = await ZohoApi(`creditnotes/${encodeURIComponent(creditNoteId)}`, headers)
    if (response?.code === 0) return response.creditnote
    // Anything other than "doesn't exist" must not be mistaken for a deleted
    // return — that would wrongly free up quantity to be returned again.
    if (/not exist|does not exist|invalid|not found/i.test(String(response?.message ?? ""))) return undefined
    throw new Error(response?.message || "Failed to read a return from Zoho")
}

/** Applies `amount` of a credit note's credit to an invoice (reducing what's owed on it). */
export async function ZohoApplyCreditNoteToInvoice(headers: string, creditNoteId: string, invoiceId: string, amount: number) {
    const response = await ZohoApi(`creditnotes/${encodeURIComponent(creditNoteId)}/invoices`, headers, "POST", {
        invoices: [{ invoice_id: invoiceId, amount_applied: amount }],
    })
    return assertOk(response, "Zoho could not apply the return's credit to the invoice")
}

/** Adds a comment (here: the return reason) to a credit note. */
export async function ZohoAddCreditNoteComment(headers: string, creditNoteId: string, description: string) {
    const response = await ZohoApi(`creditnotes/${encodeURIComponent(creditNoteId)}/comments`, headers, "POST", { description })
    return assertOk(response, "Zoho could not save the return reason")
}
