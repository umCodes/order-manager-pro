import type { Request, Response } from 'express';
import { deleteCache } from '../../utils/cache.js';
import { ZohoCreateCustomer, ZohoUpdateCustomer } from '../../services/zoho/customers/index.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';
import { parseCreateCustomerPayload, parseUpdateCustomerPayload } from './payloads.js';

/** Creates a customer. The phone captured on the form becomes their primary contact person. */
export async function createCustomer(req: Request, res: Response){
    try {
        const access_token = requireAccessToken(req, "A problem occured creating the customer")

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

/** Updates a customer's own fields. Their contact persons are managed separately — see contacts.controller. */
export async function updateCustomer(req: Request, res: Response){
    const { id } = req.params

    try {
        const access_token = requireAccessToken(req, "A problem occured updating the customer")
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
