import { redisClient } from "../../config/redis.js"
import { ENV } from "../../constants/env.js"
import { PREFERRED_LANGUAGES } from "../zoho/customers/constants.js"
import type { PreferredLanguage } from "../zoho/customers/index.js"
import { listTemplates, placeholdersIn, type MetaTemplate } from "./templates.js"

/**
 * Which approved template each automatic notification uses, per customer
 * language — chosen in the app (Messages → WhatsApp → Templates →
 * Notification templates) and kept in Redis:
 *   wa:notification-templates  hash  "<kind>:<language>" -> {"name","language"} JSON
 * The template's own registered language is stored with it, so e.g. an
 * Amharic-text template registered under "en" just works. The old
 * WA_*_NOTIFICATION_TEMPLATE_* env vars are only a fallback for a slot that
 * hasn't been assigned in the app yet.
 */

const ASSIGNMENTS_KEY = "wa:notification-templates"

export type NotificationKind = "payment" | "balance"

export const NOTIFICATION_KINDS: {
    kind: NotificationKind
    label: string
    description: string
    /** Body variables the app fills, in order. */
    bodyVariables: string[]
    /** DOCUMENT: the invoice PDF goes in a document header. Otherwise no header, or a text one without variables. */
    header?: "DOCUMENT"
}[] = [
    {
        kind: "payment",
        label: "Payment confirmation",
        description: "Sent when a payment is recorded.",
        bodyVariables: ["Payment amount", "Date", "Remaining balance"],
    },
    {
        kind: "balance",
        label: "Invoice sent / balance",
        description: "Sent with the invoice PDF when an invoice is marked as sent.",
        bodyVariables: ["Invoice number", "Invoice amount", "Paid from this invoice", "Balance before", "Balance after"],
        header: "DOCUMENT",
    },
]

export type TemplateAssignment = { name: string; language: string }

