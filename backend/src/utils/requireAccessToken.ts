import type { Request } from "express";

/**
 * Reads the Zoho access token that the refreshZohoToken middleware attaches
 * to every /api request. Throws `message` if it somehow isn't there, so the
 * controller's own catch block turns it into that route's error response.
 */
export function requireAccessToken(req: Request, message: string): string {
    const accessToken = req.headers["Authorization"];
    if (!accessToken || accessToken instanceof Array) throw new Error(message);
    return accessToken;
}
