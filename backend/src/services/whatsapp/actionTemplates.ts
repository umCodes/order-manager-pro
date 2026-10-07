import { redisClient } from "../../config/redis.js"
import { ENV } from "../../constants/env.js"
import { PREFERRED_LANGUAGES } from "../zoho/customers/constants.js"
import type { PreferredLanguage } from "../zoho/customers/index.js"
import { uploadWhatsAppMedia } from "./client.js"
import { sendWhatsAppTemplate, type TemplateComponent, type TemplateParameter } from "./messages.js"
import { listTemplates, placeholdersIn, type MetaTemplate } from "./templates.js"

/**
 * WhatsApp templates the app sends on its own when something happens (a
 * payment is recorded, an invoice is sent). In Settings, each action gets a
 * template per customer preferred language, and each of the template's
 * variables is mapped to one of the action's values (or fixed text). Kept in
 * Redis:
 *   wa:action-templates  hash  "<action>:<language>" -> ActionTemplateAssignment JSON
 * The old WA_*_NOTIFICATION_TEMPLATE_* env vars are only a fallback for a
 * language not assigned in Settings, sent with the order they always used.
 */

const ASSIGNMENTS_KEY = "wa:action-templates"

export type ActionKey = "payment_recorded" | "invoice_sent"

type ActionField = { key: string; label: string; example: string }
type ActionMedia = { key: "invoice_pdf"; label: string; format: "DOCUMENT" }

export const ACTIONS: { key: ActionKey; label: string; description: string; fields: ActionField[]; media: ActionMedia[] }[] = [
    {
        key: "payment_recorded",
        label: "Payment recorded",
        description: "Sent to the customer when a payment is recorded (or re-sent from their payments).",
        fields: [
            { key: "customer_name", label: "Customer name", example: "Abebe Shop" },
            { key: "payment_amount", label: "Payment amount", example: "5000" },
            { key: "payment_date", label: "Payment date", example: "2026-10-07" },
            { key: "remaining_balance", label: "Remaining balance (all invoices)", example: "12500" },
        ],
        media: [],
    },
    {
        key: "invoice_sent",
        label: "Invoice sent",
        description: "Sent to the customer with the invoice PDF when an invoice is marked as sent.",
        fields: [
            { key: "customer_name", label: "Customer name", example: "Abebe Shop" },
            { key: "invoice_number", label: "Invoice number", example: "INV-000123" },
            { key: "invoice_date", label: "Invoice date", example: "2026-10-07" },
            { key: "due_date", label: "Due date", example: "2026-10-21" },
            { key: "invoice_amount", label: "Invoice amount", example: "8000" },
            { key: "paid_amount", label: "Paid on this invoice", example: "3000" },
            { key: "invoice_balance", label: "Left to pay on this invoice", example: "5000" },
            { key: "balance_before", label: "Balance before this invoice", example: "7500" },
            { key: "balance_after", label: "Balance after this invoice", example: "12500" },
        ],
        media: [{ key: "invoice_pdf", label: "Invoice PDF", format: "DOCUMENT" }],
    },
]

/** What fills one variable: one of the action's values, or fixed text. */
export type ValueSource = { field: string } | { text: string }

export type TemplateMapping = {
    /** Header text variables, by placeholder ("1" or a name). */
    header?: Record<string, ValueSource>
    /** A document header: which of the action's files goes in it. */
    header_media?: ActionMedia["key"]
    body?: Record<string, ValueSource>
    /** URL button variables, by button index. */
    buttons?: Record<string, ValueSource>
}

export type ActionTemplateAssignment = {
    name: string
    language: string
    /** Named-variable template: parameters must carry their names. */
    named?: boolean
    mapping: TemplateMapping
}

export function isActionKey(value: string): value is ActionKey {
    return ACTIONS.some((a) => a.key === value)
}

export function isPreferredLanguage(value: string): value is PreferredLanguage {
    return (PREFERRED_LANGUAGES as string[]).includes(value)
}

const slotKey = (action: ActionKey, language: PreferredLanguage) => `${action}:${language}`

