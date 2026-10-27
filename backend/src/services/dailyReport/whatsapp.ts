import { redisClient } from "../../config/redis.js"
import { uploadWhatsAppMedia } from "../whatsapp/client.js"
import { sendWhatsAppTemplate, type TemplateComponent } from "../whatsapp/messages.js"
import { describeSendError, getChatMessages, toWaId } from "../whatsapp/chatStore.js"
import { listTemplates, placeholdersIn, type MetaTemplate } from "../whatsapp/templates.js"
import { businessDayWindow, businessTimeParts } from "../../utils/businessDate.js"
import { createDailyReportPdfBuffer } from "../../pdf/dailyReport.js"
import { buildDailyReport, type DailyReportData } from "./report.js"
import { KEEP_DAYS_UNTOUCHED, markReportHandedOver } from "./store.js"

/**
 * Sending the daily report on WhatsApp: the template and up to
 * MAX_RECIPIENTS numbers are chosen in Settings; "Send" builds the PDF and
 * sends it as the template's document header, with the day's figures as its
 * body variables:
 *   {{1}} the business day's date, {{2}} sales, {{3}} payments collected,
 *   {{4}} invoices issued, {{5}} outstanding on the day's invoices.
 * A report counts as handed over (see markReportHandedOver) once WhatsApp
 * reports it delivered to a recipient — read from the chat history, where
 * the webhook Lambda records delivery statuses (see settleReportDeliveries).
 */

export const MAX_RECIPIENTS = 3
const SETTINGS_KEY = "settings:daily-report-whatsapp"
const PENDING_KEY = "daily-report:pending-deliveries"
/** Template statuses that can be chosen (a template under review can be picked ahead of approval). */
const CHOOSABLE_STATUSES = new Set(["APPROVED", "PENDING", "IN_APPEAL"])

export type DailyReportWhatsAppSettings = { template: { name: string; language: string } | null; recipients: string[] }
export type DailyReportTemplateOption = { id: string; name: string; language: string; status: string }

/** Whether a template has the daily report's shape: a document header and exactly the body variables {{1}}–{{5}}, nothing else to fill. */
export function fitsDailyReport(template: MetaTemplate): boolean {
    if (template.parameter_format === "NAMED") return false
    const header = template.components.find((c) => c.type === "HEADER")
    const body = template.components.find((c) => c.type === "BODY")
    const buttons = template.components.find((c) => c.type === "BUTTONS")
    if (header?.format !== "DOCUMENT") return false
    if (buttons?.buttons?.some((b) => placeholdersIn(b.url).length > 0)) return false
    const vars = placeholdersIn(body?.text).sort((a, b) => Number(a) - Number(b))
    return vars.length === 5 && vars.every((v, i) => v === String(i + 1))
}

export async function getDailyReportWhatsAppSettings(): Promise<DailyReportWhatsAppSettings> {
    const raw = await redisClient.get(SETTINGS_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<DailyReportWhatsAppSettings>) : {}
    return { template: saved.template ?? null, recipients: saved.recipients ?? [] }
}

/** Templates the daily report can be sent with: the right shape, approved or still under review. */
export async function dailyReportTemplateOptions(force = false): Promise<DailyReportTemplateOption[]> {
    return (await listTemplates(force))
        .filter((t) => CHOOSABLE_STATUSES.has(t.status) && fitsDailyReport(t))
        .map((t) => ({ id: t.id, name: t.name, language: t.language, status: t.status }))
}

/** Validates and saves the template and recipients (digits only, 8–15 of them, no repeats, at most MAX_RECIPIENTS). */
export async function saveDailyReportWhatsAppSettings(input: any): Promise<DailyReportWhatsAppSettings> {
    let template: DailyReportWhatsAppSettings["template"] = null
    if (input?.template) {
        const name = String(input.template.name ?? "")
        const language = String(input.template.language ?? "")
        const found = (await listTemplates(true)).find((t) => t.name === name && t.language === language)
        if (!found) throw new Error(`Template "${name}" (${language}) not found`)
        if (!fitsDailyReport(found)) throw new Error(`Template "${name}" doesn't fit the daily report: it needs a document header and exactly the variables {{1}}–{{5}}`)
        template = { name, language }
    }

    const raw: unknown[] = Array.isArray(input?.recipients) ? input.recipients : []
    const recipients: string[] = []
    for (const value of raw) {
        const phone = toWaId(String(value ?? ""))
        if (!phone) continue
        if (phone.length < 8 || phone.length > 15) throw new Error(`"${String(value)}" isn't a valid phone number`)
        if (!recipients.includes(phone)) recipients.push(phone)
    }
    if (recipients.length > MAX_RECIPIENTS) throw new Error(`Up to ${MAX_RECIPIENTS} numbers can receive the report`)

    const settings = { template, recipients }
    await redisClient.set(SETTINGS_KEY, JSON.stringify(settings))
    return settings
}

const DATE_WORDS = {
    am: {
        weekdays: ["እሁድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"],
        months: ["ጃንዋሪ", "ፌብሩዋሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን", "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"],
    },
    ar: {
        weekdays: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
        months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
    },
    en: {
        weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    },
}

/** The template's language for wording: Amharic templates are registered under "en" but named "am_…". */
function wordingLanguage(template: { name: string; language: string }): keyof typeof DATE_WORDS {
    if (template.name.startsWith("am_") || template.language === "am") return "am"
    if (template.language.startsWith("ar")) return "ar"
    return "en"
}

