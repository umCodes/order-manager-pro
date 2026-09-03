// conrollers/listCustomersController

import type { Request, Response } from 'express';
import { getCache, setTTLCache, deleteCache } from '../utils/cache.js';
import {
    ZohoGetCustomers,
    ZohoGetCustomerById,
    recordCustomerPayment,
    ZohoGetInvoices,
    ZohoCreateCustomer,
    ZohoUpdateCustomer,
    ZohoAddContactPerson,
    ZohoUpdateContactPerson,
    ZohoDeleteContactPerson,
    ZohoMarkContactPersonPrimary,
} from '../services/zoho/index.js';
import type { CreateCustomerPayload, CustomerType, PreferredLanguage, ContactPersonPayload } from '../services/zoho/customers.js';
import { getContactPreferredLanguage, getContactPhone, getContactPhoneById } from '../services/zoho/customers.js';
import { sendPaymentNotification } from '../services/whatsapp/notifications.js';
import { todayInBusinessTimezone } from '../utils/businessDate.js';

const CUSTOMER_TYPES: CustomerType[] = ["business", "individual"];
const PREFERRED_LANGUAGES: PreferredLanguage[] = ["am", "ar", "en"];

/** Validates the payload for creating a new customer, including its initial (primary) contact person. */
function parseCreateCustomerPayload(body: any): CreateCustomerPayload {
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

/** Validates the payload for updating a customer's top-level fields (name/company/type/language only). */
function parseUpdateCustomerPayload(body: any): CreateCustomerPayload {
    const { contact_name, company_name, customer_sub_type, preferred_language } = body ?? {};

    if (!contact_name) throw new Error("Contact name is required")
    if (!company_name) throw new Error("Company name is required")
    if (!CUSTOMER_TYPES.includes(customer_sub_type)) throw new Error("customer_sub_type must be 'business' or 'individual'")
    if (!PREFERRED_LANGUAGES.includes(preferred_language)) throw new Error("preferred_language must be 'am', 'ar', or 'en'")

    return { contact_name, company_name, customer_sub_type, preferred_language, contact_persons: [] }
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

        const payload = parseCreateCustomerPayload(req.body)
        // The phone provided at creation is the customer's sole contact, so it is the primary/default contact.
        payload.contact_persons = payload.contact_persons.map((cp, i) => (i === 0 ? { ...cp, is_primary_contact: true } : cp))
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

        const payload = parseUpdateCustomerPayload(req.body)
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


export async function payCustomerBalance(req: Request, res: Response){
    const access_token = req.headers['Authorization']
    const { id } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured recording payment")
        if (!id) throw new Error("Customer id is required")
        const { amount, payment_mode, notify, notify_contact_id } = req.body;

        if(!amount) throw new Error("Amount not provided")

        const payment = await recordCustomerPayment(access_token, id as string, amount, payment_mode)

        let notified = false
        if (notify) {
            try {
                const contact = await ZohoGetCustomerById(access_token, id as string)
                // A chosen contact must resolve to a phone on this customer's own
                // contact list — never trust a raw phone number from the client.
                const phone = notify_contact_id ? getContactPhoneById(contact, notify_contact_id) : getContactPhone(contact)
                if (!phone) throw new Error(`No phone number on file for customer ${id}`)

                await sendPaymentNotification(
                    phone,
                    getContactPreferredLanguage(contact),
                    String(amount),
                    payment.date ?? todayInBusinessTimezone(),
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


function parseContactPersonPayload(body: any): ContactPersonPayload & { first_name: string; phone: string } {
    const { first_name, phone, is_primary_contact } = body ?? {};
    if (!first_name || !String(first_name).trim()) throw new Error("Contact name is required")
    if (!phone || !String(phone).trim()) throw new Error("Phone is required")
    return { first_name: String(first_name).trim(), phone: String(phone).trim(), ...(is_primary_contact ? { is_primary_contact: true } : {}) }
}

export async function addCustomerContact(req: Request, res: Response) {
    const access_token = req.headers['Authorization']
    const { id } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured adding the contact")
        if (!id) throw new Error("Customer id is required")

        const payload = parseContactPersonPayload(req.body)
        await ZohoAddContactPerson(access_token, id as string, payload)
        const customer = await ZohoGetCustomerById(access_token, id as string)

        deleteCache("customers")
        res.status(201).json({ customer })
        return
    } catch (error) {
        console.error('Error adding customer contact:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to add contact"
        })
        return
    }
}

export async function updateCustomerContact(req: Request, res: Response) {
    const access_token = req.headers['Authorization']
    const { id, contactId } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured updating the contact")
        if (!id) throw new Error("Customer id is required")
        if (!contactId) throw new Error("Contact id is required")

        const { first_name, phone } = parseContactPersonPayload(req.body)

        // Clear any legacy `mobile` value so editing `phone` doesn't leave a
        // stale duplicate number sitting in the other field.
        await ZohoUpdateContactPerson(access_token, id as string, contactId as string, {
            first_name,
            phone,
            mobile: "",
        })
        const customer = await ZohoGetCustomerById(access_token, id as string)

        deleteCache("customers")
        res.status(200).json({ customer })
        return
    } catch (error) {
        console.error('Error updating customer contact:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to update contact"
        })
        return
    }
}

export async function deleteCustomerContact(req: Request, res: Response) {
    const access_token = req.headers['Authorization']
    const { id, contactId } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured deleting the contact")
        if (!id) throw new Error("Customer id is required")
        if (!contactId) throw new Error("Contact id is required")

        await ZohoDeleteContactPerson(access_token, id as string, contactId as string)
        const customer = await ZohoGetCustomerById(access_token, id as string)

        deleteCache("customers")
        res.status(200).json({ customer })
        return
    } catch (error) {
        console.error('Error deleting customer contact:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to delete contact"
        })
        return
    }
}

export async function markCustomerContactPrimary(req: Request, res: Response) {
    const access_token = req.headers['Authorization']
    const { id, contactId } = req.params

    try {
        if (!access_token || access_token instanceof Array) throw new Error("A problem occured updating the primary contact")
        if (!id) throw new Error("Customer id is required")
        if (!contactId) throw new Error("Contact id is required")
        // The frontend's synthetic legacy-contact sentinel isn't a real Zoho
        // contact-person id — it's already the customer's implicit primary
        // (the only contact on file), so there's nothing to do.
        if (contactId === "legacy") throw new Error("This contact is already primary")

        await ZohoMarkContactPersonPrimary(access_token, id as string, contactId as string)
        const customer = await ZohoGetCustomerById(access_token, id as string)

        deleteCache("customers")
        res.status(200).json({ customer })
        return
    } catch (error) {
        console.error('Error marking customer contact as primary:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to set primary contact"
        })
        return
    }
}

export default getCustomers