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
 * - `return`: sent after a return on a sent invoice, with the Return Notice PDF.
 * - `payment_correction`: sent when a payment's amount is changed.
 * - `payment_deletion`: sent when a payment is deleted.
 *
 * The last three have no env default: they only go out once a template is
 * chosen for them in Settings.
 */
export const NOTIFICATION_KINDS = ["payment", "balance", "return", "payment_correction", "payment_deletion"] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/** A template is identified by its name plus the language it was registered in. */
export type TemplateRef = { name: string; language: string }

export type NotificationTemplateSettings = Record<NotificationKind, Partial<Record<PreferredLanguage, TemplateRef>>>

const SETTINGS_KEY = "settings:notification-templates"

const ENV_DEFAULTS: Partial<Record<NotificationKind, Record<PreferredLanguage, string | undefined>>> = {
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

/** One empty slot set per notification kind. */
function emptySettings(): NotificationTemplateSettings {
    return Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, {}])) as NotificationTemplateSettings
}

/** The template each slot falls back to when nothing is chosen in Settings. */
export function defaultNotificationTemplates(): NotificationTemplateSettings {
    const defaults = emptySettings()
    for (const kind of NOTIFICATION_KINDS) {
        for (const language of PREFERRED_LANGUAGES) {
            const name = ENV_DEFAULTS[kind]?.[language]
            if (name) defaults[kind][language] = { name, language: ENV_DEFAULT_LANGUAGE_CODES[language] }
        }
    }
    return defaults
}

/** What's been chosen in Settings (only the slots someone picked). */
export async function getNotificationTemplateSettings(): Promise<NotificationTemplateSettings> {
    const raw = await redisClient.get(SETTINGS_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<NotificationTemplateSettings>) : {}
    const settings = emptySettings()
    for (const kind of NOTIFICATION_KINDS) settings[kind] = saved[kind] ?? {}
    return settings
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
 * The body variables each notification fills, in order, and whether it
 * carries a PDF as a document header:
 * - payment: {{1}} amount, {{2}} date, {{3}} remaining balance.
 * - balance (invoice PDF): {{1}} invoice number, {{2}} amount, {{3}} paid,
 *   {{4}} balance before, {{5}} balance after.
 * - return (Return Notice PDF): {{1}} return (credit note) number,
 *   {{2}} invoice number, {{3}} amount returned, {{4}} balance after.
 * - payment_correction: {{1}} payment number, {{2}} old amount,
 *   {{3}} corrected amount, {{4}} balance after.
 * - payment_deletion: {{1}} payment number, {{2}} balance after.
 */
const NOTIFICATION_SHAPES: Record<NotificationKind, { variables: number; document: boolean }> = {
    payment: { variables: 3, document: false },
    balance: { variables: 5, document: true },
    return: { variables: 4, document: true },
    payment_correction: { variables: 4, document: false },
    payment_deletion: { variables: 2, document: false },
}

/**
 * Whether a template has the shape a notification fills in (see
 * NOTIFICATION_SHAPES): positional placeholders, exactly the body variables
 * the app sends, and a document header only for the ones with a PDF. No
 * other variables (header text or button links), since the app has nothing
 * to fill them with.
 */
export function fitsNotification(kind: NotificationKind, template: MetaTemplate): boolean {
    if (template.status !== "APPROVED") return false
    if (template.parameter_format === "NAMED") return false

    const header = template.components.find((c) => c.type === "HEADER")
    const body = template.components.find((c) => c.type === "BODY")
    const buttons = template.components.find((c) => c.type === "BUTTONS")

    if (buttons?.buttons?.some((b) => placeholdersIn(b.url).length > 0)) return false
    if (header && (!header.format || header.format === "TEXT") && placeholdersIn(header.text).length > 0) return false

    const shape = NOTIFICATION_SHAPES[kind]
    const expected = Array.from({ length: shape.variables }, (_, i) => String(i + 1))
    // Variables can appear out of order in the text, so compare them sorted.
    const bodyVars = placeholdersIn(body?.text).sort((a, b) => Number(a) - Number(b))
    if (bodyVars.length !== expected.length || bodyVars.some((v, i) => v !== expected[i])) return false

    if (shape.document) return header?.format === "DOCUMENT"
    return !header || !header.format || header.format === "TEXT"
}

/** The approved templates each notification could be switched to. */
export async function notificationTemplateOptions(force = false): Promise<Record<NotificationKind, MetaTemplate[]>> {
    const templates = await listTemplates(force)
    return Object.fromEntries(
        NOTIFICATION_KINDS.map((kind) => [kind, templates.filter((t) => fitsNotification(kind, t))]),
    ) as Record<NotificationKind, MetaTemplate[]>
}

/**
 * Saves the Settings choices. Each slot is a template ref, or null to go back
 * to the env default. Every chosen template must exist, be approved, and fit
 * the notification (see fitsNotification) — otherwise nothing is saved.
 */
export async function saveNotificationTemplateSettings(input: any): Promise<NotificationTemplateSettings> {
    const templates = await listTemplates(true)
    const next = emptySettings()

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
