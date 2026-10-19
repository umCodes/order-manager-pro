import { redisClient } from "../config/redis.js"
import { businessDayKey } from "../utils/businessDate.js"

/**
 * Customer visits: a visit is scheduled for a business day (4am to 4am, see
 * businessDate.ts), the customer stays pinned until it's marked done, and
 * marking it done records how it was confirmed — by the phone's location
 * compared with the customer's map location, or by a payment, delivery or
 * return made for that customer.
 *
 * Kept in Redis so every phone sees the same list:
 *   visits:scheduled  — hash, customer id → ScheduledVisit (one per customer)
 *   visits:log        — list of DoneVisit, newest first, the last LOG_LIMIT
 */

export type ScheduledVisit = { customer_id: string; customer_name: string; day: string; scheduled_at: string }

export type VisitConfirmation =
    | "at_location"
    | "away_from_location"
    | "no_customer_location"
    | "location_not_checked"
    | "payment"
    | "delivery"
    | "return"

export type DoneVisit = ScheduledVisit & {
    visited_at: string
    confirmation: VisitConfirmation
    /** Metres between the phone and the customer's map location, when both were known. */
    distance_m?: number
    /** Where the phone was, when it shared its location. */
    position?: { lat: number; lng: number; accuracy?: number }
}

const SCHEDULED_KEY = "visits:scheduled"
const LOG_KEY = "visits:log"
const LOG_LIMIT = 500
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Within this many metres of the customer's map location (or the phone's GPS accuracy, if worse) counts as at the customer. */
export const AT_LOCATION_METRES = 200

export async function listScheduledVisits(): Promise<ScheduledVisit[]> {
    const values = Object.values(await redisClient.hGetAll(SCHEDULED_KEY))
    return values.map((raw) => JSON.parse(raw) as ScheduledVisit).sort((a, b) => a.day.localeCompare(b.day))
}

export async function getScheduledVisit(customerId: string): Promise<ScheduledVisit | null> {
    const raw = await redisClient.hGet(SCHEDULED_KEY, customerId)
    return raw ? (JSON.parse(raw) as ScheduledVisit) : null
}

/** Schedules (or moves) a customer's visit to a business day — today or later. */
export async function scheduleVisit(customerId: string, customerName: string, day: string): Promise<ScheduledVisit> {
    if (!customerId) throw new Error("Customer id is required")
    if (!DAY_PATTERN.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new Error("day must be YYYY-MM-DD")
    if (day < businessDayKey()) throw new Error("A visit can't be scheduled for a day that has passed")
    const visit: ScheduledVisit = {
        customer_id: customerId,
        customer_name: customerName.trim() || customerId,
        day,
        scheduled_at: new Date().toISOString(),
    }
    await redisClient.hSet(SCHEDULED_KEY, customerId, JSON.stringify(visit))
    return visit
}

export async function cancelVisit(customerId: string) {
    await redisClient.hDel(SCHEDULED_KEY, customerId)
}

/** Closes a customer's scheduled visit with how it was confirmed, and logs it. Null when no visit was scheduled. */
export async function completeVisit(
    customerId: string,
    details: Pick<DoneVisit, "confirmation"> & Partial<Pick<DoneVisit, "distance_m" | "position">>,
): Promise<DoneVisit | null> {
    const scheduled = await getScheduledVisit(customerId)
    if (!scheduled) return null
    const done: DoneVisit = { ...scheduled, visited_at: new Date().toISOString(), ...details }
    await redisClient.lPush(LOG_KEY, JSON.stringify(done))
    await redisClient.lTrim(LOG_KEY, 0, LOG_LIMIT - 1)
    await redisClient.hDel(SCHEDULED_KEY, customerId)
    return done
}

export async function listDoneVisits(limit = 50): Promise<DoneVisit[]> {
    return (await redisClient.lRange(LOG_KEY, 0, limit - 1)).map((raw) => JSON.parse(raw) as DoneVisit)
}

// ---------- map locations ----------

/** Great-circle distance in metres. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6_371_000
    const rad = (deg: number) => (deg * Math.PI) / 180
    const dLat = rad(b.lat - a.lat)
    const dLng = rad(b.lng - a.lng)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
    return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

/**
 * Coordinates written in a Google Maps (or plain "lat,lng") link: the place
 * pin (!3d…!4d…) first, then ?q= / ?query= / ?ll= / ?destination=, then the
 * map centre (@lat,lng), then a bare "lat,lng". Null if there are none.
 */
export function coordinatesInLink(link: string): { lat: number; lng: number } | null {
    let text = link
    try {
        text = decodeURIComponent(link)
    } catch {
        // keep as is
    }
    const number = "(-?\\d{1,3}(?:\\.\\d+)?)"
    const patterns = [
        new RegExp(`!3d${number}!4d${number}`),
        new RegExp(`[?&](?:q|query|ll|destination|daddr)=(?:loc:)?${number},\\s*${number}`),
        new RegExp(`@${number},${number}`),
        new RegExp(`^\\s*${number}\\s*,\\s*${number}\\s*$`),
    ]
    for (const pattern of patterns) {
        const match = pattern.exec(text)
        if (match) {
            const lat = Number(match[1])
            const lng = Number(match[2])
            if (valid(lat, lng)) return { lat, lng }
        }
    }
    return null
}

const RESOLVED_CACHE_PREFIX = "visits:link-coords:"

/**
 * The coordinates of a customer's map link. Short links (maps.app.goo.gl,
 * goo.gl/maps) carry none, so they're followed (a few redirects, then the
 * page itself) and the result is cached a month. Null if none can be found.
 */
export async function resolveLinkCoordinates(link: string): Promise<{ lat: number; lng: number } | null> {
    const trimmed = link.trim()
    if (!trimmed) return null
    const direct = coordinatesInLink(trimmed)
    if (direct) return direct
    if (!/^https?:\/\//i.test(trimmed)) return null

    const cacheKey = RESOLVED_CACHE_PREFIX + trimmed
    const cached = await redisClient.get(cacheKey).catch(() => null)
    if (cached) return cached === "none" ? null : (JSON.parse(cached) as { lat: number; lng: number })

    let found: { lat: number; lng: number } | null = null
    try {
        let url = trimmed
        for (let hop = 0; hop < 5 && !found; hop++) {
            const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(6000) })
            const location = response.headers.get("location")
            if (location) {
                url = new URL(location, url).toString()
                found = coordinatesInLink(url)
                continue
            }
            // No more redirects: look for coordinates in the page itself.
            const html = (await response.text()).slice(0, 500_000)
            found = coordinatesInLink(url) ?? coordinatesInLink(/https?:\/\/[^"'\s]*maps[^"'\s]*/.exec(html)?.[0] ?? "")
            break
        }
    } catch (error) {
        console.error(`Visits: couldn't resolve the map link ${trimmed}`, error)
        return null // not cached: try again next time
    }
    await redisClient.set(cacheKey, found ? JSON.stringify(found) : "none", { EX: 30 * 24 * 60 * 60 }).catch(() => {})
    return found
}
