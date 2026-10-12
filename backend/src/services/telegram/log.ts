import { redisClient } from "../../config/redis.js";

/**
 * Every message sent to the channel through this app, newest first. Entries
 * leave when the message is deleted, or once they're older than a week.
 */
const LOG_KEY = "telegram:messages:log";

/** How long a message stays in the log. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type TelegramMessageLogEntry = {
    message_id: number;
    chat_id: string;
    text: string;
    created_at: number;
    edited?: boolean;
};

/**
 * Drops entries older than the retention window. The list is newest first,
 * so expired entries collect at the tail and pop off from there — safe
 * alongside a concurrent send, which only ever pushes onto the head.
 */
async function pruneExpired() {
    const cutoff = Date.now() - RETENTION_MS;
    while (true) {
        const oldest = await redisClient.lIndex(LOG_KEY, -1);
        if (!oldest) return;
        if ((JSON.parse(oldest) as TelegramMessageLogEntry).created_at >= cutoff) return;
        await redisClient.rPop(LOG_KEY);
    }
}

async function readLog(): Promise<TelegramMessageLogEntry[]> {
    await pruneExpired();
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
    await redisClient.lPush(LOG_KEY, JSON.stringify({ ...entry, created_at: Date.now() }));
}

/** Every message sent through the app in the last week, newest first. */
export async function listTelegramMessages(): Promise<TelegramMessageLogEntry[]> {
    return readLog();
}

/** Records that a logged message was edited, so the tab shows the new text. */
export async function updateTelegramMessageLogText(messageId: number, text: string) {
    const existing = await readLog();
    const next = existing.map((e) => (e.message_id === messageId ? { ...e, text, edited: true } : e));
    await writeLog(next);
}

/** Forgets a message — deleted from the channel, or no longer wanted in the history. */
export async function removeTelegramMessageFromLog(messageId: number) {
    const existing = await readLog();
    const next = existing.filter((e) => e.message_id !== messageId);
    await writeLog(next);
}
