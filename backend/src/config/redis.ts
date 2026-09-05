import { createClient } from "redis";
import { ENV } from "../constants/env.js";

export const redisClient = createClient({
    url: ENV.REDIS_URL as string,
});

redisClient.on("error", (error: any) => console.error("Redis Client Error", error));

/** Opens the Redis connection if it isn't already open. Safe to call more than once. */
export async function connectRedis() {
    if (!redisClient.isOpen) await redisClient.connect();
    return redisClient;
}
