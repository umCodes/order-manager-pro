import { redisClient } from "../../config/redis.js"
import { ZohoApi } from "../zoho/client.js"
import { ZohoGetCustomersCached } from "../zoho/customers/index.js"
import { daysBetween, IMPORTED_AT_KEY, importCustomerHistory } from "./customerVisits.js"
import { todayInBusinessTimezone } from "../../utils/businessDate.js"

/**
 * One-time import of past visits from Zoho, so existing customers start with
 * their real history instead of all looking "new, never visited". Reads every
 * sent invoice (a purchase on its invoice date) and every payment (a visit),
 * page by page (200 per Zoho request). After this, the app records visits
 * itself and never needs Zoho for them again.
 */

const PER_PAGE = 200
/** Safety cap per list: 40 pages = 8,000 records, 80 Zoho requests at most for both lists. */
const MAX_PAGES = 40
/** A never-invoiced contact older than this is a "potential" customer (no reminders), not a new one. */
const NEW_CUSTOMER_MAX_AGE_DAYS = 30

const NOT_A_PURCHASE = new Set(["draft", "void"])

async function listAll(headers: string, resource: "invoices" | "customerpayments", field: "invoices" | "customerpayments") {
    const rows: any[] = []
    let requests = 0
    for (let page = 1; page <= MAX_PAGES; page++) {
        const response = await ZohoApi(`${resource}?page=${page}&per_page=${PER_PAGE}`, headers)
        requests++
        if (response?.code !== 0) throw new Error(response?.message || `Failed to read ${resource} from Zoho`)
        rows.push(...(response[field] ?? []))
        if (!response.page_context?.has_more_pages) break
    }
    return { rows, requests }
}

export type ImportResult = { customers: number; purchases: number; payments: number; zoho_requests: number; imported_at: string }

export async function importVisitsFromZoho(headers: string): Promise<ImportResult> {
    const [customers, invoices, payments] = await Promise.all([
        ZohoGetCustomersCached(headers) as Promise<any[]>,
        listAll(headers, "invoices", "invoices"),
        listAll(headers, "customerpayments", "customerpayments"),
    ])

    const purchasesByCustomer = new Map<string, string[]>()
    for (const invoice of invoices.rows) {
        if (NOT_A_PURCHASE.has(invoice.status) || !invoice.customer_id || !invoice.date) continue
        const id = String(invoice.customer_id)
        purchasesByCustomer.set(id, [...(purchasesByCustomer.get(id) ?? []), invoice.date])
    }
    const paymentsByCustomer = new Map<string, string[]>()
    for (const payment of payments.rows) {
        if (!payment.customer_id || !payment.date) continue
        const id = String(payment.customer_id)
        paymentsByCustomer.set(id, [...(paymentsByCustomer.get(id) ?? []), payment.date])
    }

    const today = todayInBusinessTimezone()
    let purchaseCount = 0
    let paymentCount = 0
    for (const customer of customers) {
        const id = String(customer.contact_id)
        const purchases = purchasesByCustomer.get(id) ?? []
        const customerPayments = paymentsByCustomer.get(id) ?? []
        const createdAt = typeof customer.created_time === "string" ? customer.created_time.slice(0, 10) : undefined
        const isOld = !createdAt || daysBetween(createdAt, today) > NEW_CUSTOMER_MAX_AGE_DAYS
        await importCustomerHistory(id, {
            ...(createdAt && { created_at: createdAt }),
            purchases,
            payments: customerPayments,
            potential: purchases.length === 0 && isOld,
        })
        purchaseCount += purchases.length
        paymentCount += customerPayments.length
    }

    const imported_at = new Date().toISOString()
    await redisClient.set(IMPORTED_AT_KEY, imported_at)
    return {
        customers: customers.length,
        purchases: purchaseCount,
        payments: paymentCount,
        zoho_requests: invoices.requests + payments.requests,
        imported_at,
    }
}
