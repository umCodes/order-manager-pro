import type { Request, Response } from 'express';
import { ENV } from '../constants/env.js';

export async function handleWaWebhook(req: Request, res: Response){
    const mode = req.query["hub.mode"]
    const token = req.query["hub.verify_token"]
    const challenge = req.query["hub.challenge"]

    if (mode === "subscribe" && token === ENV.WA_VERIFY_TOKEN) 
        return res.status(200).send(challenge);

    return res.sendStatus(403)
};