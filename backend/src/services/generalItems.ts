import { redisClient } from "../config/redis.js"

/**
 * "General items": up to MAX_GENERAL_ITEMS catalog items for things sold
 * now and then outside the usual range, whose unit (normally pieces) can be
 * changed per line when they're added to an invoice. Chosen in Settings.
 */

export const MAX_GENERAL_ITEMS = 3
const SETTINGS_KEY = "settings:general-items"

export async function getGeneralItemIds(): Promise<string[]> {
    const raw = await redisClient.get(SETTINGS_KEY).catch(() => null)
    try {
        const saved = raw ? JSON.parse(raw) : []
        return Array.isArray(saved) ? saved.map(String).slice(0, MAX_GENERAL_ITEMS) : []
    } catch {
        return []
    }
}

/** Saves the chosen item ids: no blanks or repeats, at most MAX_GENERAL_ITEMS. */
export async function saveGeneralItemIds(input: unknown): Promise<string[]> {
    if (!Array.isArray(input)) throw new Error("item_ids must be a list")
    const ids = [...new Set(input.map((id) => String(id ?? "").trim()).filter(Boolean))]
    if (ids.length > MAX_GENERAL_ITEMS) throw new Error(`Up to ${MAX_GENERAL_ITEMS} general items can be chosen`)
    await redisClient.set(SETTINGS_KEY, JSON.stringify(ids))
    return ids
}
