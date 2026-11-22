import { ENV, TELEGRAM_GROUP_CHATID } from "../../constants/env.js"
import { redisClient } from "../../config/redis.js"
import { TelegramApi } from "./client.js"
import { forgetGroupOrderMessage } from "./groupOrders.js"

/**
 * Copies of channel messages in the preparers' group (TELEGRAM_GROUP_CHATID),
 * kept while the group features are built so the channel's workflow carries
 * on untouched. Message ids differ per chat, so each copy is mapped both
 * ways in Redis for as long as an invoice's thread is kept:
 *   telegram:mirror:<channel message id> → group message id
 *   telegram:mirror:group:<group message id> → channel message id
 * Best-effort: a failed copy is logged and never fails the channel action.
 */

const KEEP_SECONDS = 30 * 24 * 60 * 60
const toGroupKey = (channelMessageId: number) => `telegram:mirror:${channelMessageId}`
const toChannelKey = (groupMessageId: number) => `telegram:mirror:group:${groupMessageId}`
/** The plain text a group copy was last posted or edited with (before any loading marks), so the marks can be redrawn on it. */
const groupTextKey = (groupMessageId: number) => `telegram:mirror:group-text:${groupMessageId}`

async function rememberGroupText(groupMessageId: number, text: string) {
    await redisClient.set(groupTextKey(groupMessageId), text, { EX: KEEP_SECONDS })
}

/**
 * A group copy's plain text: as the app last posted or edited it, or — for
 * copies made before that was kept — its channel original's text in the log.
 */
export async function groupCopyText(groupMessageId: number): Promise<string | null> {
    const stored = await redisClient.get(groupTextKey(groupMessageId))
    if (stored) return stored
    const channelId = await channelMessageIdForGroupMessage(groupMessageId)
    if (!channelId) return null
    const { listTelegramMessages } = await import("./log.js")
    return (await listTelegramMessages()).find((entry) => entry.message_id === channelId)?.text ?? null
}

/** Whether an action on `chatId` should be copied: it's the channel, and a group is set. */
export function isMirrored(chatId: string | number) {
    return !!TELEGRAM_GROUP_CHATID && String(chatId) === String(ENV.TELEGRAM_CHATID)
}

async function groupMessageId(channelMessageId: number): Promise<number | null> {
    const id = await redisClient.get(toGroupKey(channelMessageId))
    return id ? Number(id) : null
}

/** The channel message a group message is a copy of, if it is one. */
export async function channelMessageIdForGroupMessage(groupMessageId: number): Promise<number | null> {
    const id = await redisClient.get(toChannelKey(groupMessageId))
    return id ? Number(id) : null
}

/**
 * Posts the copy of a channel message — as a reply to the copy of its parent,
 * when there's one. Returns the copy's message id, or null when it failed.
 */
export async function mirrorSend(text: string, channelMessageId: number, replyToChannelMessageId?: number): Promise<number | null> {
    try {
        const replyTo = replyToChannelMessageId ? await groupMessageId(replyToChannelMessageId) : null
        const response = await TelegramApi("sendMessage", "POST", {
            chat_id: TELEGRAM_GROUP_CHATID,
            text,
            ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
        })
        if (!response.ok) throw response
        const copyId = Number(response.result.message_id)
        await redisClient.set(toGroupKey(channelMessageId), String(copyId), { EX: KEEP_SECONDS })
        await redisClient.set(toChannelKey(copyId), String(channelMessageId), { EX: KEEP_SECONDS })
        await rememberGroupText(copyId, text)
        return copyId
    } catch (error) {
        console.error(`Telegram group copy: couldn't post the copy of message ${channelMessageId}:`, error)
        return null
    }
}

/**
 * Edits the copy of a channel message the same way, if it has one — keeping
 * its loading marks (🚚, see loading.ts) when its order was marked loaded.
 */
export async function mirrorEdit(text: string, channelMessageId: number) {
    try {
        const copyId = await groupMessageId(channelMessageId)
        if (!copyId) return
        await rememberGroupText(copyId, text)
        const { loadingMarksFor } = await import("./loading.js")
        const marked = await loadingMarksFor(copyId, text)
        const response = await TelegramApi("editMessageText", "POST", {
            chat_id: TELEGRAM_GROUP_CHATID,
            message_id: copyId,
            text: marked.text,
            ...(marked.entities.length ? { entities: marked.entities } : {}),
        })
        if (!response.ok) throw response
    } catch (error) {
        console.error(`Telegram group copy: couldn't edit the copy of message ${channelMessageId}:`, error)
    }
}

/** Deletes the copy of a channel message, if it has one, and forgets it. */
export async function mirrorDelete(channelMessageId: number) {
    try {
        const copyId = await groupMessageId(channelMessageId)
        if (!copyId) return
        const response = await TelegramApi("deleteMessage", "POST", { chat_id: TELEGRAM_GROUP_CHATID, message_id: copyId })
        if (!response.ok) console.error(`Telegram group copy: couldn't delete the copy of message ${channelMessageId}:`, response.description)
        await redisClient.del([toGroupKey(channelMessageId), toChannelKey(copyId), groupTextKey(copyId)])
        await forgetGroupOrderMessage(copyId)
    } catch (error) {
        console.error(`Telegram group copy: couldn't delete the copy of message ${channelMessageId}:`, error)
    }
}
