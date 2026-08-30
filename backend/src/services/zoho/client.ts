import { ENV } from "../../constants/env.js"
import { redisClient } from "../../config/redis.js"

export type Methods = "GET" | "POST" | "PUT"

const ZOHO_REQUEST_COUNT_TTL_SECONDS = 60 * 60 * 48

export function getZohoRequestCountKey(date: Date = new Date()) {
    const day = date.toISOString().slice(0, 10)
    return `zoho:requests:${day}`
}

async function incrementZohoRequestCount() {
    try {
        const key = getZohoRequestCountKey()
        const count = await redisClient.incr(key)
        if (count === 1) await redisClient.expire(key, ZOHO_REQUEST_COUNT_TTL_SECONDS)
    } catch (error) {
        console.error("Failed to increment Zoho request count", error)
    }
}

export async function ZohoApi(endPoint: string, headers: string, method: Methods = "GET", body?: any) {
    try {
        const response = await fetch(`https://www.zohoapis.com/invoice/v3/${endPoint}`, {
                    method,
                    headers: {
                        "Authorization": headers,
                        "X-com-zoho-invoice-organizationid": String(ENV.ORGANIZATION_ID),
                        ...(method === "POST" || method === "PUT" ? {'Content-Type': 'application/json'} : {})
                    },
                    ...(body && { body: JSON.stringify(body) })
                })
        const data = await response.json()
        await incrementZohoRequestCount()
        return data
    } catch (error) {
        throw error
    }
}

/** For endpoints returning a binary body (e.g. `?accept=pdf`) instead of JSON. */
export async function ZohoApiRaw(endPoint: string, headers: string) {
    try {
        const response = await fetch(`https://www.zohoapis.com/invoice/v3/${endPoint}`, {
            method: "GET",
            headers: {
                "Authorization": headers,
                "X-com-zoho-invoice-organizationid": String(ENV.ORGANIZATION_ID),
            },
        })
        if (!response.ok) throw await response.json()
        const buffer = Buffer.from(await response.arrayBuffer())
        await incrementZohoRequestCount()
        return buffer
    } catch (error) {
        throw error
    }
}
