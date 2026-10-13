import { getItemCategoryOrder } from "./itemCategoryOrder.js"
import { getCatalogItems } from "./zoho/items.js"

type SortableLineItem = { item_id?: string | number; name?: string; description?: string }

/**
 * Orders line items the way the Settings category priority says: categories
 * in the saved order first, other categories alphabetically, uncategorized
 * last; within a category, alphabetically by item name. Categories and names
 * come from the item catalog (by item id), falling back to the line's own
 * name/description. Never throws — if the catalog or the saved order can't
 * be loaded, the items come back in their original order.
 */
export async function sortLineItemsByCategory<T extends SortableLineItem>(accessToken: string, items: T[]): Promise<T[]> {
    try {
        const [catalog, order] = await Promise.all([getCatalogItems(accessToken), getItemCategoryOrder()])
        const catalogById = new Map(catalog.map((item) => [String(item.item_id), item]))
        const rank = new Map(order.map((name, index) => [name, index]))

        const keyed = items.map((item) => {
            const catalogItem = item.item_id != null ? catalogById.get(String(item.item_id)) : undefined
            return {
                item,
                category: catalogItem?.category ?? null,
                name: String(catalogItem?.name ?? item.name ?? item.description ?? ""),
            }
        })

        keyed.sort((a, b) => {
            if (a.category !== b.category) {
                if (a.category === null) return 1
                if (b.category === null) return -1
                const rankA = rank.get(a.category) ?? Infinity
                const rankB = rank.get(b.category) ?? Infinity
                if (rankA !== rankB) return rankA - rankB
                return a.category.localeCompare(b.category)
            }
            return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        })

        return keyed.map(({ item }) => item)
    } catch (error) {
        console.error("Failed to sort line items by category; keeping their original order:", error)
        return items
    }
}
