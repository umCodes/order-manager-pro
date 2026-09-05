import { ZohoGetInvoiceById } from "./queries.js"
import { ZohoCreateInvoice, ZohoUpdateInvoice } from "./mutations.js"

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
