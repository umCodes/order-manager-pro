import { quantityCalc } from "../../../utils/quantity.js"
import { ZohoGetDrafts, ZohoGetInvoiceById } from "./queries.js"

/**
 * Renders every draft invoice as the plain-text block used in Telegram
 * messages ("<invoice number>:" then one line per item).
 *
 * Marked "temp use" by its author and currently called from nowhere — kept
 * because it's a handy one-off for manually dumping the drafts, not because
 * anything depends on it.
 */
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
