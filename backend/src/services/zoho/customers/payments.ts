import { getAppliedInvoices } from "../../../utils/getAppliedInvoices.js";
import { todayInBusinessTimezone } from "../../../utils/businessDate.js";
import { ZohoApi } from "../client.js"
import { ZohoGetInvoices, applyCustomerDiscount, removeInvoiceDiscounts } from "../invoices/index.js";

type PaymentMode = "cash" | "creditcard" | "banktransfer"

/** Open invoices a customer-level payment or discount can go on, oldest first. */
function openInvoicesOldestFirst(invoices: any[]) {
    return invoices
        .filter((inv) => inv.status !== "draft" && inv.status !== "paid" && inv.status !== "void")
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Records a payment against the customer as a whole, spreading the amount
 * across their open invoices oldest-first (see getAppliedInvoices) rather
 * than against one specific invoice. An optional discount is placed first
 * (see applyCustomerDiscount), so the payment lands on the reduced balances;
 * if the payment then fails, the discount is taken back off. An amount of 0
 * with a discount records the discount alone, and `payment` is null.
 */
export async function recordCustomerPayment(headers: string, customerId: string, amount: number, paymentMode: PaymentMode = "cash", discount?: number){

    try {
        const discounts = discount
            ? await applyCustomerDiscount(
                headers,
                openInvoicesOldestFirst(await ZohoGetInvoices(headers, { customer_id: customerId })),
                discount,
            )
            : []

        if (!amount) return { payment: null, discounts }

        try {
            // Fetched after the discount so the payment sees the reduced balances.
            const invoices = await ZohoGetInvoices(headers, { customer_id: customerId })
            const response = await ZohoApi("customerpayments", headers, "POST", {
                customer_id: customerId,
                payment_mode: paymentMode,
                date: todayInBusinessTimezone(),
                amount,
                invoices: getAppliedInvoices(invoices, amount)
            })
            if (!response.payment) throw new Error(response.message ?? "Failed to record payment")
            return { payment: response.payment, discounts };
        } catch (error) {
            await removeInvoiceDiscounts(headers, discounts)
            throw error
        }
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

/** A customer payment with the invoices it's applied to (as Zoho returns a single payment). */
type CustomerPaymentDetail = CustomerPaymentSummary & {
    invoices?: { invoice_id: string | number; amount_applied: number }[]
}

const round2 = (value: number) => Math.round(value * 100) / 100

/** Fetches one payment and checks it belongs to `customerId`. */
async function getOwnPayment(headers: string, customerId: string, paymentId: string): Promise<CustomerPaymentDetail> {
    const payment = (await ZohoGetCustomerPaymentById(headers, paymentId)) as CustomerPaymentDetail
    if (String(payment.customer_id) !== customerId) throw new Error("Payment does not belong to this customer")
    return payment
}

/**
 * Changes a payment's amount (the "payment correction"), keeping its date
 * and mode. The new amount is spread over the customer's open invoices
 * oldest-first, the same way a new payment is, counting the invoices this
 * payment already covers as unpaid by it: a smaller amount comes off the
 * newest invoices it covered, a larger one goes on to the next open ones.
 * Returns the payment as it was before and after.
 */
export async function ZohoUpdateCustomerPaymentAmount(headers: string, customerId: string, paymentId: string, amount: number) {
    if (!(amount > 0)) throw new Error("The amount must be more than 0")
    const before = await getOwnPayment(headers, customerId, paymentId)
    if (round2(Number(before.amount)) === round2(amount)) throw new Error("The amount is unchanged")

    const appliedByThisPayment = new Map(
        (before.invoices ?? []).map((inv) => [String(inv.invoice_id), Number(inv.amount_applied) || 0]),
    )
    const invoices: any[] = await ZohoGetInvoices(headers, { customer_id: customerId })
    const asIfUnpaidByThisPayment = invoices.map((inv) => {
        const applied = appliedByThisPayment.get(String(inv.invoice_id)) ?? 0
        if (!applied) return inv
        return { ...inv, balance: round2(Number(inv.balance) + applied), status: inv.status === "paid" ? "partially_paid" : inv.status }
    })

    const response = await ZohoApi(`customerpayments/${encodeURIComponent(paymentId)}`, headers, "PUT", {
        customer_id: customerId,
        payment_mode: before.payment_mode,
        date: before.date,
        amount,
        invoices: getAppliedInvoices(asIfUnpaidByThisPayment, amount),
    })
    if (!response.payment) throw new Error(response.message ?? "Failed to update the payment")
    return { before, after: response.payment as CustomerPaymentSummary }
}

/** Deletes a payment; the invoices it paid go back to owing that amount. Returns the deleted payment. */
export async function ZohoDeleteCustomerPayment(headers: string, customerId: string, paymentId: string) {
    const payment = await getOwnPayment(headers, customerId, paymentId)
    const response = await ZohoApi(`customerpayments/${encodeURIComponent(paymentId)}`, headers, "DELETE")
    if (response.code !== 0) throw new Error(response.message ?? "Failed to delete the payment")
    return payment
}
