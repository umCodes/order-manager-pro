import { ENV } from "../../constants/env.js"
import { TelegramApi } from "./client.js"
import { recordTelegramMessage, updateTelegramMessageLogText, removeTelegramMessageFromLog } from "./log.js"
import { isMirrored, mirrorDelete, mirrorEdit, mirrorSend } from "./mirror.js"

// Everything done on the channel here is also done on its copy in the
// preparers' group, when one is set (see mirror.ts).

/** Posts a message to the channel and records it in the log. */
export async function TelegramSendMessage(text: string, chatId: string | number = String(ENV.TELEGRAM_CHATID)) {
    try {
        const response = await TelegramApi("sendMessage", "POST", {
            chat_id: chatId,
            text,
        })
        if (!response.ok) throw response
        await recordTelegramMessage({ message_id: response.result.message_id, chat_id: String(chatId), text })
        if (isMirrored(chatId)) await mirrorSend(text, response.result.message_id)
        return response.result;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

/** Posts a message as a reply to an existing one, and records it in the log. */
export async function TelegramReplyToMessage(text: string, replyToMessageId: number, chatId: string | number = String(ENV.TELEGRAM_CHATID)) {
    try {
        const response = await TelegramApi("sendMessage", "POST", {
            chat_id: chatId,
            text,
            reply_parameters: { message_id: replyToMessageId },
        })

        if (!response.ok) throw response
        await recordTelegramMessage({ message_id: response.result.message_id, chat_id: String(chatId), text })
        if (isMirrored(chatId)) await mirrorSend(text, response.result.message_id, replyToMessageId)
        return response.result;
    } catch (error) {
        console.error('Error replying to message:', error);
        throw error;
    }
}

/** Rewrites an already-posted message in place, updating its log entry. */
export async function TelegramEditMessage(text: string, messageId: number, chatId: string | number = String(ENV.TELEGRAM_CHATID)) {
    try {
        const response = await TelegramApi("editMessageText", "POST", {
            chat_id: chatId,
            message_id: messageId,
            text,
        })
        if (!response.ok) throw response
        await updateTelegramMessageLogText(messageId, text)
        if (isMirrored(chatId)) await mirrorEdit(text, messageId)
        return response.result;
    } catch (error) {
        console.error('Error editing message:', error);
        throw error;
    }
}

/**
 * Deletes a message from the channel and drops it from the log. The log entry
 * goes whether or not Telegram agrees (bots can't delete messages older than
 * 48 hours, or ones already removed by hand) — so this never throws; it
 * reports whether the channel copy is gone, and why not when it isn't.
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

    await removeTelegramMessageFromLog(messageId)
    if (isMirrored(chatId)) await mirrorDelete(messageId)
    return result;
}
