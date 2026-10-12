import { uploadWhatsAppMedia } from "./client.js"
import { sendWhatsAppTemplate } from "./messages.js"
import { resolveNotificationTemplate } from "./notificationTemplates.js"
import type { PreferredLanguage } from "../zoho/customers/index.js"

/** Wording for the in-app chat record of a notification — in the customer's language, the same one the template went out in. */
const SUMMARY_LABELS: Record<
    PreferredLanguage,
    {
        balanceTitle: string
        paymentTitle: string
        customer: string
        invoiceNumber: string
        invoiceAmount: string
        paidFromInvoice: string
        balanceBefore: string
        balanceAfter: string
        paymentAmount: string
        date: string
        remainingBalance: string
    }
> = {
    am: {
        balanceTitle: "የደረሰኝ ማሳወቂያ",
        paymentTitle: "የክፍያ ማረጋገጫ",
        customer: "ደንበኛ",
        invoiceNumber: "የደረሰኝ ቁጥር",
        invoiceAmount: "ጠቅላላ ድምር",
        paidFromInvoice: "የተከፈለ",
        balanceBefore: "የቀድሞ ቀሪ ሂሳብ",
        balanceAfter: "ጠቅላላ ቀሪ ሂሳብ",
        paymentAmount: "የተከፈለ መጠን",
        date: "ቀን",
        remainingBalance: "ቀሪ ሂሳብ",
    },
    ar: {
        balanceTitle: "إشعار فاتورة",
        paymentTitle: "تأكيد الدفع",
        customer: "العميل",
        invoiceNumber: "رقم الفاتورة",
        invoiceAmount: "مبلغ الفاتورة",
        paidFromInvoice: "المدفوع",
        balanceBefore: "الرصيد السابق",
        balanceAfter: "إجمالي الرصيد",
        paymentAmount: "المبلغ المدفوع",
        date: "التاريخ",
        remainingBalance: "الرصيد المتبقي",
    },
    en: {
        balanceTitle: "Invoice notice",
        paymentTitle: "Payment confirmation",
        customer: "Customer",
        invoiceNumber: "Invoice number",
        invoiceAmount: "Amount",
        paidFromInvoice: "Paid",
        balanceBefore: "Previous balance",
        balanceAfter: "Total balance",
        paymentAmount: "Amount paid",
        date: "Date",
        remainingBalance: "Remaining balance",
    },
}

/** A title line, then one "Label: value" line per field. */
function summaryList(title: string, rows: [label: string, value: string][]) {
    return [title, ...rows.map(([label, value]) => `${label}: ${value}`)].join("\n")
}

/** The payment confirmation as recorded in the in-app chat. */
export function paymentSummary(
    language: PreferredLanguage,
    customerName: string,
    paymentAmount: string,
    date: string,
    remainingBalance: string,
) {
    const labels = SUMMARY_LABELS[language]
    return summaryList(labels.paymentTitle, [
        [labels.customer, customerName],
        [labels.paymentAmount, paymentAmount],
        [labels.date, date],
        [labels.remainingBalance, remainingBalance],
    ])
}

/** The balance (invoice sent) notification as recorded in the in-app chat. */
export function balanceSummary(
    language: PreferredLanguage,
    customerName: string,
    invoiceNumber: string,
    invoiceAmount: string,
    paidAmountFromInvoice: string,
    balanceBeforeInvoice: string,
    balanceAfterInvoice: string,
) {
    const labels = SUMMARY_LABELS[language]
    return summaryList(labels.balanceTitle, [
        [labels.customer, customerName],
        [labels.invoiceNumber, invoiceNumber],
        [labels.invoiceAmount, invoiceAmount],
        [labels.paidFromInvoice, paidAmountFromInvoice],
        [labels.balanceBefore, balanceBeforeInvoice],
        [labels.balanceAfter, balanceAfterInvoice],
    ])
}

/**
 * "Payment Confirmation" template: sent when a payment is made.
 * Body params: {{1}} current payment amount, {{2}} date, {{3}} the customer's
 * total remaining balance across all their invoices.
 * Which template is used depends on the customer's preferred_language, as
 * chosen on the Settings page (see notificationTemplates.ts).
 */
export async function sendPaymentNotification(
    to: string,
    customerName: string,
    preferredLanguage: PreferredLanguage,
    paymentAmount: string,
    date: string,
    remainingBalance: string,
) {
    try {
        const template = await resolveNotificationTemplate("payment", preferredLanguage)
        console.log(
            `[WhatsApp] payment notification: language="${preferredLanguage}" -> template="${template?.name ?? "(none configured)"}", waLanguageCode="${template?.language}"`,
        )
        if (!template) throw new Error(`No payment notification template configured for language "${preferredLanguage}"`)

        return await sendWhatsAppTemplate(
            to,
            template.name,
            [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: paymentAmount },
                        { type: "text", text: date },
                        { type: "text", text: remainingBalance },
                    ],
                },
            ],
            template.language,
            paymentSummary(preferredLanguage, customerName, paymentAmount, date, remainingBalance),
        )
    } catch (error) {
        console.error("Error sending payment notification:", error)
        throw error
    }
}

/**
 * "Balance Notification" template: sent when an invoice is marked as sent.
 * Header: the invoice PDF. Body params: {{1}} invoice number, {{2}} invoice
 * amount, {{3}} amount paid from the invoice, {{4}} balance before this
 * invoice, {{5}} balance after this invoice.
 */
export async function sendBalanceNotification(
    to: string,
    customerName: string,
    preferredLanguage: PreferredLanguage,
    pdf: Buffer,
    pdfFilename: string,
    invoiceNumber: string,
    invoiceAmount: string,
    paidAmountFromInvoice: string,
    balanceBeforeInvoice: string,
    balanceAfterInvoice: string,
) {
    try {
        const template = await resolveNotificationTemplate("balance", preferredLanguage)
        console.log(
            `[WhatsApp] balance notification: language="${preferredLanguage}" -> template="${template?.name ?? "(none configured)"}", waLanguageCode="${template?.language}", pdfFilename="${pdfFilename}", pdfBytes=${pdf.length}`,
        )
        if (!template) throw new Error(`No balance notification template configured for language "${preferredLanguage}"`)

        const mediaId = await uploadWhatsAppMedia(pdf, pdfFilename, "application/pdf")
        console.log(`[WhatsApp] balance notification: uploaded PDF media id="${mediaId}"`)

        return await sendWhatsAppTemplate(
            to,
            template.name,
            [
                {
                    type: "header",
                    parameters: [
                        { type: "document", document: { id: mediaId, filename: pdfFilename } },
                    ],
                },
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: invoiceNumber },
                        { type: "text", text: invoiceAmount },
                        { type: "text", text: paidAmountFromInvoice },
                        { type: "text", text: balanceBeforeInvoice },
                        { type: "text", text: balanceAfterInvoice },
                    ],
                },
            ],
            template.language,
            balanceSummary(
                preferredLanguage,
                customerName,
                invoiceNumber,
                invoiceAmount,
                paidAmountFromInvoice,
                balanceBeforeInvoice,
                balanceAfterInvoice,
            ),
        )
    } catch (error) {
        console.error("Error sending balance notification:", error)
        throw error
    }
}
