import type { Request, Response } from 'express';
import { redisClient } from '../../config/redis.js';
import { ZohoGetCustomersCached, getContactAddress } from '../../services/zoho/customers/index.js';
import { requireAccessToken } from '../../utils/requireAccessToken.js';
import {
    IMPORTED_AT_KEY,
    getVisitRecords,
    recordManualVisit,
    visitStatus,
    type CustomerType,
} from '../../services/visits/customerVisits.js';
import { importVisitsFromZoho } from '../../services/visits/importFromZoho.js';
import { todayInBusinessTimezone } from '../../utils/businessDate.js';

const TYPES: CustomerType[] = ["new", "regular", "occasional", "rare", "potential"];

/**
 * Every active customer with their visit status, for the "To visit" list:
 * type (new / regular / occasional / rare / potential), days since the last
 * visit, and whether they're due. Due customers first, most overdue first.
 * Reads only the cached customer list and Redis — no extra Zoho calls.
 */
export async function getCustomerVisits(req: Request, res: Response) {
    try {
        const access_token = requireAccessToken(req, "A problem occured loading customer visits");
        const customers = ((await ZohoGetCustomersCached(access_token)) as any[]).filter((c) => c.status === "active");
        const records = await getVisitRecords(customers.map((c) => String(c.contact_id)));
        const today = todayInBusinessTimezone();

        const rows = customers.map((customer) => {
            const id = String(customer.contact_id);
            const record = records.get(id)!;
            const status = visitStatus(record, today);
            const address = getContactAddress(customer);
            return {
                customer_id: id,
                name: customer.contact_name || customer.company_name,
                phone: customer.mobile || customer.phone || undefined,
                balance: Number(customer.outstanding_receivable_amount) || 0,
                ...(address?.city && { city: address.city }),
                ...(address?.district && { district: address.district }),
                ...(address?.location_link && { location_link: address.location_link }),
                ...status,
                purchase_count: record.purchase_count,
                ...(record.purchases.length > 0 && { last_purchase: record.purchases[record.purchases.length - 1] }),
                ...(record.last_visit && { last_visit: record.last_visit, last_visit_kind: record.last_visit_kind }),
                ...(record.last_visit_note && { last_visit_note: record.last_visit_note }),
                ...(record.created_at && { created_at: record.created_at }),
            };
        });

        rows.sort((a, b) =>
            Number(b.due) - Number(a.due) ||
            b.overdue_days - a.overdue_days ||
            (b.days_since ?? Infinity) - (a.days_since ?? Infinity) ||
            String(a.name).localeCompare(String(b.name)),
        );

        const counts = Object.fromEntries(TYPES.map((type) => [type, rows.filter((r) => r.type === type).length]));
        res.status(200).json({
            imported_at: (await redisClient.get(IMPORTED_AT_KEY)) ?? null,
            today,
            due: rows.filter((r) => r.due).length,
            counts,
            customers: rows,
        });
    } catch (error) {
        console.error('Error loading customer visits:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load customer visits' });
    }
}

/** "Mark visited": a visit with no sale or payment, with an optional note. */
export async function markCustomerVisited(req: Request, res: Response) {
    try {
        const id = String(req.params.id ?? "");
        if (!id) throw new Error("Customer id is required");
        const note = typeof req.body?.note === "string" ? req.body.note : undefined;
        await recordManualVisit(id, note);
        res.status(201).json({ ok: true });
    } catch (error) {
        console.error('Error recording customer visit:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to record the visit' });
    }
}

/**
 * One-time import of past visits (sent invoices, payments) from Zoho.
 * Refuses to run twice unless `?force=1`, since it reads every invoice and payment.
 */
export async function importCustomerVisits(req: Request, res: Response) {
    try {
        const access_token = requireAccessToken(req, "A problem occured importing visit history");
        const already = await redisClient.get(IMPORTED_AT_KEY);
        if (already && req.query.force !== "1") {
            res.status(409).json({ error: `Visit history was already imported (${already}).` });
            return;
        }
        res.status(200).json(await importVisitsFromZoho(access_token));
    } catch (error) {
        console.error('Error importing visit history:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to import visit history' });
    }
}
