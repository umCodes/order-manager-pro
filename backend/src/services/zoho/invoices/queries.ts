import { ZohoApi, ZohoApiRaw } from "../client.js"

/** Every invoice currently in draft status. */
export async function ZohoGetDrafts(headers: string){

    try {
        const response = await ZohoApi("invoices?status=draft", headers)
        return response.invoices;
    } catch (error) {
        throw error;
    }
}

/** Lists invoices, optionally filtered by any Zoho query params (status, customer_id, …). */
export async function ZohoGetInvoices(headers: string, params?: Record<string, string | number | boolean>){

    try {
        const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ""
        const response = await ZohoApi(`invoices${query}`, headers)
        return response.invoices;
    } catch (error) {
        throw error;
    }
}

/** Fetches one invoice in full, including its line items. */
export async function ZohoGetInvoiceById(headers: string, id: string){

    try {
        const response = await ZohoApi(`invoices/${id}`, headers)
        return response.invoice;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Fetches Zoho's own rendered PDF for an invoice, as raw bytes. */
export async function ZohoGetInvoicePdf(headers: string, id: string){

    try {
        return await ZohoApiRaw(`invoices/${id}?accept=pdf`, headers)
    } catch (error) {
        console.error(error);
        throw error;
    }
}
