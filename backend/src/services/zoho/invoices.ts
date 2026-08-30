import { quantityCalc } from "../../utils/calcs.js"
import { ZohoApi, ZohoApiRaw } from "./client.js"

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

export async function ZohoGetInvoiceById(headers: string, id: string){

    try {
        const response = await ZohoApi(`invoices/${id}`, headers)
        return response.invoice;
    } catch (error) {
        console.error(error);
        throw error;
    }
}
export async function ZohoGetInvoicePdf(headers: string, id: string){

    try {
        return await ZohoApiRaw(`invoices/${id}?accept=pdf`, headers)
    } catch (error) {
        console.error(error);
        throw error;
    }
}

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

/**
 * Trims a draft invoice down to only `selectedLineItemIds`. If `createNewDraft`
 * is true, the deselected items are moved into a brand-new draft invoice for
 * the same customer first; otherwise they're simply dropped. Returns the
 * trimmed original invoice and the new draft, if one was created. No-op
 * (besides re-fetching) if every line item is selected.
 */
export async function splitInvoiceToSelectedItems(
    headers: string,
    invoiceId: string,
    selectedLineItemIds: string[],
    createNewDraft: boolean,
) {
    try {
        const invoice = await ZohoGetInvoiceById(headers, invoiceId)
        const selectedSet = new Set(selectedLineItemIds)
        const selectedItems = invoice.line_items.filter((item: any) => selectedSet.has(String(item.line_item_id)))
        const remainingItems = invoice.line_items.filter((item: any) => !selectedSet.has(String(item.line_item_id)))

        if (selectedItems.length === 0 || remainingItems.length === 0) {
            return { invoice, newDraft: null }
        }

        const toLineItemPayload = (item: any) => ({
            item_id: item.item_id,
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            unit: item.unit,
        })

        let newDraft = null
        if (createNewDraft) {
            newDraft = await ZohoCreateInvoice(headers, {
                customer_id: invoice.customer_id,
                date: invoice.date,
                line_items: remainingItems.map(toLineItemPayload),
            })
        }

        const trimmedInvoice = await ZohoUpdateInvoice(headers, invoiceId, {
            line_items: selectedItems.map(toLineItemPayload),
        })

        return { invoice: trimmedInvoice, newDraft }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

type PaymentMode = "check" | "cash" | "creditcard" | "banktransfer" | "bankremittance" | "autotransaction" | "others"

export async function recordInvoicePayment(headers: string, invoiceId: string, amount: number, paymentMode: PaymentMode = "cash", discount?: number){

    try {
        if (discount) {
            await ZohoUpdateInvoice(headers, invoiceId, {
                discount,
                discount_type: "entity_level",
            })
        }

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
