import { redisClient } from "../../config/redis.js";

/**
 * Every message sent to the channel through this app, newest first. Kept
 * permanently: entries only leave when the message is deleted from the channel.
 */
const LOG_KEY = "telegram:messages:log";

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
    await redisClient.lPush(LOG_KEY, JSON.stringify({ ...entry, created_at: Date.now() }));
}

/** Every message sent through the app, newest first. */
export async function listTelegramMessages(): Promise<TelegramMessageLogEntry[]> {
    return readLog();
}

/** Records that a logged message was edited, so the tab shows the new text. */
export async function updateTelegramMessageLogText(messageId: number, text: string) {
    const existing = await readLog();
    const next = existing.map((e) => (e.message_id === messageId ? { ...e, text, edited: true } : e));
    await writeLog(next);
}

/** Forgets a message that's been deleted from the channel. */
export async function removeTelegramMessageFromLog(messageId: number) {
    const existing = await readLog();
    const next = existing.filter((e) => e.message_id !== messageId);
    await writeLog(next);
}
