import { getRedisClient } from "../services/redis/client.mjs";

const TTL_SECONDS = 24 * 60 * 60;

function notifiedKey(phoneNumber, language) {
    return `wa:notified:${phoneNumber}:${language}`;
}

/** Marks `phoneNumber` as notified for `language`, returning true only the first time within the TTL window. */
export async function markNotifiedIfFirstTime(phoneNumber, language) {
    const result = await getRedisClient().set(notifiedKey(phoneNumber, language), "1", "EX", TTL_SECONDS, "NX");
    return result === "OK";
}
