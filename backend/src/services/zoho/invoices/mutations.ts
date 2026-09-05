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
 */
export async function ZohoUpdateInvoice(headers: string, id: string, invoice_details: any){

    try {
        const response = await ZohoApi(`invoices/${id}`, headers, "PUT", invoice_details)
        return response.invoice;
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
