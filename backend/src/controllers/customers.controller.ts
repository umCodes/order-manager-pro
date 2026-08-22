// conrollers/listCustomersController

import type { Request, Response } from 'express';
import { getCache, setTTLCache } from '../utils/cache.js';
import { ZohoGetCustomers, ZohoGetCustomerById, recordCustomerPayment, ZohoGetInvoices, ZohoGetDraftToMergeInto, ZohoGetInvoiceById } from '../services/zoho/index.js';

export async function getCustomers(req: Request, res: Response){
    const access_token = req.headers['Authorization']
    try {
        
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured getting customers")
        const customersCache = getCache("customers")
        if (customersCache){
            res.status(200).json({ customers: customersCache})
            return  
        }

        const customers = await ZohoGetCustomers(access_token)
        setTTLCache("customers", customers, 43200)
        res.status(200).json({customers})
        return 
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : "Internal Server Error"
        })
        return
    }


};




export async function getCustomerById(req: Request, res: Response){
    const access_token = req.headers['Authorization']
    const { id } = req.params
    try {

        if (!access_token || access_token instanceof Array) throw new Error("A problem occured getting customer")
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


export async function payCustomerBalance(req: Request, res: Response){
    const access_token = req.headers['Authorization']
    const { id } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured recording payment")
        if (!id) throw new Error("Customer id is required")
        const { amount, payment_mode } = req.body;

        if(!amount) throw new Error("Amount not provided")

        const payment = await recordCustomerPayment(access_token, id as string, amount, payment_mode)
        res.status(201).json({payment})
        return
    } catch (error) {
        if (error instanceof Error)
            res.status(400).json({ error: error.message });
        else
            res.status(500).json({ error: 'Failed to record payment' });
        console.error('Error recording customer payment:', error);
        return
    }
};


export async function getCustomerDraftInvoices(req: Request, res: Response){
    const access_token = req.headers['Authorization']
    const { id } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured getting customer draft invoices")
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


export async function getCustomerDraftToMergeInto(req: Request, res: Response){
    const access_token = req.headers['Authorization']
    const { id } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured getting the customer's draft invoice")
        if (!id) {
            res.status(400).json({ error: "Customer id is required" })
            return
        }
        const draftToMergeInto = await ZohoGetDraftToMergeInto(access_token, id as string)
        if (!draftToMergeInto) {
            res.status(200).json({ draft: null })
            return
        }
        const draft = await ZohoGetInvoiceById(access_token, String(draftToMergeInto.invoice_id))
        res.status(200).json({ draft })
        return
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : "Internal Server Error"
        })
        return
    }
};


export default getCustomers