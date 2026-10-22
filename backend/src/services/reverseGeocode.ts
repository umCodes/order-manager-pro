import { redisClient } from "../config/redis.js"

/**
 * Coordinates → street, district and city in English, from OpenStreetMap's
 * Nominatim (free, no key). Its usage policy asks for an identifying
 * User-Agent and light use, so results are cached (by position rounded to
 * about a metre) for a month. Fields OpenStreetMap doesn't know are empty.
 */

export type ReverseGeocoded = { street: string; district: string; city: string; display: string }

const CACHE_PREFIX = "geocode:reverse:"
const CACHE_SECONDS = 30 * 24 * 60 * 60
const USER_AGENT = "order-manager-pro/1.0 (customer address lookup)"

const first = (...values: unknown[]) => String(values.find((v) => typeof v === "string" && v.trim()) ?? "").trim()

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocoded> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new Error("lat and lng must be valid coordinates")
    }
    const key = `${CACHE_PREFIX}${lat.toFixed(5)},${lng.toFixed(5)}`
    const cached = await redisClient.get(key).catch(() => null)
    if (cached) return JSON.parse(cached) as ReverseGeocoded

    const query = new URLSearchParams({
        format: "jsonv2",
        lat: String(lat),
        lon: String(lng),
        zoom: "18",
        addressdetails: "1",
        "accept-language": "en",
    })
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
        signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`The address lookup failed (${response.status})`)
    const data: any = await response.json()
    if (data?.error) throw new Error(String(data.error))
    const address = data?.address ?? {}

    const result: ReverseGeocoded = {
        street: first(address.road, address.pedestrian, address.street),
        district: first(address.suburb, address.neighbourhood, address.quarter, address.city_district, address.residential),
        city: first(address.city, address.town, address.village, address.municipality, address.county),
        display: String(data?.display_name ?? ""),
    }
    await redisClient.set(key, JSON.stringify(result), { EX: CACHE_SECONDS }).catch(() => {})
    return result
}
