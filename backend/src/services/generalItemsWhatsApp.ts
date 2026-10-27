import { redisClient } from "../config/redis.js"
import { sendWhatsAppTemplate } from "./whatsapp/messages.js"
import { toWaId } from "./whatsapp/chatStore.js"
import { listTemplates, placeholdersIn, type MetaTemplate } from "./whatsapp/templates.js"
import { getGeneralItemIds } from "./generalItems.js"

/**
 * General items on WhatsApp: whenever an invoice has a general item line
 * (see generalItems.ts), its description is sent with the template chosen
 * in Settings to the number chosen there. The template's body variables are
 * filled in order, as many as it has:
 *   {{1}} the line's description, {{2}} quantity and unit,
 *   {{3}} customer, {{4}} invoice number.
 * Each line is sent once per invoice — a draft updated later only sends
 * general lines it didn't have (by item and description). Best-effort: a
 * failure is logged and never fails the invoice.
 */

const SETTINGS_KEY = "settings:general-items-whatsapp"
const MAX_VARIABLES = 4
/** Template statuses that can be chosen (a template under review can be picked ahead of approval). */
const CHOOSABLE_STATUSES = new Set(["APPROVED", "PENDING", "IN_APPEAL"])
const SENT_KEY = (invoiceId: string) => `general-items:notified:${invoiceId}`
const SENT_KEEP_SECONDS = 30 * 24 * 60 * 60

export type GeneralItemsWhatsAppSettings = { template: { name: string; language: string } | null; recipient: string | null }
export type GeneralItemsTemplateOption = { id: string; name: string; language: string; status: string; variables: number }

/** Body variables {{1}}…{{n}} (1 to 4 of them, in order); no variables or media in the header, none in buttons. Null when it doesn't fit. */
export function generalItemsTemplateVariables(template: MetaTemplate): number | null {
    if (template.parameter_format === "NAMED") return null
    const header = template.components.find((c) => c.type === "HEADER")
    const body = template.components.find((c) => c.type === "BODY")
    const buttons = template.components.find((c) => c.type === "BUTTONS")
    if (header && (header.format !== "TEXT" || placeholdersIn(header.text).length > 0)) return null
    if (buttons?.buttons?.some((b) => placeholdersIn(b.url).length > 0)) return null
    const vars = placeholdersIn(body?.text).map(Number).sort((a, b) => a - b)
    if (vars.length < 1 || vars.length > MAX_VARIABLES || vars.some((v, i) => v !== i + 1)) return null
    return vars.length
}

export async function getGeneralItemsWhatsAppSettings(): Promise<GeneralItemsWhatsAppSettings> {
    const raw = await redisClient.get(SETTINGS_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<GeneralItemsWhatsAppSettings>) : {}
    return { template: saved.template ?? null, recipient: saved.recipient ?? null }
}

/** Templates general items can be sent with: the right shape, approved or still under review. */
export async function generalItemsTemplateOptions(force = false): Promise<GeneralItemsTemplateOption[]> {
    const options: GeneralItemsTemplateOption[] = []
    for (const t of await listTemplates(force)) {
        const variables = CHOOSABLE_STATUSES.has(t.status) ? generalItemsTemplateVariables(t) : null
        if (variables) options.push({ id: t.id, name: t.name, language: t.language, status: t.status, variables })
    }
    return options
}

/** Validates and saves the template and the number (digits only, 8–15 of them). */
export async function saveGeneralItemsWhatsAppSettings(input: any): Promise<GeneralItemsWhatsAppSettings> {
    let template: GeneralItemsWhatsAppSettings["template"] = null
    if (input?.template) {
        const name = String(input.template.name ?? "")
        const language = String(input.template.language ?? "")
        const found = (await listTemplates(true)).find((t) => t.name === name && t.language === language)
        if (!found) throw new Error(`Template "${name}" (${language}) not found`)
        if (!generalItemsTemplateVariables(found)) {
            throw new Error(`Template "${name}" doesn't fit: it needs the body variables {{1}} to at most {{${MAX_VARIABLES}}}, and no variables or media in its header`)
        }
        template = { name, language }
    }

    const phone = toWaId(String(input?.recipient ?? ""))
    if (phone && (phone.length < 8 || phone.length > 15)) throw new Error(`"${String(input.recipient)}" isn't a valid phone number`)

    const settings = { template, recipient: phone || null }
    await redisClient.set(SETTINGS_KEY, JSON.stringify(settings))
    return settings
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** WhatsApp refuses template variables with new lines, tabs or more than 4 spaces in a row. */
const variableText = (value: string) => value.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim() || "-"

/**
 * Sends the invoice's general item lines that haven't been sent for it yet.
 * Does nothing (quietly) when Settings has no template or number, or the
 * invoice has no general items; never throws.
 */
export async function notifyGeneralItems(invoice: any): Promise<void> {
    try {
        const invoiceId = String(invoice?.invoice_id ?? "")
        const generalIds = new Set(await getGeneralItemIds())
        const lines = (invoice?.line_items ?? []).filter((line: any) => generalIds.has(String(line.item_id)))
        if (!invoiceId || lines.length === 0) return

        const settings = await getGeneralItemsWhatsAppSettings()
        if (!settings.template || !settings.recipient) return
        const chosen = settings.template
        const template = (await listTemplates()).find((t) => t.name === chosen.name && t.language === chosen.language)
        const variables = template ? generalItemsTemplateVariables(template) : null
        if (!template || !variables) {
            console.error(`General items: the template "${chosen.name}" (${chosen.language}) is missing or no longer fits — choose another in Settings`)
            return
        }
        if (template.status !== "APPROVED") {
            console.error(`General items: the template "${chosen.name}" can't be sent yet: WhatsApp's review status is ${template.status}`)
            return
        }

        for (const line of lines) {
            const description = String(line.description ?? "").replace(/###/g, "").trim() || String(line.name ?? "")
            // Claimed before sending, so the same line is never sent twice (even by two requests at once).
            const claimed = await redisClient.sAdd(SENT_KEY(invoiceId), `${line.item_id}|${description}`)
            await redisClient.expire(SENT_KEY(invoiceId), SENT_KEEP_SECONDS)
            if (!claimed) continue

            const values = [
                description,
                `${round3(Number(line.quantity) || 0)} ${String(line.unit ?? "")}`.trim(),
                String(invoice.customer_name ?? ""),
                String(invoice.invoice_number ?? ""),
            ].slice(0, variables)
            const summary = [description, ...values.slice(1)].join("\n")
            try {
                await sendWhatsAppTemplate(
                    settings.recipient,
                    chosen.name,
                    [{ type: "body", parameters: values.map((text) => ({ type: "text" as const, text: variableText(text) })) }],
                    chosen.language,
                    summary,
                )
            } catch (error) {
                console.error(`General items: couldn't send "${description}" of ${invoice.invoice_number} on WhatsApp`, error)
            }
        }
    } catch (error) {
        console.error("General items: failed to send the WhatsApp notice", error)
    }
}
