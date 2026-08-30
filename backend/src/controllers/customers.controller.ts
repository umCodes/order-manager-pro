// conrollers/listCustomersController

import type { Request, Response } from 'express';
import { getCache, setTTLCache, deleteCache } from '../utils/cache.js';
import { ZohoGetCustomers, ZohoGetCustomerById, recordCustomerPayment, ZohoGetInvoices, ZohoCreateCustomer, ZohoUpdateCustomer } from '../services/zoho/index.js';
import type { CreateCustomerPayload, CustomerType, PreferredLanguage } from '../services/zoho/customers.js';
import { getContactPreferredLanguage } from '../services/zoho/customers.js';
import { sendPaymentNotification } from '../services/whatsapp/notifications.js';

const CUSTOMER_TYPES: CustomerType[] = ["business", "individual"];
const PREFERRED_LANGUAGES: PreferredLanguage[] = ["am", "ar", "en"];

function parseCustomerPayload(body: any): CreateCustomerPayload {
    const { contact_name, company_name, customer_sub_type, preferred_language, contact_persons } = body ?? {};

    if (!contact_name) throw new Error("Contact name is required")
    if (!company_name) throw new Error("Company name is required")
    if (!Array.isArray(contact_persons) || contact_persons.length === 0 || !contact_persons[0]?.phone) {
        throw new Error("Phone is required")
    }
    if (!CUSTOMER_TYPES.includes(customer_sub_type)) throw new Error("customer_sub_type must be 'business' or 'individual'")
    if (!PREFERRED_LANGUAGES.includes(preferred_language)) throw new Error("preferred_language must be 'am', 'ar', or 'en'")

    return { contact_name, company_name, customer_sub_type, preferred_language, contact_persons }
}

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


export async function createCustomer(req: Request, res: Response){
    const access_token = req.headers['Authorization']

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured creating the customer")

        const payload = parseCustomerPayload(req.body)
        const customer = await ZohoCreateCustomer(access_token, payload)

        deleteCache("customers")
        res.status(201).json({ customer })
        return
    } catch (error) {
        console.error('Error creating customer:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to create customer"
        })
        return
    }
};


export async function updateCustomer(req: Request, res: Response){
    const access_token = req.headers['Authorization']
    const { id } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured updating the customer")
        if (!id) throw new Error("Customer id is required")

        const payload = parseCustomerPayload(req.body)
        const customer = await ZohoUpdateCustomer(access_token, id as string, payload)

        deleteCache("customers")
        res.status(200).json({ customer })
        return
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to update customer"
        })
        return
    }
};


function getContactPhone(contact: any): string | undefined {
    return contact?.contact_persons?.[0]?.phone || contact?.contact_persons?.[0]?.mobile || contact?.mobile || contact?.phone
}

export async function payCustomerBalance(req: Request, res: Response){
    const access_token = req.headers['Authorization']
    const { id } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured recording payment")
        if (!id) throw new Error("Customer id is required")
        const { amount, payment_mode, notify } = req.body;

        if(!amount) throw new Error("Amount not provided")

        const payment = await recordCustomerPayment(access_token, id as string, amount, payment_mode)

        let notified = false
        if (notify) {
            try {
                const contact = await ZohoGetCustomerById(access_token, id as string)
                const phone = getContactPhone(contact)
                if (!phone) throw new Error(`No phone number on file for customer ${id}`)

                await sendPaymentNotification(
                    phone,
                    getContactPreferredLanguage(contact),
                    String(amount),
                    payment.date ?? new Date().toISOString().slice(0, 10),
                    String(contact.outstanding_receivable_amount),
                )
                notified = true
            } catch (notifyError) {
                console.error("Failed to send WhatsApp payment notification:", notifyError)
            }
        }

        res.status(201).json({payment, notified})
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


export default getCustomers