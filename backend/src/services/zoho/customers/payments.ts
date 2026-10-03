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

/** The fields of a Zoho customer payment the app reads. */
export type CustomerPaymentSummary = {
    payment_id: string
    payment_number?: string
    date: string
    amount: number
    payment_mode?: string
    customer_id: string
}

/**
 * The customer's most recent payments, newest first — both customer-level
 * payments and ones recorded against a single invoice, since Zoho stores
 * both as customer payments.
 */
export async function ZohoGetRecentCustomerPayments(headers: string, customerId: string, limit = 3): Promise<CustomerPaymentSummary[]> {

    try {
        const query = new URLSearchParams({
            customer_id: customerId,
            sort_column: "date",
            sort_order: "D",
            per_page: String(limit),
        }).toString()
        const response = await ZohoApi(`customerpayments?${query}`, headers)
        if (!Array.isArray(response.customerpayments)) throw new Error(response.message ?? "Failed to fetch customer payments")
        return response.customerpayments.slice(0, limit)
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Fetches one customer payment. */
export async function ZohoGetCustomerPaymentById(headers: string, paymentId: string): Promise<CustomerPaymentSummary> {

    try {
        const response = await ZohoApi(`customerpayments/${encodeURIComponent(paymentId)}`, headers)
        if (!response.payment) throw new Error(response.message ?? "Payment not found")
        return response.payment
    } catch (error) {
        console.error(error);
        throw error;
    }
}
