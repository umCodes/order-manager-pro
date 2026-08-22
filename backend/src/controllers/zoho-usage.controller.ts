import type { Request, Response } from 'express';
import { redisClient } from '../config/redis.js';
import { getZohoRequestCountKey } from '../services/zoho/client.js';

export async function getZohoRequestCount(req: Request, res: Response) {
  try {
    const key = getZohoRequestCountKey();
    const count = await redisClient.get(key);
    res.status(200).json({ date: key.split(':')[2], count: Number(count ?? 0) });
    return;
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal Server Error"
    });
    return;
  }
}