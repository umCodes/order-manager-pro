import type { NextFunction, Request, Response } from "express";
import { zohoAuthHeader } from "../services/zoho/auth.js";

/**
 * Keeps a single Zoho access token fresh (see zohoAuthHeader, shared with
 * background jobs) and attaches it as the `Authorization` header on every
 * /api request, so controllers can just read it back off `req` (see
 * requireAccessToken) instead of minting their own.
 */
export async function refreshZohoToken(req: Request, _: Response, next: NextFunction) {
    try {
        req.headers['Authorization'] = await zohoAuthHeader();
        return next();
    } catch (error) {
        console.error(error);
        return next(error)
    }
}
