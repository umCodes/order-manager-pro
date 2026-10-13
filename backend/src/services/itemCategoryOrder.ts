import { redisClient } from "../config/redis.js"

/**
 * The order item categories are listed in on the Items tab, set on the
 * Settings page and kept in Redis. Categories not in the list come after
 * the listed ones, alphabetically.
 */
const SETTINGS_KEY = "settings:item-category-order"

export async function getItemCategoryOrder(): Promise<string[]> {
    const raw = await redisClient.get(SETTINGS_KEY)
    const saved = raw ? JSON.parse(raw) : []
    return Array.isArray(saved) ? saved.filter((name): name is string => typeof name === "string") : []
}

/** Saves the category order: a list of category names, highest priority first. */
export async function saveItemCategoryOrder(input: unknown): Promise<string[]> {
    if (!Array.isArray(input) || input.some((name) => typeof name !== "string")) {
        throw new Error("Category order must be a list of category names")
    }
    const order = [...new Set(input.map((name: string) => name.trim()).filter(Boolean))]
    await redisClient.set(SETTINGS_KEY, JSON.stringify(order))
    return order
}
