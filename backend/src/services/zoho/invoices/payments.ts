import { ZohoApi } from "../client.js"
import { ZohoGetInvoiceById } from "./queries.js"
import { addInvoiceDiscount, removeInvoiceDiscounts } from "./discounts.js"

type PaymentMode = "check" | "cash" | "creditcard" | "banktransfer" | "bankremittance" | "autotransaction" | "others"

/**
 * Records a payment against one specific invoice. An optional discount is
 * added to the invoice first (on top of any discount it already has), so the
 * balance the payment is checked against is the post-discount one. If the
 * payment then fails, the discount is taken back off.
 */
export async function recordInvoicePayment(headers: string, invoiceId: string, amount: number, paymentMode: PaymentMode = "cash", discount?: number){

    try {
        const applied = discount
            ? await addInvoiceDiscount(
                headers,
                await ZohoGetInvoiceById(headers, invoiceId),
                discount,
                `Discount of ${discount} applied with a payment of ${amount}`,
            )
            : null

        try {
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
            if (!response.payment) throw new Error(response.message ?? "Failed to record payment")
            return response.payment;
        } catch (error) {
            if (applied) await removeInvoiceDiscounts(headers, [applied])
            throw error
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}
