import { ENV } from "../../constants/env.js"
import { deleteCache, getCache, setTTLCache } from "../../utils/cache.js"
import { GraphApi, uploadResumableFile } from "./client.js"
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
const APP_ID_CACHE_KEY = "wa-app-id"

/** The Meta app WA_TOKEN belongs to: WA_APP_ID if set, otherwise read off the token. */
async function getAppId(): Promise<string> {
    if (ENV.WA_APP_ID) return ENV.WA_APP_ID
    const cached = getCache(APP_ID_CACHE_KEY)
    if (cached) return cached
    const token = encodeURIComponent(ENV.WA_TOKEN ?? "")
    const debug = await GraphApi(`debug_token?input_token=${token}&access_token=${token}`)
    const appId = debug?.data?.app_id ? String(debug.data.app_id) : undefined
    if (!appId) throw new Error("Meta app id unknown — set WA_APP_ID on the server")
    setTTLCache(APP_ID_CACHE_KEY, appId, BUSINESS_ACCOUNT_CACHE_SECONDS)
    return appId
}

/** Header kinds a template can have: text, or a file sent with each message. */
export const MEDIA_HEADER_FORMATS = ["IMAGE", "VIDEO", "DOCUMENT"] as const
export type MediaHeaderFormat = (typeof MEDIA_HEADER_FORMATS)[number]

/** File types Meta accepts as the sample file for each media header kind. */
const SAMPLE_TYPES: Record<MediaHeaderFormat, string[]> = {
    IMAGE: ["image/jpeg", "image/png"],
    VIDEO: ["video/mp4"],
    DOCUMENT: ["application/pdf"],
}

/**
 * Uploads the sample file a new template with a file header must include
 * (Meta's reviewers look at it), returning the handle to create it with.
 */
export async function uploadTemplateSample(format: string, file: Buffer, filename: string, mimeType: string) {
    if (!MEDIA_HEADER_FORMATS.includes(format as MediaHeaderFormat)) throw new Error("Unknown header type")
    const allowed = SAMPLE_TYPES[format as MediaHeaderFormat]
    if (!allowed.includes(mimeType))
        throw new Error(`The sample for a ${format.toLowerCase()} header must be ${allowed.map((t) => t.split("/")[1]!.toUpperCase()).join(" or ")}`)
    return uploadResumableFile(await getAppId(), file, filename, mimeType)
}

/** The WhatsApp Business Account ids WA_TOKEN was granted, read off the token itself (works for system-user tokens). */
async function accountIdsFromToken(): Promise<string[]> {
    const token = encodeURIComponent(ENV.WA_TOKEN ?? "")
    const debug = await GraphApi(`debug_token?input_token=${token}&access_token=${token}`)
    const scopes: { scope: string; target_ids?: string[] }[] = debug?.data?.granular_scopes ?? []
    // Either WhatsApp permission's targets are business accounts; management first.
    return ["whatsapp_business_management", "whatsapp_business_messaging"].flatMap(
        (name) => scopes.find((s) => s.scope === name)?.target_ids ?? [],
    )
}

/** The WhatsApp Business Accounts of every business the token's user can see (needs business_management). */
async function accountIdsFromBusinesses(): Promise<string[]> {
    const fields = "owned_whatsapp_business_accounts{id},client_whatsapp_business_accounts{id}"
    const result = await GraphApi(`me/businesses?fields=${encodeURIComponent(fields)}`)
    return (result?.data ?? []).flatMap((business: any) => [
        ...(business?.owned_whatsapp_business_accounts?.data ?? []),
        ...(business?.client_whatsapp_business_accounts?.data ?? []),
    ]).map((account: any) => String(account.id))
}

/** Whether this business account owns the app's phone number (WA_PHONE_NUMBER_ID). */
async function ownsPhoneNumber(accountId: string) {
    try {
        const result = await GraphApi(`${accountId}/phone_numbers?fields=id`)
        return (result?.data ?? []).some((phone: any) => String(phone.id) === String(ENV.WA_PHONE_NUMBER_ID))
    } catch {
        return false
    }
}

/**
 * The WhatsApp Business Account id: WA_BUSINESS_ACCOUNT_ID if set, otherwise
 * looked up from what WA_TOKEN can reach — preferring the account that owns
 * WA_PHONE_NUMBER_ID, else the only candidate there is.
 */
