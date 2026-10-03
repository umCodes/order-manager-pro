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
 * The customer's payments, newest first — both customer-level payments and
 * ones recorded against a single invoice, since Zoho stores both as
 * customer payments. Filtered by `customer_name` (a documented filter;
 * customer names are unique), then kept to rows whose `customer_id` matches
 * in case Zoho's name filter is a partial match, and sorted here.
 */
export async function ZohoGetCustomerPayments(headers: string, customerId: string, customerName: string): Promise<CustomerPaymentSummary[]> {

    try {
        const query = new URLSearchParams({
            customer_name: customerName,
            sort_column: "date",
            per_page: "200",
        }).toString()
        const response = await ZohoApi(`customerpayments?${query}`, headers)
        if (!Array.isArray(response.customerpayments)) throw new Error(response.message ?? "Failed to fetch customer payments")
        return (response.customerpayments as CustomerPaymentSummary[])
            .filter((p) => String(p.customer_id) === customerId)
            .sort((a, b) => b.date.localeCompare(a.date))
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
