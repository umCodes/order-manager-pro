import { ZohoApi, ZohoInventoryApi } from "./client.js"
import { getCache, setTTLCache } from "../../utils/cache.js"

type ZohoCatalogItem = {
    item_id?: string
    name?: string
    status?: string
    item_type?: string
    track_inventory?: boolean
    is_inventory_tracked?: boolean
    category_id?: string
    category_name?: string
}

/**
 * Only active, non-stock items can be ordered — inactive items and
 * inventory (stock-tracked) items never reach the app.
 */
function isOrderableItem(item: ZohoCatalogItem) {
    if (item.status && item.status !== "active") return false
    if (item.item_type === "inventory") return false
    if (item.track_inventory || item.is_inventory_tracked) return false
    return true
}

/** Inventory items keep their category under `category_name`; surface it as `category` (null when unset). */
function withCategory(item: ZohoCatalogItem) {
    return { ...item, category: item.category_name?.trim() || null }
}

/**
 * Fetches the item catalog from Zoho Inventory (so each item carries its
 * category): active, non-inventory items only. Falls back to the Zoho
 * Invoice catalog, without categories, if Inventory can't be reached
 * (e.g. the token lacks the Inventory scope) so ordering never breaks.
 */
export async function ZohoGetItems(headers: string){
    let items: ZohoCatalogItem[]
    try {
        const response = await ZohoInventoryApi("items", headers)
        items = response.items ?? []
    } catch (error) {
        console.error("Zoho Inventory items unavailable, falling back to Zoho Invoice items:", error)
        const response = await ZohoApi("items", headers)
        items = response.items ?? []
    }
    return items.filter(isOrderableItem).map(withCategory)
}

export type CatalogItem = ReturnType<typeof withCategory>

const CATALOG_CACHE_KEY = "items"
const CATALOG_CACHE_SECONDS = 60 * 60 * 12

/** The item catalog, cached in memory for 12 hours. */
export async function getCatalogItems(headers: string): Promise<CatalogItem[]> {
    const cached = getCache(CATALOG_CACHE_KEY)
    if (cached) return cached
    const items = await ZohoGetItems(headers)
    setTTLCache(CATALOG_CACHE_KEY, items, CATALOG_CACHE_SECONDS)
    return items
}

/** Every category used by the catalog, alphabetically. */
export function catalogCategories(items: CatalogItem[]): string[] {
    const names = new Set(items.map((item) => item.category).filter((name): name is string => !!name))
    return [...names].sort((a, b) => a.localeCompare(b))
}
