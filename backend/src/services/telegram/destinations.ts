import { redisClient } from "../../config/redis.js"
import { ENV, TELEGRAM_GROUP_CHATID } from "../../constants/env.js"

/**
 * Where bot messages caused by an action in the app go: the channel, the
 * preparers' group, both (default), or neither. Chosen in Settings →
 * Telegram. Covers invoices, their change replies, reposts after a
 * reschedule, and messages sent from the Messages tab — not automatic
 * messages (backup lists, daily reports) or anything that answers the
 * preparers' replies in the group, which carry on as before.
 *
 * A setting applies to orders posted after it changes: an order already
 * posted keeps its thread where it is (see `InvoiceRoute`), and edits and
 * deletes always follow a message to wherever it was posted.
 */

const SETTINGS_KEY = "settings:telegram-destinations"

export type TelegramDestinations = { channel: boolean; group: boolean }
const DEFAULT_DESTINATIONS: TelegramDestinations = { channel: true, group: true }

export async function getTelegramDestinations(): Promise<TelegramDestinations> {
    const raw = await redisClient.get(SETTINGS_KEY).catch(() => null)
    if (!raw) return DEFAULT_DESTINATIONS
    try {
        const saved = JSON.parse(raw)
        return { channel: saved?.channel !== false, group: saved?.group !== false }
    } catch {
        return DEFAULT_DESTINATIONS
    }
}

export async function saveTelegramDestinations(input: any): Promise<TelegramDestinations> {
    if (typeof input?.channel !== "boolean" || typeof input?.group !== "boolean") {
        throw new Error("channel and group must each be true or false")
    }
    const destinations = { channel: input.channel, group: input.group }
    await redisClient.set(SETTINGS_KEY, JSON.stringify(destinations))
    return destinations
}

/** Whether a preparers' group is set up at all (TELEGRAM_GROUP_CHATID). */
export const hasGroup = () => !!TELEGRAM_GROUP_CHATID

/**
 * Where one order's thread lives: the chat its messages are posted to
 * (`chatId`) and whether they're copied to the group (`mirror`). Decided
 * when the order is first posted and kept with it.
 */
export type InvoiceRoute = { chatId: string; mirror: boolean }

/** The route a new order takes under the current settings, or null when both are off. */
export async function routeForNewOrder(): Promise<InvoiceRoute | null> {
    const { channel, group } = await getTelegramDestinations()
    if (channel) return { chatId: String(ENV.TELEGRAM_CHATID), mirror: group }
    if (group && hasGroup()) return { chatId: String(TELEGRAM_GROUP_CHATID), mirror: false }
    return null
}

/** The route of orders posted before routes were kept: the channel, copied to the group as it always was. */
export const LEGACY_ROUTE: InvoiceRoute = { chatId: String(ENV.TELEGRAM_CHATID), mirror: true }
