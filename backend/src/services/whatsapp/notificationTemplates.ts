import { ENV } from "../../constants/env.js"
import { redisClient } from "../../config/redis.js"
import { PREFERRED_LANGUAGES } from "../zoho/customers/constants.js"
import type { PreferredLanguage } from "../zoho/customers/index.js"
import { listTemplates, placeholdersIn, type MetaTemplate } from "./templates.js"

/**
 * Which WhatsApp template each automatic notification goes out with, per
 * customer language. Chosen on the Settings page and kept in Redis; a slot
 * nobody has chosen falls back to the WA_*_NOTIFICATION_TEMPLATE_* env var.
 *
 * - `payment`: sent when a payment is recorded.
 * - `balance`: sent when an invoice is marked as sent (or paid from draft),
 *   with the invoice PDF attached.
 */
export const NOTIFICATION_KINDS = ["payment", "balance"] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/** A template is identified by its name plus the language it was registered in. */
export type TemplateRef = { name: string; language: string }

export type NotificationTemplateSettings = Record<NotificationKind, Partial<Record<PreferredLanguage, TemplateRef>>>

const SETTINGS_KEY = "settings:notification-templates"

const ENV_DEFAULTS: Record<NotificationKind, Record<PreferredLanguage, string | undefined>> = {
    payment: {
        am: ENV.WA_PAYMENT_NOTIFICATION_TEMPLATE_AM,
        ar: ENV.WA_PAYMENT_NOTIFICATION_TEMPLATE_AR,
        en: ENV.WA_PAYMENT_NOTIFICATION_TEMPLATE_EN,
    },
    balance: {
        am: ENV.WA_BALANCE_NOTIFICATION_TEMPLATE_AM,
        ar: ENV.WA_BALANCE_NOTIFICATION_TEMPLATE_AR,
        en: ENV.WA_BALANCE_NOTIFICATION_TEMPLATE_EN,
    },
}

/** WhatsApp template language code for the env defaults: Amharic templates are registered under "en" in Meta Business Manager, not "am". */
const ENV_DEFAULT_LANGUAGE_CODES: Record<PreferredLanguage, string> = {
    am: "en",
    ar: "ar",
    en: "en",
}

/** The template each slot falls back to when nothing is chosen in Settings. */
export function defaultNotificationTemplates(): NotificationTemplateSettings {
    const defaults: NotificationTemplateSettings = { payment: {}, balance: {} }
    for (const kind of NOTIFICATION_KINDS) {
        for (const language of PREFERRED_LANGUAGES) {
            const name = ENV_DEFAULTS[kind][language]
            if (name) defaults[kind][language] = { name, language: ENV_DEFAULT_LANGUAGE_CODES[language] }
        }
    }
    return defaults
}

/** What's been chosen in Settings (only the slots someone picked). */
export async function getNotificationTemplateSettings(): Promise<NotificationTemplateSettings> {
    const raw = await redisClient.get(SETTINGS_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<NotificationTemplateSettings>) : {}
    return { payment: saved.payment ?? {}, balance: saved.balance ?? {} }
}

/** The template to send a notification with: the Settings choice, else the env default. */
export async function resolveNotificationTemplate(
    kind: NotificationKind,
    language: PreferredLanguage,
): Promise<TemplateRef | undefined> {
    const settings = await getNotificationTemplateSettings()
    return settings[kind][language] ?? defaultNotificationTemplates()[kind][language]
}

/** Every template name a notification can currently go out with — these can't be deleted. */
export async function notificationTemplateNames(): Promise<Set<string>> {
    const settings = await getNotificationTemplateSettings()
    const defaults = defaultNotificationTemplates()
    const names = new Set<string>()
    for (const kind of NOTIFICATION_KINDS) {
        for (const language of PREFERRED_LANGUAGES) {
            const ref = settings[kind][language] ?? defaults[kind][language]
            if (ref) names.add(ref.name)
        }
    }
    return names
}

/**
 * Whether a template has the shape a notification fills in: positional
 * placeholders, and exactly the variables the app sends — payment: {{1}}
 * amount, {{2}} date, {{3}} remaining balance; balance: a document header
 * for the invoice PDF plus {{1}} invoice number, {{2}} amount, {{3}} paid,
 * {{4}} balance before, {{5}} balance after. No other variables (header
 * text or button links), since the app has nothing to fill them with.
 */
export function fitsNotification(kind: NotificationKind, template: MetaTemplate): boolean {
    if (template.status !== "APPROVED") return false
    if (template.parameter_format === "NAMED") return false

    const header = template.components.find((c) => c.type === "HEADER")
    const body = template.components.find((c) => c.type === "BODY")
    const buttons = template.components.find((c) => c.type === "BUTTONS")

    if (buttons?.buttons?.some((b) => placeholdersIn(b.url).length > 0)) return false
    if (header && (!header.format || header.format === "TEXT") && placeholdersIn(header.text).length > 0) return false

    const expected = kind === "payment" ? ["1", "2", "3"] : ["1", "2", "3", "4", "5"]
    // Variables can appear out of order in the text, so compare them sorted.
    const bodyVars = placeholdersIn(body?.text).sort((a, b) => Number(a) - Number(b))
    if (bodyVars.length !== expected.length || bodyVars.some((v, i) => v !== expected[i])) return false

    if (kind === "balance") return header?.format === "DOCUMENT"
    return !header || !header.format || header.format === "TEXT"
}

/** The approved templates each notification could be switched to. */
export async function notificationTemplateOptions(force = false): Promise<Record<NotificationKind, MetaTemplate[]>> {
    const templates = await listTemplates(force)
    return {
        payment: templates.filter((t) => fitsNotification("payment", t)),
        balance: templates.filter((t) => fitsNotification("balance", t)),
    }
}

/**
 * Saves the Settings choices. Each slot is a template ref, or null to go back
 * to the env default. Every chosen template must exist, be approved, and fit
 * the notification (see fitsNotification) — otherwise nothing is saved.
 */
export async function saveNotificationTemplateSettings(input: any): Promise<NotificationTemplateSettings> {
    const templates = await listTemplates(true)
    const next: NotificationTemplateSettings = { payment: {}, balance: {} }

    for (const kind of NOTIFICATION_KINDS) {
        for (const language of PREFERRED_LANGUAGES) {
            const ref = input?.[kind]?.[language]
            if (!ref) continue
            const name = String(ref.name ?? "")
            const templateLanguage = String(ref.language ?? "")
            const template = templates.find((t) => t.name === name && t.language === templateLanguage)
            if (!template) throw new Error(`Template "${name}" (${templateLanguage}) not found`)
            if (!fitsNotification(kind, template))
                throw new Error(`Template "${name}" (${templateLanguage}) can't be used for the ${kind} notification`)
            next[kind][language] = { name, language: templateLanguage }
        }
    }

    await redisClient.set(SETTINGS_KEY, JSON.stringify(next))
    return next
}