/** "ሰኞ 19 ኦክቶበር 2026" / "الاثنين 19 أكتوبر 2026" / "Monday 19 October 2026". */
function dayLabel(day: string, language: keyof typeof DATE_WORDS) {
    const start = businessTimeParts(businessDayWindow(day).start)
    const words = DATE_WORDS[language]
    return `${words.weekdays[start.weekday]} ${start.day} ${words.months[start.month]} ${start.year}`
}

const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The day's figures for the template body, in order {{2}}–{{5}}. */
function figures(report: DailyReportData) {
    return {
        sales: report.invoices.reduce((sum, invoice) => sum + invoice.total, 0),
        collected: report.payments.reduce((sum, payment) => sum + payment.amount, 0),
        issued: report.invoices.length,
        outstanding: report.invoices.reduce((sum, invoice) => sum + invoice.balance, 0),
    }
}

export type DailyReportSendResult = { phone: string; ok: boolean; error?: string }

type PendingDelivery = { messageId: string; phone: string; day: string; sentAt: number }

/**
 * Builds the business day's report and sends it to every configured
 * number. Refuses (throws) when nothing is configured or the template isn't
 * approved yet; otherwise reports each number's outcome.
 */
export async function sendDailyReportOnWhatsApp(accessToken: string, day: string): Promise<DailyReportSendResult[]> {
    const settings = await getDailyReportWhatsAppSettings()
    if (!settings.template) throw new Error("Choose the daily report's WhatsApp template in Settings first")
    if (settings.recipients.length === 0) throw new Error("Add at least one number to send the daily report to in Settings")

    const chosen = settings.template
    const template = (await listTemplates(true)).find((t) => t.name === chosen.name && t.language === chosen.language)
    if (!template) throw new Error(`The template "${chosen.name}" no longer exists — choose another in Settings`)
    if (template.status !== "APPROVED") {
        throw new Error(`The template "${chosen.name}" can't be sent yet: WhatsApp's review status is ${template.status}`)
    }

    const report = await buildDailyReport(accessToken, day)
    const pdf = await createDailyReportPdfBuffer(report)
    const filename = `daily-report-${day}.pdf`
    const mediaId = await uploadWhatsAppMedia(pdf, filename, "application/pdf")

    const language = wordingLanguage(chosen)
    const { sales, collected, issued, outstanding } = figures(report)
    const values = [dayLabel(day, language), money(sales), money(collected), String(issued), money(outstanding)]
    const components: TemplateComponent[] = [
        { type: "header", parameters: [{ type: "document", document: { id: mediaId, filename } }] },
        { type: "body", parameters: values.map((text) => ({ type: "text" as const, text })) },
    ]
    const summary = [
        `የዕለት የሥራ ሪፖርት፦ ${values[0]}`,
        `ሽያጭ፦ ${values[1]} SAR`,
        `የተለቀሙ ጥቅል ክፍያዎች፦ ${values[2]} SAR`,
        `የተሰሩ ደረሰኞች፦ ${values[3]}`,
        `በዕለቱ ደረሰኞች ላይ ያለ ቀሪ፦ ${values[4]} SAR`,
    ].join("\n")

    const results: DailyReportSendResult[] = []
    for (const phone of settings.recipients) {
        try {
            const sent = await sendWhatsAppTemplate(phone, chosen.name, components, chosen.language, summary)
            const messageId = sent?.messages?.[0]?.id
            if (messageId) {
                const pending: PendingDelivery = { messageId: String(messageId), phone, day, sentAt: Date.now() }
                await redisClient.rPush(PENDING_KEY, JSON.stringify(pending))
                await redisClient.expire(PENDING_KEY, KEEP_DAYS_UNTOUCHED * 24 * 60 * 60)
            }
            results.push({ phone, ok: true })
        } catch (error) {
            results.push({ phone, ok: false, error: describeSendError(error) })
        }
    }
    return results
}

/**
 * Checks the reports sent on WhatsApp that aren't yet known to have arrived:
 * once one is delivered (or read) to any number, that day counts as handed
 * over. Failed sends, and ones never confirmed within the keep period, are
 * dropped from the list. Delivery statuses come from the chat history (the
 * webhook Lambda writes them). Cheap: Redis only, no WhatsApp or Zoho calls.
 */
export async function settleReportDeliveries() {
    try {
        const raw = await redisClient.lRange(PENDING_KEY, 0, -1)
        if (raw.length === 0) return
        const keep: string[] = []
        const handedOver = new Set<string>()
        for (const entry of raw) {
            const pending = JSON.parse(entry) as PendingDelivery
            const message = (await getChatMessages(pending.phone)).find((m) => m.id === pending.messageId)
            const status = message?.status
            if (status === "delivered" || status === "read") handedOver.add(pending.day)
            else if (status === "failed") continue
            else if (Date.now() - pending.sentAt < KEEP_DAYS_UNTOUCHED * 24 * 60 * 60 * 1000) keep.push(entry)
        }
        for (const day of handedOver) await markReportHandedOver(day)
        const remaining = keep.filter((entry) => !handedOver.has((JSON.parse(entry) as PendingDelivery).day))
        await redisClient.del(PENDING_KEY)
        if (remaining.length) {
            await redisClient.rPush(PENDING_KEY, remaining)
            await redisClient.expire(PENDING_KEY, KEEP_DAYS_UNTOUCHED * 24 * 60 * 60)
        }
    } catch (error) {
        console.error("Daily report: failed to check WhatsApp deliveries", error)
    }
}
