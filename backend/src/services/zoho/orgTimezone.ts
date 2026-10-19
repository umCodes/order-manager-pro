import { ZohoApi } from "./client.js"
import { ENV } from "../../constants/env.js"
import { getCache, setTTLCache } from "../../utils/cache.js"
import { BUSINESS_UTC_OFFSET_HOURS } from "../../utils/businessDate.js"

/**
 * The app dates everything in the business's time zone (UTC+3, see
 * businessDate.ts). Zoho dates what it creates itself (an invoice saved
 * without a date, its own timestamps) in the organization's time zone, set
 * in Zoho under Settings → Organization Profile. If the two differ, dates
 * near midnight disagree — so this reads Zoho's setting (cached a day, one
 * call) and reports whether it matches.
 */

const CACHE_KEY = "zoho-org-timezone"
const CACHE_SECONDS = 24 * 60 * 60

/** UTC offset (hours) of an IANA time zone right now, or null if the name isn't one. */
function offsetHoursOf(timeZone: string, at = new Date()): number | null {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
        }).formatToParts(at)
        const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
        const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"))
        return Math.round(((asUtc - at.getTime()) / 3_600_000) * 4) / 4
    } catch {
        return null
    }
}

export type ZohoTimezoneCheck = { timeZone: string | null; offsetHours: number | null; matches: boolean | null }

/**
 * Zoho's organization time zone and whether it matches the business's
 * UTC+3. `matches` is null when it couldn't be read or recognised (the
 * caller then just doesn't warn).
 */
export async function checkZohoTimezone(accessToken: string): Promise<ZohoTimezoneCheck> {
    const cached = getCache(CACHE_KEY) as ZohoTimezoneCheck | undefined
    if (cached) return cached
    let result: ZohoTimezoneCheck = { timeZone: null, offsetHours: null, matches: null }
    try {
        const response = await ZohoApi(`organizations/${encodeURIComponent(String(ENV.ORGANIZATION_ID))}`, accessToken)
        const timeZone = response?.organization?.time_zone ? String(response.organization.time_zone) : null
        const offsetHours = timeZone ? offsetHoursOf(timeZone) : null
        result = { timeZone, offsetHours, matches: offsetHours === null ? null : offsetHours === BUSINESS_UTC_OFFSET_HOURS }
        if (result.matches === false) {
            console.warn(`Zoho organization time zone is ${timeZone} (UTC${offsetHours! >= 0 ? "+" : ""}${offsetHours}), but the app uses UTC+${BUSINESS_UTC_OFFSET_HOURS}: dates near midnight can disagree.`)
        }
    } catch (error) {
        console.error("Couldn't read Zoho's organization time zone", error)
    }
    // A failed read is retried within the hour rather than a day later.
    setTTLCache(CACHE_KEY, result, result.timeZone ? CACHE_SECONDS : 60 * 60)
    return result
}
