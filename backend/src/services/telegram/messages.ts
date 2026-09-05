import { ENV } from "../../constants/env.js"
import { TelegramApi } from "./client.js"
import { recordTelegramMessage, updateTelegramMessageLogText, removeTelegramMessageFromLog } from "./log.js"

export async function TelegramSendMessage(text: string, chatId: string | number = String(ENV.TELEGRAM_CHATID)) {
    try {
        const response = await TelegramApi("sendMessage", "POST", {
            chat_id: chatId,
            text,
        })
        if (!response.ok) throw response
        await recordTelegramMessage({ message_id: response.result.message_id, chat_id: String(chatId), text })
        return response.result;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

export async function TelegramReplyToMessage(text: string, replyToMessageId: number, chatId: string | number = String(ENV.TELEGRAM_CHATID)) {
    try {
        const response = await TelegramApi("sendMessage", "POST", {
            chat_id: chatId,
            text,
            reply_parameters: { message_id: replyToMessageId },
        })

        if (!response.ok) throw response
        await recordTelegramMessage({ message_id: response.result.message_id, chat_id: String(chatId), text })
        return response.result;
    } catch (error) {
        console.error('Error replying to message:', error);
        throw error;
    }
}

export async function TelegramEditMessage(text: string, messageId: number, chatId: string | number = String(ENV.TELEGRAM_CHATID)) {
    try {
        const response = await TelegramApi("editMessageText", "POST", {
            chat_id: chatId,
            message_id: messageId,
            text,
        })
        if (!response.ok) throw response
        await updateTelegramMessageLogText(messageId, text)
        return response.result;
    } catch (error) {
        console.error('Error editing message:', error);
        throw error;
    }
}

export async function TelegramDeleteMessage(messageId: number, chatId: string | number = String(ENV.TELEGRAM_CHATID)) {
    try {
        const response = await TelegramApi("deleteMessage", "POST", {
            chat_id: chatId,
            message_id: messageId,
        })
        if (!response.ok) throw response
        await removeTelegramMessageFromLog(messageId)
        return response.result;
    } catch (error) {
        console.error('Error deleting message:', error);
        throw error;
    }
}