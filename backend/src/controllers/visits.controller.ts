import type { Request, Response } from 'express';
import { requireAccessToken } from '../utils/requireAccessToken.js';
import { businessDayKey } from '../utils/businessDate.js';
import { ZohoGetCustomerById, ZohoSetCustomerLocationLink, getContactAddress } from '../services/zoho/customers/index.js';
import { deleteCache } from '../utils/cache.js';
import {
    AT_LOCATION_METRES,
    cancelVisit,
    completeVisit,
    distanceMetres,
    listDoneVisits,
    listScheduledVisits,
    resolveLinkCoordinates,
    scheduleVisit,
    type VisitConfirmation,
} from '../services/visits.js';

/** Scheduled visits not done yet (earliest day first), the current business day, and the latest done ones. */
export async function getVisits(_req: Request, res: Response) {
    try {
        const [visits, done] = await Promise.all([listScheduledVisits(), listDoneVisits(20)]);
        res.status(200).json({ today: businessDayKey(), visits, done });
    } catch (error) {
        console.error('Error loading visits:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load visits' });
    }
}

/** Schedules or moves a customer's visit: `{ day: "YYYY-MM-DD", customer_name }` (the name is only for display). */
export async function putCustomerVisit(req: Request, res: Response) {
    try {
        const visit = await scheduleVisit(String(req.params.id ?? ""), String(req.body?.customer_name ?? ""), String(req.body?.day ?? ""));
        res.status(200).json({ visit });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to schedule the visit' });
    }
}

export async function deleteCustomerVisit(req: Request, res: Response) {
    try {
        await cancelVisit(String(req.params.id ?? ""));
        res.status(200).json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to cancel the visit' });
    }
}

const BY_ACTIVITY: Record<string, VisitConfirmation> = { payment: "payment", delivery: "delivery", return: "return" };

/**
 * Marks a customer's scheduled visit as done. Body `method`:
 * - "location" with `position: { lat, lng, accuracy? }`: compared with the
 *   customer's map location (one Zoho call to read it) — at the customer
 *   within AT_LOCATION_METRES (or the GPS accuracy, if worse), else away
 *   from it, or "no customer location" when the customer has none usable;
 * - "not_checked": the phone's location wasn't available;
 * - "payment" | "delivery" | "return": confirmed by that activity.
 * Also says whether the customer has an address the phone's position could
 * be saved into as their map location.
 */
export async function markCustomerVisited(req: Request, res: Response) {
    const id = String(req.params.id ?? "");
    try {
        const method = String(req.body?.method ?? "");
        let confirmation: VisitConfirmation;
        let distance_m: number | undefined;
        let position: { lat: number; lng: number; accuracy?: number } | undefined;
        let canSaveLocation = false;

        if (method === "location") {
            const lat = Number(req.body?.position?.lat);
            const lng = Number(req.body?.position?.lng);
            const accuracy = Number(req.body?.position?.accuracy);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
                throw new Error("position must have valid lat and lng");
            }
            position = { lat, lng, ...(Number.isFinite(accuracy) && accuracy > 0 ? { accuracy: Math.round(accuracy) } : {}) };

            const access_token = requireAccessToken(req, "A problem occured checking the customer's location");
            const address = getContactAddress(await ZohoGetCustomerById(access_token, id));
            canSaveLocation = !!(address?.city && address.district && address.street);
            const customerPoint = address?.location_link ? await resolveLinkCoordinates(address.location_link) : null;
            if (customerPoint) {
                distance_m = distanceMetres(position, customerPoint);
                const allowed = Math.max(AT_LOCATION_METRES, position.accuracy ?? 0);
                confirmation = distance_m <= allowed ? "at_location" : "away_from_location";
            } else {
                confirmation = "no_customer_location";
            }
        } else if (method === "not_checked") {
            confirmation = "location_not_checked";
        } else if (BY_ACTIVITY[method]) {
            confirmation = BY_ACTIVITY[method]!;
        } else {
            throw new Error("method must be location, not_checked, payment, delivery or return");
        }

        const visit = await completeVisit(id, {
            confirmation,
            ...(distance_m !== undefined ? { distance_m } : {}),
            ...(position ? { position } : {}),
        });
        if (!visit) throw new Error("This customer has no scheduled visit");
        res.status(200).json({ visit, can_save_location: canSaveLocation && confirmation === "no_customer_location" });
    } catch (error) {
        console.error('Error marking a visit as done:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to mark the visit as done' });
    }
}

/**
 * Saves a phone position (`{ lat, lng }`, from marking a visit done at a
 * customer with no usable map location) as the customer's map location.
 */
export async function saveCustomerLocation(req: Request, res: Response) {
    try {
        const access_token = requireAccessToken(req, "A problem occured saving the location");
        const lat = Number(req.body?.lat);
        const lng = Number(req.body?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            throw new Error("lat and lng are required");
        }
        const link = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
        const customer = await ZohoSetCustomerLocationLink(access_token, String(req.params.id ?? ""), link);
        deleteCache("customers");
        res.status(200).json({ customer, location_link: link });
    } catch (error) {
        console.error('Error saving a customer location:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save the location' });
    }
}
