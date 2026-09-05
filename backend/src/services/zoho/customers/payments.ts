import { getAppliedInvoices } from "../../../utils/getAppliedInvoices.js";
import { todayInBusinessTimezone } from "../../../utils/businessDate.js";
import { ZohoApi } from "../client.js"
import { ZohoGetInvoices } from "../invoices/index.js";

type PaymentMode = "cash" | "creditcard" | "banktransfer"

/**
 * Records a payment against the customer as a whole, spreading the amount
 * across their open invoices oldest-first (see getAppliedInvoices) rather
 * than against one specific invoice.
 */
export async function recordCustomerPayment(headers: string, customerId: string, amount: number, paymentMode: PaymentMode = "cash"){

    try {
        const invoices = await ZohoGetInvoices(headers, { customer_id: customerId })
        const response = await ZohoApi("customerpayments", headers, "POST", {
            customer_id: customerId,
            payment_mode: paymentMode,
            date: todayInBusinessTimezone(),
            amount,
            invoices: getAppliedInvoices(invoices, amount)
        })
        return response.payment;
    } catch (error) {
        console.error(error);
        throw error;
    }
}
