import { ZohoApi } from "./client.js"

export async function ZohoGetItems(headers: string){

    try{
        const response = await ZohoApi("items", headers)
        return response.items;
    }catch(error){
        throw error;
    }

}
