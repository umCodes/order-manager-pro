import { ZohoApi } from "../client.js"
import { ZohoGetInvoiceById } from "./queries.js"
import { ZohoUpdateInvoice } from "./mutations.js"

type PaymentMode = "check" | "cash" | "creditcard" | "banktransfer" | "bankremittance" | "autotransaction" | "others"

/**
 * Records a payment against one specific invoice. An optional discount is
 * applied to the invoice first (as an entity-level Zoho discount), so the
 * balance the payment is checked against is the post-discount one.
 */
export async function recordInvoicePayment(headers: string, invoiceId: string, amount: number, paymentMode: PaymentMode = "cash", discount?: number){

    try {
        if (discount) {
            await ZohoUpdateInvoice(headers, invoiceId, {
                discount,
                discount_type: "entity_level",
            })
        }

        const invoice = await ZohoGetInvoiceById(headers, invoiceId)
        if (amount > invoice.balance) {
            throw new Error("Payment amount exceeds the invoice's outstanding balance");
        }

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
