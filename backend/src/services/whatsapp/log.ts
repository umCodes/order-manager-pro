import { redisClient } from "../../config/redis.js";

const LOG_KEY = "whatsapp:messages:log";
const LOG_MAX_ENTRIES = 500;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — delivery status can lag well behind the Telegram log's 72h window

export type WhatsAppMessageStatus = "sent" | "delivered" | "read" | "failed";

export type WhatsAppMessageLogEntry = {
    /** Meta's message id ("wamid...."), or a locally-generated one when the send itself was rejected before Meta returned an id. */
    message_id: string;
    to: string;
    template_name: string;
    language: string;
    status: WhatsAppMessageStatus;
    created_at: number;
    updated_at: number;
    error?: { code?: number; message?: string };
};

async function readLog(): Promise<WhatsAppMessageLogEntry[]> {
    const raw = await redisClient.lRange(LOG_KEY, 0, -1);
    return raw.map((entry) => JSON.parse(entry) as WhatsAppMessageLogEntry);
}

async function writeLog(entries: WhatsAppMessageLogEntry[]) {
    const multi = redisClient.multi();
    multi.del(LOG_KEY);
    if (entries.length > 0) multi.rPush(LOG_KEY, entries.map((entry) => JSON.stringify(entry)));
    await multi.exec();
}

/**
 * Records a WhatsApp template message right after it's sent — `status`
 * starts as "sent" (Meta accepted it) or "failed" (Meta rejected the API
 * call outright, e.g. an unapproved template). The real delivery outcome
 * (delivered/read/failed-after-acceptance) arrives later via Meta's status
 * webhook and is applied with updateWhatsAppMessageStatus.
 */
export async function recordWhatsAppMessage(entry: Omit<WhatsAppMessageLogEntry, "created_at" | "updated_at">) {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const existing = await readLog();
    const pruned = existing.filter((e) => e.created_at >= cutoff);
    const next = [{ ...entry, created_at: now, updated_at: now }, ...pruned].slice(0, LOG_MAX_ENTRIES);
    await writeLog(next);
}

/** Messages sent through the app in the last 7 days, newest first. */
export async function listRecentWhatsAppMessages(): Promise<WhatsAppMessageLogEntry[]> {
    const cutoff = Date.now() - WINDOW_MS;
    const existing = await readLog();
    const pruned = existing.filter((e) => e.created_at >= cutoff);
    if (pruned.length !== existing.length) await writeLog(pruned);
    return pruned;
}

/**
 * Applies a delivery-status update from Meta's webhook to the matching
 * logged message. A no-op if the message id isn't in the log (e.g. it aged
 * out, or was sent before this logging existed).
 */
export async function updateWhatsAppMessageStatus(
    messageId: string,
    status: WhatsAppMessageStatus,
    error?: { code?: number; message?: string },
) {
    const existing = await readLog();
    const next = existing.map((e) =>
        e.message_id === messageId ? { ...e, status, updated_at: Date.now(), ...(error && { error }) } : e,
    );
    await writeLog(next);
}
