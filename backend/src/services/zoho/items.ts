import { ZohoApi } from "./client.js"

/** Fetches the item catalog. */
export async function ZohoGetItems(headers: string){

    try{
        const response = await ZohoApi("items", headers)
        return response.items;
    }catch(error){
        throw error;
    }

}
