import { readGroupOrderMessage, recordGroupReply } from "../state/groupOrders.mjs";

/**
 * Ties a message in the preparers' group to the order it answers. Only a
 * message sent with Telegram's Reply on an order message the app posted to
 * the group counts; plain messages, replies to anything else, the channel,
 * other chats and bots are ignored. The order message's record holds its
 * group's chat id, so a reply in any other chat never matches it.
 *
 * For now a recognised reply is only recorded (and logged), nothing is
 * answered in the chat: reading shortage reports from it comes next.
 */
export async function linkGroupReply(update) {
    const message = update.message;
    const repliedTo = message?.reply_to_message;
    if (!repliedTo || message.from?.is_bot) return;

    const order = await readGroupOrderMessage(repliedTo.message_id);
    if (!order || String(order.chat_id) !== String(message.chat?.id)) return;

    const reply = {
        received_at: new Date().toISOString(),
        chat_id: String(message.chat.id),
        message_id: message.message_id,
        reply_to_message_id: repliedTo.message_id,
        kind: order.kind,
        order_id: order.order_id,
        order_number: order.order_number,
        message_type: order.message_type,
        text: message.text ?? message.caption ?? "",
        from: {
            id: message.from?.id ?? null,
            name: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" "),
            username: message.from?.username ?? null,
        },
    };
    console.log(`Telegram group: message ${message.message_id} is a reply to ${order.order_number} (group message ${repliedTo.message_id})`);
    await recordGroupReply(reply);
}
