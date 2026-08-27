import type { Request, Response } from 'express';

export async function handleWaWebhook(req: Request, res: Response){
    res.status(200).end();
    return
};