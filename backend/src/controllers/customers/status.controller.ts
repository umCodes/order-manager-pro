import type { Request, Response } from 'express';
import { deleteCache } from '../../utils/cache.js';
import { ZohoSetCustomerStatus } from '../../services/zoho/customers/index.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';

/** Marks a customer active or inactive. Body: `{ active: boolean }`. */
export async function setCustomerStatus(req: Request, res: Response){
    const { id } = req.params
    const { active } = req.body ?? {}

    try {
        const access_token = requireAccessToken(req, "A problem occured updating the customer's status")
        if (!id) throw new Error("Customer id is required")
        if (typeof active !== "boolean") throw new Error("active must be a boolean")

        const customer = await ZohoSetCustomerStatus(access_token, id as string, active)

        deleteCache("customers")
        res.status(200).json({ customer })
        return
    } catch (error) {
        console.error('Error updating customer status:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : "Failed to update customer status"
        })
        return
    }
};
