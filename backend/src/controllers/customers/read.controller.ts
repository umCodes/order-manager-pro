import type { Request, Response } from 'express';
import { getCache, setTTLCache } from '../../utils/cache.js';
import { ZohoGetCustomers, ZohoGetCustomerById } from '../../services/zoho/customers/index.js';
import { ZohoGetInvoices } from '../../services/zoho/invoices/index.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';

/** Customer list cache lifetime: 12h, invalidated eagerly on every write (see the write/contacts controllers). */
const CUSTOMERS_CACHE_TTL_SECONDS = 43200;

/** Lists all customers, served from the in-memory cache when it's warm. */
export async function getCustomers(req: Request, res: Response){
    try {
        const access_token = requireAccessToken(req, "A problem occured getting customers")

        const customersCache = getCache("customers")
        if (customersCache){
            res.status(200).json({ customers: customersCache})
            return
        }

        const customers = await ZohoGetCustomers(access_token)
        setTTLCache("customers", customers, CUSTOMERS_CACHE_TTL_SECONDS)
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
