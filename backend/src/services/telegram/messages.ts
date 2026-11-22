import { ENV } from "../../constants/env.js"
import { TelegramApi } from "./client.js"
import { recordTelegramMessage, updateTelegramMessageLogText, removeTelegramMessageFromLog } from "./log.js"
import { editGroupMessage, forgetGroupMessage, isGroupChat, isMirrored, mirrorDelete, mirrorEdit, mirrorSend, rememberGroupText } from "./mirror.js"

// Everything done on the channel here is also done on its copy in the
// preparers' group, when one is set (see mirror.ts) — unless a send says
// `mirror: false` (Settings turned the group off for that message, see
// destinations.ts). A message can also be posted to the group directly
// (the channel turned off): then it is its own group message. A sent
// message comes back with `group_message_id`: the id of its group copy, its
// own id when it was posted to the group, or null when the group has none.

type SendOptions = { mirror?: boolean }

const shouldMirror = (chatId: string | number, options?: SendOptions) => (options?.mirror ?? true) && isMirrored(chatId)

/** What a message posted to `chatId` is in the group: its copy's id, itself, or nothing. */
async function groupMessageIdFor(chatId: string | number, messageId: number, text: string, options: SendOptions | undefined, copy: () => Promise<number | null>) {
    if (isGroupChat(chatId)) {
        await rememberGroupText(messageId, text)
        return messageId
    }
    return shouldMirror(chatId, options) ? copy() : null
}

/** Posts a message to the channel (or `chatId`) and records it in the log. */
export async function TelegramSendMessage(text: string, chatId: string | number = String(ENV.TELEGRAM_CHATID), options?: SendOptions) {
    try {
        const response = await TelegramApi("sendMessage", "POST", {
            chat_id: chatId,
            text,
        })
        if (!response.ok) throw response
        const messageId = Number(response.result.message_id)
        await recordTelegramMessage({ message_id: messageId, chat_id: String(chatId), text })
        const group_message_id = await groupMessageIdFor(chatId, messageId, text, options, () => mirrorSend(text, messageId))
        return { ...response.result, group_message_id };
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

/** Posts a message as a reply to an existing one, and records it in the log. */
export async function TelegramReplyToMessage(text: string, replyToMessageId: number, chatId: string | number = String(ENV.TELEGRAM_CHATID), options?: SendOptions) {
    try {
        const response = await TelegramApi("sendMessage", "POST", {
            chat_id: chatId,
            text,
            reply_parameters: { message_id: replyToMessageId },
        })

        if (!response.ok) throw response
        const messageId = Number(response.result.message_id)
        await recordTelegramMessage({ message_id: messageId, chat_id: String(chatId), text })
        const group_message_id = await groupMessageIdFor(chatId, messageId, text, options, () => mirrorSend(text, messageId, replyToMessageId))
        return { ...response.result, group_message_id };
    } catch (error) {
        console.error('Error replying to message:', error);
        throw error;
    }
}

/** Rewrites an already-posted message in place, updating its log entry. */
export async function TelegramEditMessage(text: string, messageId: number, chatId: string | number = String(ENV.TELEGRAM_CHATID)) {
    try {
        if (isGroupChat(chatId)) {
            // Posted to the group directly: edited like a group copy.
            const result = await editGroupMessage(text, messageId)
            await updateTelegramMessageLogText(messageId, text, chatId)
            return result
        }
        const response = await TelegramApi("editMessageText", "POST", {
            chat_id: chatId,
            message_id: messageId,
            text,
        })
        if (!response.ok) throw response
        await updateTelegramMessageLogText(messageId, text, chatId)
        if (isMirrored(chatId)) await mirrorEdit(text, messageId)
        return response.result;
    } catch (error) {
        console.error('Error editing message:', error);
        throw error;
    }
}

/**
 * Deletes a message from the channel (or `chatId`) and drops it from the
 * log. The log entry goes whether or not Telegram agrees (bots can't delete
 * messages older than 48 hours, or ones already removed by hand) — so this
 * never throws; it reports whether the message is gone, and why not when
 * it isn't. Its group copy goes too.
 */
export async function TelegramDeleteMessage(
    messageId: number,
    chatId: string | number = String(ENV.TELEGRAM_CHATID),
): Promise<{ deletedFromTelegram: boolean; error?: string }> {
    let result: { deletedFromTelegram: boolean; error?: string };
    try {
        const response = await TelegramApi("deleteMessage", "POST", {
            chat_id: chatId,
            message_id: messageId,
        })
        result = response.ok
            ? { deletedFromTelegram: true }
            : { deletedFromTelegram: false, error: response.description ?? "Telegram refused the delete" }
    } catch (error) {
        result = { deletedFromTelegram: false, error: error instanceof Error ? error.message : "Couldn't reach Telegram" }
    }
    if (!result.deletedFromTelegram) console.error(`Error deleting message ${messageId} from Telegram:`, result.error);

    await removeTelegramMessageFromLog(messageId, chatId)
    if (isGroupChat(chatId)) await forgetGroupMessage(messageId)
    else if (isMirrored(chatId)) await mirrorDelete(messageId)
    return result;
}
