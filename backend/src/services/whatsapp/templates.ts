import { ENV } from "../../constants/env.js"
import { deleteCache, getCache, setTTLCache } from "../../utils/cache.js"
import { GraphApi } from "./client.js"
import type { TemplateComponent } from "./messages.js"

/**
 * Message templates live on the WhatsApp Business Account (not the phone
 * number), so listing and creating them goes through its id. Meta reviews
 * every new template; only APPROVED ones can be sent.
 */

export type MetaTemplateButton = {
    type: string
    text: string
    url?: string
    phone_number?: string
    example?: string[]
}

export type MetaTemplateComponent = {
    type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS"
    format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION"
    text?: string
    buttons?: MetaTemplateButton[]
    example?: any
}

export type MetaTemplate = {
    id: string
    name: string
    language: string
    status: string
    category: string
    parameter_format?: "POSITIONAL" | "NAMED"
    components: MetaTemplateComponent[]
    rejected_reason?: string
}

const TEMPLATES_CACHE_KEY = "wa-templates"
const TEMPLATES_CACHE_SECONDS = 60
const BUSINESS_ACCOUNT_CACHE_KEY = "wa-business-account-id"
const BUSINESS_ACCOUNT_CACHE_SECONDS = 24 * 60 * 60

/**
 * The WhatsApp Business Account id: WA_BUSINESS_ACCOUNT_ID if set, otherwise
 * the account WA_TOKEN was granted whatsapp_business_management on (read
 * off the token itself, which works for system-user tokens).
 */
async function getBusinessAccountId(): Promise<string> {
    if (ENV.WA_BUSINESS_ACCOUNT_ID) return ENV.WA_BUSINESS_ACCOUNT_ID
    const cached = getCache(BUSINESS_ACCOUNT_CACHE_KEY)
    if (cached) return cached

    let accountId: string | undefined
    try {
        const token = encodeURIComponent(ENV.WA_TOKEN ?? "")
        const debug = await GraphApi(`debug_token?input_token=${token}&access_token=${token}`)
        const scopes: { scope: string; target_ids?: string[] }[] = debug?.data?.granular_scopes ?? []
        accountId = scopes.find((s) => s.scope === "whatsapp_business_management")?.target_ids?.[0]
    } catch (error) {
        console.error("Failed to look up the WhatsApp Business Account id from WA_TOKEN:", error)
    }
    if (!accountId)
        throw new Error("WhatsApp Business Account id unknown — set WA_BUSINESS_ACCOUNT_ID on the server")
    setTTLCache(BUSINESS_ACCOUNT_CACHE_KEY, accountId, BUSINESS_ACCOUNT_CACHE_SECONDS)
    return accountId
}

/** Every template on the account (all statuses), newest first as Meta returns them. Cached briefly; `force` skips the cache. */
export async function listTemplates(force = false): Promise<MetaTemplate[]> {
    if (!force) {
        const cached = getCache(TEMPLATES_CACHE_KEY)
        if (cached) return cached
    }
    const accountId = await getBusinessAccountId()
    const fields = "id,name,language,status,category,parameter_format,components,rejected_reason"
    const templates: MetaTemplate[] = []
    let after: string | undefined
    // Paged; a WhatsApp account rarely has more than a few hundred.
    for (let page = 0; page < 20; page++) {
        const result = await GraphApi(
            `${accountId}/message_templates?fields=${fields}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
        )
        templates.push(...(result?.data ?? []))
        after = result?.paging?.next ? result?.paging?.cursors?.after : undefined
        if (!after) break
    }
    setTTLCache(TEMPLATES_CACHE_KEY, templates, TEMPLATES_CACHE_SECONDS)
    return templates
}

export type NewTemplateButton =
    | { type: "QUICK_REPLY"; text: string }
    | { type: "URL"; text: string; url: string }
    | { type: "PHONE_NUMBER"; text: string; phone_number: string }

export type NewTemplate = {
    name: string
    language: string
    category: "UTILITY" | "MARKETING"
    header?: string
    /** Example values for the header's {{1}}, if it has one. */
    header_example?: string
    body: string
    /** Example values for the body's {{1}}, {{2}}, … in order. */
    body_examples?: string[]
    footer?: string
    buttons?: NewTemplateButton[]
}

/** The distinct placeholders in a template text, in order of first appearance: "1", "2", … (or names, for named templates). */
export function placeholdersIn(text: string | undefined): string[] {
    const found: string[] = []
    for (const match of (text ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
        if (!found.includes(match[1]!)) found.push(match[1]!)
    }
    return found
}

/** New templates use numbered placeholders, which Meta requires to run {{1}}, {{2}}, … without gaps. */
function checkNumberedPlaceholders(text: string, where: string, max: number) {
    const placeholders = placeholdersIn(text)
    if (placeholders.length > max) throw new Error(`The ${where} can have at most ${max} variable${max === 1 ? "" : "s"}`)
    const numbers = placeholders.map(Number).sort((a, b) => a - b)
    if (numbers.some((n, i) => n !== i + 1))
        throw new Error(`Variables in the ${where} must be numbered {{1}}, {{2}}, … in order`)
    return numbers.length
}

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : ""
}

/** Checks a create request and builds Meta's template definition from it. */
export function buildTemplateDefinition(input: any) {
    const name = cleanText(input?.name).toLowerCase()
    if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new Error("Name may only use lowercase letters, numbers and underscores")
    const language = cleanText(input?.language)
    if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) throw new Error("Choose a language")
    const category = input?.category
    if (category !== "UTILITY" && category !== "MARKETING") throw new Error("Choose a category")

    const components: MetaTemplateComponent[] = []

    const header = cleanText(input?.header)
    if (header) {
        if (header.length > 60) throw new Error("The header is limited to 60 characters")
        const count = checkNumberedPlaceholders(header, "header", 1)
        const example = cleanText(input?.header_example)
        if (count && !example) throw new Error("Give an example value for the header's variable")
        components.push({
            type: "HEADER",
            format: "TEXT",
            text: header,
            ...(count && { example: { header_text: [example] } }),
        })
    }

    const body = cleanText(input?.body)
    if (!body) throw new Error("The message text is required")
    if (body.length > 1024) throw new Error("The message text is limited to 1024 characters")
    const bodyCount = checkNumberedPlaceholders(body, "message text", 100)
    const bodyExamples: string[] = Array.isArray(input?.body_examples) ? input.body_examples.map(cleanText) : []
    if (bodyExamples.slice(0, bodyCount).filter(Boolean).length < bodyCount)
        throw new Error("Give an example value for every variable in the message text")
    components.push({
        type: "BODY",
        text: body,
        ...(bodyCount && { example: { body_text: [bodyExamples.slice(0, bodyCount)] } }),
    })

    const footer = cleanText(input?.footer)
    if (footer) {
        if (footer.length > 60) throw new Error("The footer is limited to 60 characters")
        if (placeholdersIn(footer).length) throw new Error("The footer can't have variables")
        components.push({ type: "FOOTER", text: footer })
    }

    const rawButtons: any[] = Array.isArray(input?.buttons) ? input.buttons : []
    if (rawButtons.length > 10) throw new Error("A template can have at most 10 buttons")
    const buttons: MetaTemplateButton[] = rawButtons.map((button) => {
        const text = cleanText(button?.text)
        if (!text) throw new Error("Every button needs a label")
        if (text.length > 25) throw new Error("Button labels are limited to 25 characters")
        if (button?.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text }
        if (button?.type === "URL") {
            const url = cleanText(button?.url)
            if (!/^https?:\/\/\S+$/.test(url) || placeholdersIn(url).length)
                throw new Error(`"${text}" needs a full web address (starting with https://)`)
            return { type: "URL", text, url }
        }
        if (button?.type === "PHONE_NUMBER") {
            const phone = cleanText(button?.phone_number).replace(/[^\d+]/g, "")
            if (!/^\+?\d{7,20}$/.test(phone)) throw new Error(`"${text}" needs a phone number with country code`)
            return { type: "PHONE_NUMBER", text, phone_number: phone.startsWith("+") ? phone : `+${phone}` }
        }
        throw new Error("Unknown button type")
    })
    if (buttons.length) components.push({ type: "BUTTONS", buttons })

    return { name, language, category, components }
}

