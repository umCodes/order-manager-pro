import { redisClient } from "../config/redis.js"
import { sendWhatsAppTemplate } from "./whatsapp/messages.js"
import { toWaId } from "./whatsapp/chatStore.js"
import { listTemplates, placeholdersIn, type MetaTemplate } from "./whatsapp/templates.js"
import { getGeneralItemIds } from "./generalItems.js"
import { invoiceDayName } from "./telegram/invoices/messageText.js"
import { quantityCalc } from "../utils/quantity.js"
import { businessDayKey } from "../utils/businessDate.js"

/**
 * General items on WhatsApp: whenever an invoice has general item lines (see
 * generalItems.ts), one message lists them, sent with the template chosen in
 * Settings to the number chosen there. The template's body has exactly:
 *   {{1}} the invoice number,
 *   {{2}} and {{3}} the items, each written as on Telegram ("3ኪሎ በርበሬ":
 *         quantity by its unit, then the Amharic description; " • " between
 *         several), split between the two: with one item {{3}} is "-",
 *   {{4}} the day it's for, as on Telegram ("ለዛሬ", "ለሰኞ").
 * Each line is sent once per invoice — a draft updated later only lists the
 * general lines it didn't have before (by item and description). Best-effort:
 * a failure is logged and never fails the invoice.
 */

const SETTINGS_KEY = "settings:general-items-whatsapp"
const VARIABLES = 4
/** What {{3}} says when every item fits in {{2}}: WhatsApp refuses an empty variable. */
const EMPTY_VARIABLE = "-"
/** Template statuses that can be chosen (a template under review can be picked ahead of approval). */
const CHOOSABLE_STATUSES = new Set(["APPROVED", "PENDING", "IN_APPEAL"])
const SENT_KEY = (invoiceId: string) => `general-items:notified:${invoiceId}`
const SENT_KEEP_SECONDS = 30 * 24 * 60 * 60

export type GeneralItemsWhatsAppSettings = { template: { name: string; language: string } | null; recipient: string | null }
export type GeneralItemsTemplateOption = { id: string; name: string; language: string; status: string }

/** Whether a template fits: body variables exactly {{1}}–{{4}}; no variables or media in the header, none in buttons. */
export function fitsGeneralItems(template: MetaTemplate): boolean {
    if (template.parameter_format === "NAMED") return false
    const header = template.components.find((c) => c.type === "HEADER")
    const body = template.components.find((c) => c.type === "BODY")
    const buttons = template.components.find((c) => c.type === "BUTTONS")
    if (header && (header.format !== "TEXT" || placeholdersIn(header.text).length > 0)) return false
    if (buttons?.buttons?.some((b) => placeholdersIn(b.url).length > 0)) return false
    const vars = placeholdersIn(body?.text).map(Number).sort((a, b) => a - b)
    return vars.length === VARIABLES && vars.every((v, i) => v === i + 1)
}

export async function getGeneralItemsWhatsAppSettings(): Promise<GeneralItemsWhatsAppSettings> {
    const raw = await redisClient.get(SETTINGS_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<GeneralItemsWhatsAppSettings>) : {}
    return { template: saved.template ?? null, recipient: saved.recipient ?? null }
}

/** Templates general items can be sent with: the right shape, approved or still under review. */
export async function generalItemsTemplateOptions(force = false): Promise<GeneralItemsTemplateOption[]> {
    return (await listTemplates(force))
        .filter((t) => CHOOSABLE_STATUSES.has(t.status) && fitsGeneralItems(t))
        .map((t) => ({ id: t.id, name: t.name, language: t.language, status: t.status }))
}

