import type { Request, Response, NextFunction } from 'express';
import { ENV } from '../constants/env.js';

export function validateEnv(req: Request, res: Response, next: NextFunction): void {
    const missingKeys = Object.entries(ENV)
        .filter(([_, value]) => !value)
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