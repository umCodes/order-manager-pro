import { redisClient } from "../config/redis.js";
import { businessDayKey, secondsUntilNextBusinessDay } from "../utils/businessDate.js";

/**
 * Redis-backed "today" totals for the Drafts tab: the estimated amount for
 * the day, and how much of it has actually been collected so far. Both are
 * keyed by business day (5am-to-5am, see businessDate.ts) and expire on
 * their own at the next boundary — no cleanup job needed.
 *
 * The estimate used to be computed live from today's still-in-draft
 * invoices, which meant it *shrank* every time a draft got paid/sent and
 * dropped out of the draft list — exactly the "estimate for the day"
 * shouldn't do. Caching it as a high-water mark (never let it decrease
 * within the same business day) fixes that while still letting it grow if
 * more drafts get scheduled for today later.
 */

function estimateKey(day: string) {
    return `daily-estimate:${day}`;
}

function collectedKey(day: string) {
    return `daily-collected:${day}`;
}

/**
 * Reconciles today's cached draft-total estimate against a freshly computed
 * one, keeping whichever is higher, and returns the value to display.
 * Persists the update only when it actually changed.
 */
export async function reconcileDailyEstimate(freshTotal: number): Promise<number> {
    const day = businessDayKey();
    const key = estimateKey(day);

    const cachedRaw = await redisClient.get(key);
    const cached = cachedRaw ? parseFloat(cachedRaw) : 0;
    const total = Math.max(freshTotal, cached);

    if (total !== cached) {
        await redisClient.set(key, String(total), { EX: secondsUntilNextBusinessDay() });
    }

    return total;
}

/** Today's collected-so-far total (sum of payments recorded today), or 0 if none yet. */
export async function getCollectedToday(): Promise<number> {
    const raw = await redisClient.get(collectedKey(businessDayKey()));
    return raw ? parseFloat(raw) : 0;
}

/** Adds a just-recorded payment to today's running collected total. Never throws — this is best-effort bookkeeping, not the payment itself. */
export async function addToCollectedToday(amount: number): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
        const key = collectedKey(businessDayKey());
        await redisClient.incrByFloat(key, amount);
        await redisClient.expire(key, secondsUntilNextBusinessDay());
    } catch (error) {
        console.error("Failed to update today's collected total", error);
    }
}
