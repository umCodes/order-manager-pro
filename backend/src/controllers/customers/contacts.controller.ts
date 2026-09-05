import type { Request, Response } from 'express';
import { deleteCache } from '../../utils/cache.js';
import {
    ZohoAddContactPerson,
    ZohoDeleteContactPerson,
    ZohoGetCustomerById,
    ZohoMarkContactPersonPrimary,
    ZohoUpdateContactPerson,
} from '../../services/zoho/customers/index.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';
import { parseContactPersonPayload } from './payloads.js';

/**
 * The contact people on a customer. Every handler here re-fetches the whole
 * customer afterwards and returns it, so the frontend always renders from
 * Zoho's own view of the contact list rather than a locally-patched one.
 */

/** Adds a contact person to a customer. */
export async function addCustomerContact(req: Request, res: Response) {
    const { id } = req.params

    try {
        const access_token = requireAccessToken(req, "A problem occured adding the contact")
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

/** Renames a contact person or changes their phone number. */
export async function updateCustomerContact(req: Request, res: Response) {
    const { id, contactId } = req.params

    try {
        const access_token = requireAccessToken(req, "A problem occured updating the contact")
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

/** Removes a contact person from a customer. */
export async function deleteCustomerContact(req: Request, res: Response) {
    const { id, contactId } = req.params

    try {
        const access_token = requireAccessToken(req, "A problem occured deleting the contact")
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

/** Promotes a contact person to primary — the one notifications default to. */
export async function markCustomerContactPrimary(req: Request, res: Response) {
    const { id, contactId } = req.params

    try {
        const access_token = requireAccessToken(req, "A problem occured updating the primary contact")
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
