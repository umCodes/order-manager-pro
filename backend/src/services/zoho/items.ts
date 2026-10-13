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

/** Where the catalog came from: Zoho Inventory (with categories) or the Zoho Invoice fallback (without). */
export type CatalogSource = "inventory" | "invoice"

const INVENTORY_PAGE_SIZE = 200
const MAX_INVENTORY_PAGES = 25

/** Every item in Zoho Inventory, following `has_more_page` across pages. */
async function ZohoGetInventoryItems(headers: string): Promise<ZohoCatalogItem[]> {
    const items: ZohoCatalogItem[] = []
    for (let page = 1; page <= MAX_INVENTORY_PAGES; page++) {
        const response = await ZohoInventoryApi(`items?page=${page}&per_page=${INVENTORY_PAGE_SIZE}`, headers)
        items.push(...(response.items ?? []))
        if (!response.page_context?.has_more_page) break
    }
    return items
}

/**
 * Fetches the item catalog from Zoho Inventory (so each item carries its
 * category): active, non-inventory items only. Falls back to the Zoho
 * Invoice catalog, without categories, if Inventory can't be reached
 * (e.g. the token lacks the Inventory scope) so ordering never breaks.
 */
export async function ZohoGetItems(headers: string): Promise<{ items: CatalogItem[]; source: CatalogSource }> {
    let items: ZohoCatalogItem[]
    let source: CatalogSource = "inventory"
    try {
        items = await ZohoGetInventoryItems(headers)
    } catch (error) {
        console.error("Zoho Inventory items unavailable, falling back to Zoho Invoice items (no categories):", error)
        const response = await ZohoApi("items", headers)
        items = response.items ?? []
        source = "invoice"
    }
    return { items: items.filter(isOrderableItem).map(withCategory), source }
}

export type CatalogItem = ReturnType<typeof withCategory>

const CATALOG_CACHE_KEY = "items"
const CATALOG_SOURCE_CACHE_KEY = "items:source"
const CATALOG_CACHE_SECONDS = 60 * 60 * 12
/** The category-less fallback is only kept briefly, so Inventory is retried soon. */
const FALLBACK_CATALOG_CACHE_SECONDS = 60 * 5

/**
 * The item catalog, cached in memory for 12 hours (5 minutes when it's the
 * Invoice fallback). `refresh` skips the cache and refetches from Zoho.
 */
export async function getCatalog(headers: string, refresh = false): Promise<{ items: CatalogItem[]; source: CatalogSource }> {
    const cached = refresh ? undefined : getCache(CATALOG_CACHE_KEY)
    if (cached) return { items: cached, source: getCache(CATALOG_SOURCE_CACHE_KEY) ?? "inventory" }
    const catalog = await ZohoGetItems(headers)
    const seconds = catalog.source === "inventory" ? CATALOG_CACHE_SECONDS : FALLBACK_CATALOG_CACHE_SECONDS
    setTTLCache(CATALOG_CACHE_KEY, catalog.items, seconds)
    setTTLCache(CATALOG_SOURCE_CACHE_KEY, catalog.source, seconds)
    return catalog
}

/** The item catalog's items (see getCatalog). */
export async function getCatalogItems(headers: string): Promise<CatalogItem[]> {
    return (await getCatalog(headers)).items
}

/** Every category used by the catalog, alphabetically. */
export function catalogCategories(items: CatalogItem[]): string[] {
    const names = new Set(items.map((item) => item.category).filter((name): name is string => !!name))
    return [...names].sort((a, b) => a.localeCompare(b))
}
