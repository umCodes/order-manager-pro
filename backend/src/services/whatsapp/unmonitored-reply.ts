import { ENV } from "../../constants/env.js"
import { replyToWhatsAppMessage } from "./messages.js"
import type { PreferredLanguage } from "../zoho/customers/index.js"

const UNMONITORED_NUMBER_MESSAGES: Record<PreferredLanguage, (supportNumber: string) => string> = {
    en: (supportNumber) => `This number is not currently monitored for messages. Please contact us at ${supportNumber}.`,
    am: (supportNumber) => `ይህ ቁጥር በአሁኑ ጊዜ መልእክቶችን አይከታተልም። እባክዎ በ${supportNumber} ያግኙን።`,
    ar: (supportNumber) => `هذا الرقم غير مراقب حاليًا للرسائل. يرجى التواصل معنا على ${supportNumber}.`,
}

/** Replies to an inbound message on the (unmonitored) webhook number, redirecting the sender to the support number, in their preferred language if known. */
export async function replyWithUnmonitoredNumberNotice(to: string, preferredLanguage: PreferredLanguage) {
    try {
        const supportNumber = ENV.WA_SUPPORT_NUMBER
        if (!supportNumber) throw new Error("WA_SUPPORT_NUMBER is not configured")

        const message = UNMONITORED_NUMBER_MESSAGES[preferredLanguage](supportNumber)
        return await replyToWhatsAppMessage(to, message)
    } catch (error) {
        console.error("Error sending unmonitored-number auto-reply:", error)
        throw error
    }
}