/** Submits a new template for Meta's review. Resolves to its id and initial status (usually PENDING). */
export async function createTemplate(input: any): Promise<{ id: string; status: string; category: string }> {
    const definition = buildTemplateDefinition(input)
    const accountId = await getBusinessAccountId()
    const result = await GraphApi(`${accountId}/message_templates`, "POST", definition)
    deleteCache(TEMPLATES_CACHE_KEY)
    return { id: result.id, status: result.status, category: result.category }
}

/** Values to fill a template's variables with when sending it, keyed by placeholder ("1", "2", … or a name). */
export type TemplateValues = {
    header?: Record<string, string>
    body?: Record<string, string>
    /** Per button index, its URL's variable value. */
    buttons?: Record<string, string>
}

function fill(text: string | undefined, values: Record<string, string> | undefined) {
    return (text ?? "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, key) => values?.[key] ?? `{{${key}}}`)
}

/**
 * Turns a template plus the values for its variables into the send
 * components, and the readable text recorded in the chat history. Throws
 * if a value is missing or the template can't be sent from the app (a
 * media header needs a file the app doesn't collect).
 */
export function buildTemplateSend(template: MetaTemplate, values: TemplateValues) {
    if (template.status !== "APPROVED") throw new Error("Only approved templates can be sent")
    const named = template.parameter_format === "NAMED"
    const components: TemplateComponent[] = []
    const summary: string[] = []

    function parametersFor(text: string | undefined, given: Record<string, string> | undefined, where: string) {
        return placeholdersIn(text).map((key) => {
            const value = cleanText(given?.[key])
            if (!value) throw new Error(`Fill in every variable (${where} {{${key}}})`)
            return { type: "text" as const, text: value, ...(named && { parameter_name: key }) }
        })
    }

    for (const component of template.components) {
        if (component.type === "HEADER") {
            if (component.format && component.format !== "TEXT")
                throw new Error(`This template has a ${component.format.toLowerCase()} header, which can't be sent from here`)
            const parameters = parametersFor(component.text, values.header, "header")
            if (parameters.length) components.push({ type: "header", parameters })
            summary.push(fill(component.text, values.header))
        } else if (component.type === "BODY") {
            const parameters = parametersFor(component.text, values.body, "message")
            if (parameters.length) components.push({ type: "body", parameters })
            summary.push(fill(component.text, values.body))
        } else if (component.type === "FOOTER") {
            if (component.text) summary.push(component.text)
        } else if (component.type === "BUTTONS") {
            component.buttons?.forEach((button, index) => {
                if (button.type !== "URL" || !placeholdersIn(button.url).length) return
                const value = cleanText(values.buttons?.[String(index)])
                if (!value) throw new Error(`Fill in the link for the "${button.text}" button`)
                components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: value }] })
            })
        }
    }

    return { components, summary: summary.filter(Boolean).join("\n\n") }
}
