import { telegramApi } from "../services/telegram/client.mjs";

/**
 * For now (while the group features are built): every message the bot
 * receives in a group or a private chat is answered with what the webhook
 * saw — the chat's id (the value TELEGRAM_GROUP_CHATID takes), the message's
 * id, and the message it replied to, if any. Channel posts aren't answered
 * (an answer would be posted to the channel), nor are other bots' messages.
 */
export async function acknowledgeMessage(update) {
    const message = update.message;
    if (!message || message.from?.is_bot || message.chat?.type === "channel") return;

    const lines = [
        "✅ ደርሷል (received)",
        `chat: ${message.chat.id}${message.chat.title ? ` (${message.chat.title})` : ""}`,
        `message: ${message.message_id}`,
        ...(message.reply_to_message ? [`reply to: ${message.reply_to_message.message_id}`] : []),
    ];
    try {
        const response = await telegramApi("sendMessage", {
            chat_id: message.chat.id,
            text: lines.join("\n"),
            reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
        });
        if (!response.ok) console.error("Telegram: couldn't answer the message:", response.description);
    } catch (error) {
        console.error("Telegram: couldn't answer the message", error);
    }
}
