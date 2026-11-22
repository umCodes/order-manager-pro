import type { NextFunction, Request, Response } from "express";
import { mintZohoAccessToken } from "../services/zoho/auth.js";

// One access token is shared by every request and reused until it expires;
// these two live for the lifetime of the process.
let expiryDate = 0;
let access_token = '';

/**
 * Keeps a single Zoho access token fresh and attaches it as the
 * `Authorization` header on every /api request, so controllers can just read
 * it back off `req` (see requireAccessToken) instead of minting their own.
 */
export async function refreshZohoToken(req: Request, _: Response, next: NextFunction) {
    try {
        req.headers['Authorization'] = `Bearer ${access_token}`;
        if (expiryDate && expiryDate > Date.now()) return next();

        const token = await mintZohoAccessToken();
        access_token = token.access_token;
        expiryDate = Date.now() + token.expires_in * 1000;

        req.headers['Authorization'] = `Bearer ${access_token}`;

        return next();
    } catch (error) {
        console.error(error);
        return next(error)
    }
}
