import { getZohoAccessToken } from "./auth.mjs";

/** Calls the Zoho Invoice API and returns the parsed JSON body. */
export async function ZohoApi(endPoint, method = "GET", body) {
    const accessToken = await getZohoAccessToken();
    const response = await fetch(`https://www.zohoapis.com/invoice/v3/${endPoint}`, {
        method,
        headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            "X-com-zoho-invoice-organizationid": String(process.env.ORGANIZATION_ID),
            ...(method === "POST" || method === "PUT" ? { "Content-Type": "application/json" } : {}),
        },
        ...(body && { body: JSON.stringify(body) }),
    });
    return await response.json();
}
