import { redisClient } from "../../config/redis.js";

const LOG_KEY = "telegram:messages:log";
const LOG_MAX_ENTRIES = 500;
const WINDOW_MS = 72 * 60 * 60 * 1000;

export type TelegramMessageLogEntry = {
    message_id: number;
    chat_id: string;
    text: string;
    created_at: number;
    edited?: boolean;
};

async function readLog(): Promise<TelegramMessageLogEntry[]> {
    const raw = await redisClient.lRange(LOG_KEY, 0, -1);
    return raw.map((entry) => JSON.parse(entry) as TelegramMessageLogEntry);
}

async function writeLog(entries: TelegramMessageLogEntry[]) {
    const multi = redisClient.multi();
    multi.del(LOG_KEY);
    if (entries.length > 0) multi.rPush(LOG_KEY, entries.map((entry) => JSON.stringify(entry)));
    await multi.exec();
}

/**
 * Records a message the app just sent to Telegram. There's no Bot API to
 * retrieve a channel's full history, so this log can only ever reflect
 * messages sent (or edited/deleted) through this app — not messages posted
 * to the channel by anyone else.
 */
export async function recordTelegramMessage(entry: Omit<TelegramMessageLogEntry, "created_at">) {
    const created_at = Date.now();
    const cutoff = created_at - WINDOW_MS;
    const existing = await readLog();
    const pruned = existing.filter((e) => e.created_at >= cutoff);
    const next = [{ ...entry, created_at }, ...pruned].slice(0, LOG_MAX_ENTRIES);
    await writeLog(next);
}

/** Messages sent through the app in the last 72 hours, newest first. */
export async function listRecentTelegramMessages(): Promise<TelegramMessageLogEntry[]> {
    const cutoff = Date.now() - WINDOW_MS;
    const existing = await readLog();
    const pruned = existing.filter((e) => e.created_at >= cutoff);
    if (pruned.length !== existing.length) await writeLog(pruned);
    return pruned;
}

export async function updateTelegramMessageLogText(messageId: number, text: string) {
    const existing = await readLog();
    const next = existing.map((e) => (e.message_id === messageId ? { ...e, text, edited: true } : e));
    await writeLog(next);
}

export async function removeTelegramMessageFromLog(messageId: number) {
    const existing = await readLog();
    const next = existing.filter((e) => e.message_id !== messageId);
    await writeLog(next);
}
