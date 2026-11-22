import { redisClient } from "../../../config/redis.js"
import { BUSINESS_UTC_OFFSET_HOURS, todayInBusinessTimezone } from "../../../utils/businessDate.js"
import { excludeInternalLineItems } from "../../../utils/internalLineItems.js"
import { zohoAuthHeader } from "../../zoho/auth.js"
import { ZohoGetInvoiceById } from "../../zoho/invoices/index.js"
import { sortLineItemsByCategory } from "../../lineItemOrder.js"
import { sendInvoiceTelegramMessage } from "./notifications.js"
import { notifyGeneralItems } from "../../generalItemsWhatsApp.js"
import {
    claimHeldInvoice,
    dueAt,
    dueHeldInvoiceIds,
    forgetHeldInvoiceInfo,
    getTelegramScheduleSetting,
    heldInvoice,
    holdInvoiceMessage,
    isLaterDay,
    unclaimHeldInvoice,
} from "./schedule.js"

/**
 * Posts held invoices (see schedule.ts) when their time comes. Runs twice a
 * day, at the send time and again BACKUP_RUN_MINUTES later for anything the
 * first run couldn't post, plus once whenever the server starts, so nothing
 * due is lost to a restart. No polling in between.
 *
 * A run lock keeps two servers (old and new, side by side during a deploy)
 * from running at once, and each invoice is claimed before it's posted, so
 * none goes out twice; one already posted is simply no longer held.
 */

const BACKUP_RUN_MINUTES = 30
const RUN_LOCK_KEY = "telegram:held-invoices:run-lock"
const RUN_LOCK_SECONDS = 10 * 60

let timer: ReturnType<typeof setTimeout> | null = null

/** Posts every held invoice that's due. Never throws. */
export async function sendDueHeldInvoices(trigger: string) {
    try {
        if (!(await redisClient.set(RUN_LOCK_KEY, trigger, { NX: true, EX: RUN_LOCK_SECONDS }))) {
            console.log(`Telegram scheduled sends (${trigger}): another run is in progress, skipping`)
            return
        }
        try {
            const due = await dueHeldInvoiceIds()
            console.log(`Telegram scheduled sends (${trigger}): ${due.length} due`)
            if (due.length === 0) return
            const headers = await zohoAuthHeader()
            for (const invoiceId of due) await postHeldInvoice(headers, invoiceId)
        } finally {
            await redisClient.del(RUN_LOCK_KEY)
        }
    } catch (error) {
        console.error(`Telegram scheduled sends (${trigger}) failed:`, error)
    }
}

async function postHeldInvoice(headers: string, invoiceId: string) {
    const held = await heldInvoice(invoiceId)
    if (!(await claimHeldInvoice(invoiceId))) return
    try {
        const invoice = await ZohoGetInvoiceById(headers, invoiceId)
        if (!invoice || invoice.status !== "draft") {
            console.log(`Telegram: held invoice ${invoiceId} is ${invoice?.status ?? "gone"} in Zoho, not posting it`)
            await forgetHeldInvoiceInfo(invoiceId)
            return
        }
        // Moved to a later day in Zoho itself: wait for that day instead.
        if (isLaterDay(invoice.date)) {
            await holdInvoiceMessage(invoice)
            return
        }
        const lineItems = excludeInternalLineItems(await sortLineItemsByCategory(headers, invoice.line_items))
        const message = await sendInvoiceTelegramMessage(invoice, lineItems)
        await redisClient.set(invoiceId, String(message.message_id))
        await forgetHeldInvoiceInfo(invoiceId)
        // Its general items wait for the same moment (see generalItemsWhatsApp.ts).
        void notifyGeneralItems(invoice)
        console.log(`Telegram: posted held invoice ${invoice.invoice_number ?? invoiceId}`)
    } catch (error) {
        console.error(`Telegram: couldn't post held invoice ${invoiceId}, the next run will try again:`, error)
        await unclaimHeldInvoice(invoiceId, held?.due_at ?? Date.now())
    }
}

/** The next main or backup run after `now`, for send time `sendTime` ("HH:MM", business time). */
export function nextRunAt(sendTime: string, now = Date.now()): number {
    const today = todayInBusinessTimezone()
    const [year = 0, month = 1, day = 1] = today.split("-").map(Number)
    const runs: number[] = []
    for (const offset of [-1, 0, 1]) {
        const date = new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10)
        const main = dueAt(date, sendTime)
        runs.push(main, main + BACKUP_RUN_MINUTES * 60 * 1000)
    }
    return Math.min(...runs.filter((at) => at > now))
}

/** Sets the timer for the next main or backup run (call again when the send time changes). */
export async function planNextScheduledSend() {
    if (timer) clearTimeout(timer)
    const { sendTime } = await getTelegramScheduleSetting()
    const at = nextRunAt(sendTime)
    const shifted = new Date(at + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ")
    console.log(`Telegram scheduled sends: next run at ${shifted} business time`)
    timer = setTimeout(async () => {
        await sendDueHeldInvoices("scheduled")
        await planNextScheduledSend()
    }, Math.max(1000, at - Date.now()))
}

/** On server start: posts anything that came due while the server was down, then plans the next run. */
export async function startScheduledSends() {
    await sendDueHeldInvoices("server start")
    await planNextScheduledSend()
}
