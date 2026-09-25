import Redis from "ioredis";

let client;

export function getRedisClient() {
    if (!client) client = new Redis(process.env.REDIS_URL);
    return client;
}