/** Env fallback, with the language codes the env-based setup assumed (Amharic templates registered under "en"). */
const ENV_TEMPLATES: Record<NotificationKind, Record<PreferredLanguage, string | undefined>> = {
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
const ENV_LANGUAGE_CODES: Record<PreferredLanguage, string> = { am: "en", ar: "ar", en: "en" }

function slotKey(kind: NotificationKind, language: PreferredLanguage) {
    return `${kind}:${language}`
}

export function isNotificationKind(value: string): value is NotificationKind {
    return NOTIFICATION_KINDS.some((k) => k.kind === value)
}

export function isPreferredLanguage(value: string): value is PreferredLanguage {
    return (PREFERRED_LANGUAGES as string[]).includes(value)
}

/** Every assignment made in the app. */
async function readAssignments(): Promise<Record<string, TemplateAssignment>> {
    const raw = await redisClient.hGetAll(ASSIGNMENTS_KEY)
    const assignments: Record<string, TemplateAssignment> = {}
    for (const [key, value] of Object.entries(raw)) {
        try {
            const parsed = JSON.parse(value)
            if (parsed?.name && parsed?.language) assignments[key] = { name: String(parsed.name), language: String(parsed.language) }
        } catch {
            // Skip a malformed entry; the slot falls back to the env var.
        }
    }
    return assignments
}

/**
 * The template a notification should be sent with: the app's assignment,
 * else the env var. Undefined when neither is set (the send then fails
 * with a clear reason, as before).
 */
export async function resolveNotificationTemplate(
    kind: NotificationKind,
    language: PreferredLanguage,
): Promise<(TemplateAssignment & { source: "app" | "env" }) | undefined> {
    try {
        const raw = await redisClient.hGet(ASSIGNMENTS_KEY, slotKey(kind, language))
        const parsed = raw ? JSON.parse(raw) : undefined
        if (parsed?.name && parsed?.language) return { name: String(parsed.name), language: String(parsed.language), source: "app" }
    } catch (error) {
        // Redis down or a bad entry: still try the env fallback rather than skip the notification.
        console.error(`Failed to read the ${kind}/${language} notification template assignment:`, error)
    }
    const envName = ENV_TEMPLATES[kind][language]
    return envName ? { name: envName, language: ENV_LANGUAGE_CODES[language], source: "env" } : undefined
}

/**
 * Why a template can't be used for this notification, if it can't: the app
 * fills a fixed list of numbered body variables (and, for invoices, a PDF
 * header), so the template has to have exactly that shape.
 */
export function incompatibilityReason(template: MetaTemplate, kind: NotificationKind): string | undefined {
    const spec = NOTIFICATION_KINDS.find((k) => k.kind === kind)!
    if (template.parameter_format === "NAMED") return "Uses named variables; this notification needs numbered ones ({{1}}, {{2}}, …)"

    const header = template.components.find((c) => c.type === "HEADER")
    const headerFormat = header ? (header.format ?? "TEXT") : undefined
    if (spec.header === "DOCUMENT") {
        if (headerFormat !== "DOCUMENT") return "Needs a document header (for the invoice PDF)"
    } else if (headerFormat && headerFormat !== "TEXT") {
        return `Has a ${headerFormat.toLowerCase()} header; this notification sends no file`
    } else if (placeholdersIn(header?.text).length) {
        return "Its header has a variable; this notification fills none there"
    }

    const count = placeholdersIn(template.components.find((c) => c.type === "BODY")?.text).length
    if (count !== spec.bodyVariables.length)
        return `Has ${count} variable${count === 1 ? "" : "s"} in its message; this notification fills ${spec.bodyVariables.length}`

    const buttons = template.components.find((c) => c.type === "BUTTONS")?.buttons ?? []
    if (buttons.some((b) => b.type === "URL" && placeholdersIn(b.url).length)) return "Has a button link with a variable; this notification fills none"
    return undefined
}

/**
 * Everything the settings screen shows: per notification and language, what
 * it's currently sent with (and from where), plus every template on the
 * account with whether it fits that notification.
 */
export async function describeNotificationTemplates(force = false) {
    const [templates, assignments] = await Promise.all([listTemplates(force), readAssignments()])
    return {
        languages: PREFERRED_LANGUAGES,
        notifications: NOTIFICATION_KINDS.map((spec) => ({
            ...spec,
            slots: PREFERRED_LANGUAGES.map((language) => {
                const assigned = assignments[slotKey(spec.kind, language)]
                const envName = ENV_TEMPLATES[spec.kind][language]
                return {
                    language,
                    current: assigned
                        ? { ...assigned, source: "app" as const }
                        : envName
                          ? { name: envName, language: ENV_LANGUAGE_CODES[language], source: "env" as const }
                          : null,
                }
            }),
            options: templates.map((t) => {
                const reason = incompatibilityReason(t, spec.kind)
                return { name: t.name, language: t.language, status: t.status, ...(reason && { incompatible: reason }) }
            }),
        })),
    }
}

/** Assigns a template to a notification + customer language, after checking it exists and fits. */
export async function assignNotificationTemplate(kind: NotificationKind, language: PreferredLanguage, choice: TemplateAssignment) {
    const template = (await listTemplates(true)).find((t) => t.name === choice.name && t.language === choice.language)
    if (!template) throw new Error("Template not found")
    if (template.status === "REJECTED" || template.status === "DISABLED") throw new Error("This template can't be sent (it's rejected or disabled)")
    const reason = incompatibilityReason(template, kind)
    if (reason) throw new Error(reason)
    await redisClient.hSet(ASSIGNMENTS_KEY, slotKey(kind, language), JSON.stringify({ name: template.name, language: template.language }))
}

/** Removes the app's assignment; the slot falls back to its env var, if any. */
export async function clearNotificationTemplate(kind: NotificationKind, language: PreferredLanguage) {
    await redisClient.hDel(ASSIGNMENTS_KEY, slotKey(kind, language))
}
