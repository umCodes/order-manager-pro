import { ZohoApi } from "./client.js"

type ZohoCatalogItem = {
    status?: string
    item_type?: string
    track_inventory?: boolean
    is_inventory_tracked?: boolean
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

/** Fetches the item catalog: active, non-inventory items only. */
export async function ZohoGetItems(headers: string){

    try{
        const response = await ZohoApi("items", headers)
        return (response.items ?? []).filter(isOrderableItem);
    }catch(error){
        throw error;
    }

}
