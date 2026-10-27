import type { Request, Response } from 'express';
import { ZohoGetCustomersCached, ZohoGetCustomerById } from '../../services/zoho/customers/index.js';
import { ZohoGetInvoices } from '../../services/zoho/invoices/index.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';
import { getCustomerTransactions as loadCustomerTransactions, TRANSACTION_TYPES, validatePeriod, type TransactionType } from '../../services/customerTransactions.js';

/** Lists all customers, served from the in-memory cache when it's warm. */
export async function getCustomers(req: Request, res: Response){
    try {
        const access_token = requireAccessToken(req, "A problem occured getting customers")

        const customers = await ZohoGetCustomersCached(access_token)
        res.status(200).json({customers})
        return
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : "Internal Server Error"
        })
        return
    }
};

/** Fetches one customer, including its contact persons. Never cached — writes read this back immediately. */
export async function getCustomerById(req: Request, res: Response){
    const { id } = req.params
    try {
        const access_token = requireAccessToken(req, "A problem occured getting customer")

        if (!id) {
            res.status(400).json({ error: "Customer id is required" })
            return
        }
        const customer = await ZohoGetCustomerById(access_token, id as string)
        res.status(200).json({customer})
        return
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : "Internal Server Error"
        })
        return
    }
};

/** Lists just this customer's draft invoices — used to warn about (or load) an existing draft. */
export async function getCustomerDraftInvoices(req: Request, res: Response){
    const { id } = req.params

    try {
        const access_token = requireAccessToken(req, "A problem occured getting customer draft invoices")

        if (!id) {
            res.status(400).json({ error: "Customer id is required" })
            return
        }
        const drafts = await ZohoGetInvoices(access_token, { status: "draft", customer_id: id as string})
        res.status(200).json({drafts})
        return
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : "Internal Server Error"
        })
        return
    }
};

/**
 * The customer's invoices, payments or returns (`?type=`) dated `from`–`to`
 * (YYYY-MM-DD, inclusive), with the period's totals — any period, unlike
 * the 30-day Previous Transactions list.
 */
export async function getCustomerTransactions(req: Request, res: Response){
    const id = req.params.id as string
    try {
        const access_token = requireAccessToken(req, "A problem occured getting the customer's transactions")
        const type = String(req.query.type ?? "") as TransactionType
        if (!TRANSACTION_TYPES.includes(type)) {
            res.status(400).json({ error: `type must be one of ${TRANSACTION_TYPES.join(", ")}` })
            return
        }
        let period: { from: string; to: string }
        try {
            period = validatePeriod(req.query.from, req.query.to)
        } catch (error) {
            res.status(400).json({ error: error instanceof Error ? error.message : "Invalid period" })
            return
        }

        // Payments are looked up by the customer's name (see ZohoGetCustomerPayments).
        const name = type === "payments" ? (await ZohoGetCustomerById(access_token, id)).contact_name : ""
        const transactions = await loadCustomerTransactions(access_token, id, name, type, period.from, period.to)
        res.status(200).json(transactions)
    } catch (error) {
        console.error("Error getting customer transactions:", error)
        res.status(500).json({
            error: error instanceof Error ? error.message : "Internal Server Error"
        })
    }
}
