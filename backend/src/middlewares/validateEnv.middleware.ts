import type { Request, Response, NextFunction } from 'express';
import { ENV } from '../constants/env.js';

/** Keys not required for the /api routes this middleware guards — used only by the WhatsApp webhook (mounted separately, outside /api), which handles their absence itself. */
const OPTIONAL_KEYS = new Set<keyof typeof ENV>([
    "WA_SUPPORT_NUMBER",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "WA_NOTIFY_EMAIL_TO",
]);

/** Rejects /api requests with a 500 when any required environment variable is missing. */
export function validateEnv(req: Request, res: Response, next: NextFunction): void {
    const missingKeys = Object.entries(ENV)
        .filter(([key, value]) => !value && !OPTIONAL_KEYS.has(key as keyof typeof ENV))
        .map(([key]) => key);

    if (missingKeys.length > 0) {
    console.error('Missing required environment variables:', missingKeys.join(', '));
        res.status(500).json({
        error: 'Server misconfiguration',
        missing: missingKeys,
    });
    return
    }

    next();
    return
}