/** The pre-Settings setup, from env vars: fixed variable order, Amharic templates registered under "en". */
function envAssignment(action: ActionKey, language: PreferredLanguage): ActionTemplateAssignment | undefined {
    const suffix = language.toUpperCase() as "AM" | "AR" | "EN"
    const name = action === "payment_recorded" ? ENV[`WA_PAYMENT_NOTIFICATION_TEMPLATE_${suffix}`] : ENV[`WA_BALANCE_NOTIFICATION_TEMPLATE_${suffix}`]
    if (!name) return undefined
    const order =
        action === "payment_recorded"
            ? ["payment_amount", "payment_date", "remaining_balance"]
            : ["invoice_number", "invoice_amount", "paid_amount", "balance_before", "balance_after"]
    return {
        name,
        language: language === "ar" ? "ar" : "en",
        mapping: {
            ...(action === "invoice_sent" && { header_media: "invoice_pdf" as const }),
            body: Object.fromEntries(order.map((field, i) => [String(i + 1), { field }])),
        },
    }
}

function parseAssignment(raw: string | null | undefined): ActionTemplateAssignment | undefined {
    if (!raw) return undefined
    try {
        const parsed = JSON.parse(raw)
        return parsed?.name && parsed?.language && parsed?.mapping ? parsed : undefined
    } catch {
        return undefined
    }
}

/** The template an action sends to customers of this language: Settings first, then the env fallback. */
export async function resolveActionTemplate(action: ActionKey, language: PreferredLanguage) {
    try {
        const assigned = parseAssignment(await redisClient.hGet(ASSIGNMENTS_KEY, slotKey(action, language)))
        if (assigned) return { ...assigned, source: "settings" as const }
    } catch (error) {
        // Redis down: still try the env fallback rather than skip the notification.
        console.error(`Failed to read the ${action}/${language} template assignment:`, error)
    }
    const fallback = envAssignment(action, language)
    return fallback ? { ...fallback, source: "env" as const } : undefined
}

function cleanSource(source: any, action: (typeof ACTIONS)[number], where: string): ValueSource {
    if (typeof source?.field === "string" && action.fields.some((f) => f.key === source.field)) return { field: source.field }
    if (typeof source?.text === "string" && source.text.trim()) return { text: source.text.trim().slice(0, 1000) }
    throw new Error(`Choose a value for ${where}`)
}

/**
 * Checks a mapping against the template it's for: every variable (header,
 * message, button links) needs a value, and a file header needs one of the
 * action's files. Returns the mapping with nothing extra in it.
 */
export function validateMapping(template: MetaTemplate, actionKey: ActionKey, input: any): ActionTemplateAssignment {
    const action = ACTIONS.find((a) => a.key === actionKey)!
    if (template.status === "REJECTED" || template.status === "DISABLED") throw new Error("This template can't be sent (it's rejected or disabled)")
    const mapping: TemplateMapping = {}

    const header = template.components.find((c) => c.type === "HEADER")
    if (header?.format && header.format !== "TEXT") {
        const media = action.media.find((m) => m.format === header.format && m.key === input?.header_media)
        if (!media) {
            if (!action.media.some((m) => m.format === header.format))
                throw new Error(`This template has a ${header.format.toLowerCase()} header, and "${action.label}" has no file to put there`)
            throw new Error("Choose which file goes in the header")
        }
        mapping.header_media = media.key
    } else {
        const keys = placeholdersIn(header?.text)
        if (keys.length) mapping.header = Object.fromEntries(keys.map((k) => [k, cleanSource(input?.header?.[k], action, `header {{${k}}}`)]))
    }

    const bodyKeys = placeholdersIn(template.components.find((c) => c.type === "BODY")?.text)
    if (bodyKeys.length) mapping.body = Object.fromEntries(bodyKeys.map((k) => [k, cleanSource(input?.body?.[k], action, `{{${k}}}`)]))

    const buttons = template.components.find((c) => c.type === "BUTTONS")?.buttons ?? []
    buttons.forEach((button, index) => {
        if (button.type !== "URL" || !placeholdersIn(button.url).length) return
        mapping.buttons = { ...mapping.buttons, [index]: cleanSource(input?.buttons?.[index], action, `the "${button.text}" link`) }
    })

    return { name: template.name, language: template.language, named: template.parameter_format === "NAMED", mapping }
}

/** Everything the Settings screen shows: each action, its values and files, and its assignment per language. */
export async function describeActionTemplates() {
    const raw = await redisClient.hGetAll(ASSIGNMENTS_KEY)
    return {
        languages: PREFERRED_LANGUAGES,
        actions: ACTIONS.map((action) => ({
            ...action,
            assignments: Object.fromEntries(
                PREFERRED_LANGUAGES.map((language) => {
                    const assigned = parseAssignment(raw[slotKey(action.key, language)])
                    const fallback = assigned ? undefined : envAssignment(action.key, language)
                    return [
                        language,
                        assigned ? { ...assigned, source: "settings" } : fallback ? { ...fallback, source: "env" } : null,
                    ]
                }),
            ),
        })),
    }
}