/** Validates and saves the template and the number (digits only, 8–15 of them). */
export async function saveGeneralItemsWhatsAppSettings(input: any): Promise<GeneralItemsWhatsAppSettings> {
    let template: GeneralItemsWhatsAppSettings["template"] = null
    if (input?.template) {
        const name = String(input.template.name ?? "")
        const language = String(input.template.language ?? "")
        const found = (await listTemplates(true)).find((t) => t.name === name && t.language === language)
        if (!found) throw new Error(`Template "${name}" (${language}) not found`)
        if (!fitsGeneralItems(found)) {
            throw new Error(`Template "${name}" doesn't fit: its body needs exactly the variables {{1}}–{{${VARIABLES}}}, and its header no variables or media`)
        }
        template = { name, language }
    }

    const phone = toWaId(String(input?.recipient ?? ""))
    if (phone && (phone.length < 8 || phone.length > 15)) throw new Error(`"${String(input.recipient)}" isn't a valid phone number`)

    const settings = { template, recipient: phone || null }
    await redisClient.set(SETTINGS_KEY, JSON.stringify(settings))
    return settings
}

/** WhatsApp refuses template variables with new lines, tabs or more than 4 spaces in a row. */
const variableText = (value: string) => value.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim() || "-"

/** A line as Telegram writes it (see telegram/invoices/messageText.ts), without the order's item number: "3ኪሎ በርበሬ". */
function itemText(line: { description: string; quantity: number; unit: string }) {
    return `${quantityCalc(line.quantity, line.unit)} ${line.description}`.trim()
}

/** The items split over {{2}} and {{3}}: the first half (rounded up) in one, the rest in the other ("-" if none). */
export function splitItems(items: string[]): [string, string] {
    const half = Math.ceil(items.length / 2)
    return [items.slice(0, half).join(" • "), items.slice(half).join(" • ") || EMPTY_VARIABLE]
}

/**
 * Sends one message with the invoice's general item lines that haven't been
 * sent for it yet. Does nothing (quietly) when Settings has no template or
 * number, or there's nothing new; never throws. `invoice.date` is the day
 * it's for (today's business day when missing).
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
        if (!template || !fitsGeneralItems(template)) {
            console.error(`General items: the template "${chosen.name}" (${chosen.language}) is missing or no longer fits — choose another in Settings`)
            return
        }
        if (template.status !== "APPROVED") {
            console.error(`General items: the template "${chosen.name}" can't be sent yet: WhatsApp's review status is ${template.status}`)
            return
        }

        // Claimed before sending, so a line is never sent twice (even by two requests at once).
        // Identical lines are told apart by how many came before them.
        const fresh: { description: string; quantity: number; unit: string }[] = []
        const seen = new Map<string, number>()
        for (const line of lines) {
            const description = String(line.description ?? "").replace(/###/g, "").trim() || String(line.name ?? "")
            const key = `${line.item_id}|${description}`
            const occurrence = (seen.get(key) ?? 0) + 1
            seen.set(key, occurrence)
            if (await redisClient.sAdd(SENT_KEY(invoiceId), `${key}|${occurrence}`)) {
                fresh.push({ description, quantity: Number(line.quantity) || 0, unit: String(line.unit ?? "") })
            }
        }
        await redisClient.expire(SENT_KEY(invoiceId), SENT_KEEP_SECONDS)
        if (fresh.length === 0) return

        const [first, second] = splitItems(fresh.map(itemText))
        const values = [String(invoice.invoice_number ?? ""), first, second, invoiceDayName(invoice.date || businessDayKey())]
        const summary = [`ልዩ ልዩ እቃዎች፦ ${values[0]}`, ...fresh.map(itemText), values[3]].join("\n")
        try {
            await sendWhatsAppTemplate(
                settings.recipient,
                chosen.name,
                [{ type: "body", parameters: values.map((text) => ({ type: "text" as const, text: variableText(text) })) }],
                chosen.language,
                summary,
            )
        } catch (error) {
            console.error(`General items: couldn't send the general items of ${invoice.invoice_number} on WhatsApp`, error)
        }
    } catch (error) {
        console.error("General items: failed to send the WhatsApp notice", error)
    }
}