async function getBusinessAccountId(): Promise<string> {
    if (ENV.WA_BUSINESS_ACCOUNT_ID) return ENV.WA_BUSINESS_ACCOUNT_ID
    const cached = getCache(BUSINESS_ACCOUNT_CACHE_KEY)
    if (cached) return cached

    const candidates = new Set<string>()
    for (const lookup of [accountIdsFromToken, accountIdsFromBusinesses]) {
        try {
            for (const id of await lookup()) candidates.add(id)
        } catch (error) {
            console.error(`WhatsApp Business Account lookup (${lookup.name}) failed:`, error)
        }
    }

    let accountId: string | undefined
    for (const id of candidates) {
        if (await ownsPhoneNumber(id)) {
            accountId = id
            break
        }
    }
    if (!accountId && candidates.size === 1) accountId = [...candidates][0]
    console.log(`[WhatsApp templates] business account candidates: [${[...candidates].join(", ")}] -> ${accountId ?? "none"}`)

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
    /** TEXT (the default) or a file header — IMAGE, VIDEO or DOCUMENT — sent with each message. */
    header_format?: "TEXT" | MediaHeaderFormat
    header?: string
    /** Example values for the header's {{1}}, if it has one. */
    header_example?: string
    /** File headers: the sample file's handle, from uploadTemplateSample. */
    header_handle?: string
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

    const headerFormat = cleanText(input?.header_format) || "TEXT"
    const header = cleanText(input?.header)
    if (MEDIA_HEADER_FORMATS.includes(headerFormat as MediaHeaderFormat)) {
        const handle = cleanText(input?.header_handle)
        if (!handle) throw new Error(`Add a sample ${headerFormat.toLowerCase()} for the header — WhatsApp's review needs one`)
        components.push({ type: "HEADER", format: headerFormat as MediaHeaderFormat, example: { header_handle: [handle] } })
    } else if (headerFormat !== "TEXT") {
        throw new Error("Unknown header type")
    } else if (header) {
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

/** Template names the app sends notifications with (WA_*_NOTIFICATION_TEMPLATE_*), which must not be deleted. */
function notificationTemplateNames() {
    return new Set(
        [
            ENV.WA_PAYMENT_NOTIFICATION_TEMPLATE_AM,
            ENV.WA_PAYMENT_NOTIFICATION_TEMPLATE_AR,
            ENV.WA_PAYMENT_NOTIFICATION_TEMPLATE_EN,
            ENV.WA_BALANCE_NOTIFICATION_TEMPLATE_AM,
            ENV.WA_BALANCE_NOTIFICATION_TEMPLATE_AR,
            ENV.WA_BALANCE_NOTIFICATION_TEMPLATE_EN,
        ].filter(Boolean),
    )
}

/**
 * Deletes one template (one name in one language — `hsm_id` keeps Meta from
 * deleting the name's other languages too). Refuses the templates the app's
 * payment / balance notifications are sent with. Meta won't let the same
 * name be reused for 30 days after deleting an approved template.
 */
export async function deleteTemplate(id: string) {
    const template = (await listTemplates(true)).find((t) => t.id === id)
    if (!template) throw new Error("Template not found")
    if (notificationTemplateNames().has(template.name))
        throw new Error("This template is used for payment / balance notifications and can't be deleted")
    const accountId = await getBusinessAccountId()
    await GraphApi(
        `${accountId}/message_templates?hsm_id=${encodeURIComponent(template.id)}&name=${encodeURIComponent(template.name)}`,
        "DELETE",
    )
    deleteCache(TEMPLATES_CACHE_KEY)
}

/** Values to fill a template's variables with when sending it, keyed by placeholder ("1", "2", … or a name). */
export type TemplateValues = {
    header?: Record<string, string>
    /** File headers: the uploaded file to send (uploadWhatsAppMedia's id). */
    header_media?: { id: string; filename?: string }
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
 * if a value (or a file header's file) is missing.
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
            if (component.format && component.format !== "TEXT") {
                const kind = component.format.toLowerCase()
                if (!MEDIA_HEADER_FORMATS.includes(component.format as MediaHeaderFormat))
                    throw new Error(`This template has a ${kind} header, which can't be sent from here`)
                const media = values.header_media
                if (!media?.id) throw new Error(`Attach the ${kind} for the header`)
                const filename = cleanText(media.filename)
                const parameter =
                    kind === "document"
                        ? { type: "document" as const, document: { id: media.id, ...(filename && { filename }) } }
                        : kind === "image"
                          ? { type: "image" as const, image: { id: media.id } }
                          : { type: "video" as const, video: { id: media.id } }
                components.push({ type: "header", parameters: [parameter] })
                summary.push(kind === "document" ? `📄 ${filename || "Document"}` : kind === "image" ? "📷 Photo" : "🎥 Video")
                continue
            }
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
