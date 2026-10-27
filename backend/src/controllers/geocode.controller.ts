import type { Request, Response } from 'express';
import { reverseGeocode } from '../services/reverseGeocode.js';

/** `?lat=&lng=` → `{ street, district, city, display }` in English (see reverseGeocode). */
export async function getReverseGeocode(req: Request, res: Response) {
    try {
        const result = await reverseGeocode(Number(req.query.lat), Number(req.query.lng));
        res.status(200).json(result);
    } catch (error) {
        console.error('Error looking up an address:', error);
        res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to look up the address' });
    }
}