/** Saves a template + value mapping for an action and customer language, after checking it against the template. */
export async function assignActionTemplate(action: ActionKey, language: PreferredLanguage, input: any) {
    const name = typeof input?.name === "string" ? input.name.trim() : ""
    const templateLanguage = typeof input?.language === "string" ? input.language.trim() : ""
    const template = (await listTemplates(true)).find((t) => t.name === name && t.language === templateLanguage)
    if (!template) throw new Error("Template not found")
    const assignment = validateMapping(template, action, input?.mapping)
    await redisClient.hSet(ASSIGNMENTS_KEY, slotKey(action, language), JSON.stringify(assignment))
}

/** Removes a Settings assignment (the language falls back to its env var, if any). */
export async function clearActionTemplate(action: ActionKey, language: PreferredLanguage) {
    await redisClient.hDel(ASSIGNMENTS_KEY, slotKey(action, language))
}

function fill(text: string | undefined, values: Record<string, string>) {
    return (text ?? "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, key) => values[key] ?? whole)
}

/**
 * Sends an action's template: resolves the assignment for the customer's
 * language, fills each variable from `values` per its mapping, and attaches
 * the action's file to a document header. The chat history gets the
 * template's own wording with the values filled in.
 */
export async function sendActionTemplate(
    action: ActionKey,
    to: string,
    language: PreferredLanguage,
    values: Record<string, string>,
    files: Partial<Record<ActionMedia["key"], { buffer: Buffer; filename: string }>> = {},
) {
    const assignment = await resolveActionTemplate(action, language)
    console.log(
        `[WhatsApp] ${action}: language="${language}" -> template="${assignment?.name ?? "(none assigned)"}" (${assignment?.language}), source=${assignment?.source}`,
    )
    if (!assignment)
        throw new Error(`No template assigned to "${ACTIONS.find((a) => a.key === action)?.label}" for language "${language}" (Settings → WhatsApp templates)`)

    // WhatsApp rejects empty text parameters; an empty value is sent as "-".
    const resolve = (source: ValueSource) => ("field" in source ? values[source.field] : source.text)?.trim() || "-"
    const parametersFor = (map: Record<string, ValueSource> | undefined) =>
        Object.entries(map ?? {})
            .sort(([a], [b]) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))
            .map(([key, source]): TemplateParameter => ({ type: "text", text: resolve(source), ...(assignment.named && { parameter_name: key }) }))

    const components: TemplateComponent[] = []
    let fileLine = ""
    if (assignment.mapping.header_media) {
        const file = files[assignment.mapping.header_media]
        if (!file) throw new Error(`"${action}" has no ${assignment.mapping.header_media} to attach`)
        const mediaId = await uploadWhatsAppMedia(file.buffer, file.filename, "application/pdf")
        components.push({ type: "header", parameters: [{ type: "document", document: { id: mediaId, filename: file.filename } }] })
        fileLine = `📄 ${file.filename}`
    } else if (assignment.mapping.header) {
        components.push({ type: "header", parameters: parametersFor(assignment.mapping.header) })
    }
    if (assignment.mapping.body) components.push({ type: "body", parameters: parametersFor(assignment.mapping.body) })
    for (const [index, source] of Object.entries(assignment.mapping.buttons ?? {}))
        components.push({ type: "button", sub_type: "url", index, parameters: [{ type: "text", text: resolve(source) }] })

    // Readable history entry: the template's wording with the values in, when the template is at hand.
    let summary: string
    try {
        const template = (await listTemplates()).find((t) => t.name === assignment.name && t.language === assignment.language)
        if (!template) throw new Error("not listed")
        const valuesFor = (map: Record<string, ValueSource> | undefined) =>
            Object.fromEntries(Object.entries(map ?? {}).map(([key, source]) => [key, resolve(source)]))
        const part = (type: string) => template.components.find((c) => c.type === type)
        summary = [
            fileLine,
            assignment.mapping.header ? fill(part("HEADER")?.text, valuesFor(assignment.mapping.header)) : (part("HEADER")?.text ?? ""),
            fill(part("BODY")?.text, valuesFor(assignment.mapping.body)),
            part("FOOTER")?.text ?? "",
        ]
            .filter(Boolean)
            .join("\n\n")
    } catch {
        summary = [fileLine, `${ACTIONS.find((a) => a.key === action)?.label}: ${Object.values(values).filter(Boolean).join(" · ")}`]
            .filter(Boolean)
            .join("\n\n")
    }

    return sendWhatsAppTemplate(to, assignment.name, components, assignment.language, summary)
}
