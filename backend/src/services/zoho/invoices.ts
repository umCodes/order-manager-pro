import { quantityCalc } from "../../utils/calcs.js"
import { ZohoApi } from "./client.js"

export async function ZohoGetDrafts(headers: string){

    try {
        const response = await ZohoApi("invoices?status=draft", headers)
        return response.invoices;
    } catch (error) {
        throw error;
    }
}

export async function ZohoGetInvoices(headers: string, params?: Record<string, string | number | boolean>){

    try {
        const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ""
        const response = await ZohoApi(`invoices${query}`, headers)
        return response.invoices;
    } catch (error) {
        throw error;
    }
}

/** The draft a new invoice for this customer would be merged into, if any (most recently created). */
export async function ZohoGetDraftToMergeInto(headers: string, customerId: string) {
    try {
        const drafts = await ZohoGetInvoices(headers, { status: "draft", customer_id: customerId })
        const sorted = [...drafts].sort(
            (a: any, b: any) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
        )
        return sorted[0] ?? null
    } catch (error) {
        throw error;
    }
}

export async function ZohoGetInvoiceById(headers: string, id: string){

    try {
        const response = await ZohoApi(`invoices/${id}`, headers)
        return response.invoice;
    } catch (error) {
        console.error(error);
        throw error;
    }
}
export async function ZohoCreateInvoice(headers: string, invoice_details: any){

    try {
        const response = await ZohoApi("invoices", headers, "POST", invoice_details)
        return response.invoice;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export async function ZohoUpdateInvoice(headers: string, id: string, invoice_details: any){

    try {
        const response = await ZohoApi(`invoices/${id}`, headers, "PUT", invoice_details)
        return response.invoice;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export async function ZohoMarkInvoiceAsSent(headers: string, id: string){

    try {
        const response = await ZohoApi(`invoices/${id}/status/sent`, headers, "POST")
        return response.invoice;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

type PaymentMode = "check" | "cash" | "creditcard" | "banktransfer" | "bankremittance" | "autotransaction" | "others"

export async function recordInvoicePayment(headers: string, invoiceId: string, amount: number, paymentMode: PaymentMode = "cash"){

    try {
        const invoice = await ZohoGetInvoiceById(headers, invoiceId)
        const response = await ZohoApi("customerpayments", headers, "POST", {
            customer_id: invoice.customer_id,
            payment_mode: paymentMode,
            amount,
            // date: new Date().toISOString().slice(0, 10),
            invoices: [{ invoice_id: invoiceId, amount_applied: amount }]
        })
        return response.payment;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// ---- Temp use ----

export async function ZohoGetDraftInvoicesWithLineItems(headers: string): Promise<string[]> {
    try {
        const drafts = await ZohoGetDrafts(headers);

        const invoiceTexts: string[] = await Promise.all(
            drafts.map(async (draft: any) => {
                console.log("draft", draft)
                const fullInvoice = await ZohoGetInvoiceById(headers, draft.invoice_id);
                const lineItems = fullInvoice.line_items;
                console.log(fullInvoice, lineItems)
                return `${fullInvoice.invoice_number}:\n\n${lineItems
                    .map((item: any) => {
                        const quantity = quantityCalc(item.quantity, item.unit);
                        return `${quantity} ${item.description}`;
                    })
                    .join("\n")}`;
            })
        );

        return invoiceTexts;
    } catch (error) {
        console.error(error);
        throw error;
    }
}
