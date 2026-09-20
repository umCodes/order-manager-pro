import { ZohoApi } from "../client.js"

/** Creates a new invoice. Throws with Zoho's own message if it rejects the payload. */
export async function ZohoCreateInvoice(headers: string, invoice_details: any){

    try {
        const response = await ZohoApi("invoices", headers, "POST", invoice_details)
        if (!response.invoice)throw new Error(response.message)
        return response.invoice;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Updates an invoice. Note that Zoho replaces the entire `line_items` array
 * when one is passed, so callers must send the full desired set, not a delta.
 * Throws with Zoho's own message if it rejects the payload, rather than
 * quietly returning nothing — a caller that goes on to check the invoice's
 * balance needs to know the update actually took effect.
 */
export async function ZohoUpdateInvoice(headers: string, id: string, invoice_details: any){

    try {
        const response = await ZohoApi(`invoices/${id}`, headers, "PUT", invoice_details)
        if (!response.invoice) throw new Error(response.message)
        return response.invoice;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Adds a comment to an invoice's activity timeline in Zoho — used to record
 * why a sent invoice was edited after the fact, since Zoho doesn't otherwise
 * track a reason for a PUT against an already-sent invoice.
 */
export async function ZohoAddInvoiceComment(headers: string, id: string, description: string){

    try {
        const response = await ZohoApi(`invoices/${id}/comments`, headers, "POST", { description })
        if (!response.comment) throw new Error(response.message)
        return response.comment;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Moves an invoice out of draft into "sent" status. */
export async function ZohoMarkInvoiceAsSent(headers: string, id: string){

    try {
        const response = await ZohoApi(`invoices/${id}/status/sent`, headers, "POST")
        return response.invoice;
    } catch (error) {
        console.error(error);
        throw error;
    }
}
