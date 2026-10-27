import { redisClient } from "../config/redis.js"

/**
 * "General items": up to MAX_GENERAL_ITEMS catalog items for things sold
 * now and then outside the usual range, whose unit (normally pieces) can be
 * changed per line when they're added to an invoice. Chosen in Settings.
 */

export const MAX_GENERAL_ITEMS = 3
const SETTINGS_KEY = "settings:general-items"

/** Used until general items are saved in Settings: Zoho's "General-Item" and "General Stuff". */
export const DEFAULT_GENERAL_ITEM_IDS = ["4645478000000084021", "4645478000004531006"]

/** The chosen general items; the defaults until the setting has been saved (an empty save stays empty). */
export async function getGeneralItemIds(): Promise<string[]> {
    const raw = await redisClient.get(SETTINGS_KEY).catch(() => null)
    if (raw === null) return [...DEFAULT_GENERAL_ITEM_IDS]
    try {
        const saved = JSON.parse(raw)
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
