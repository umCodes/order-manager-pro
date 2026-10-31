import { readGroupOrderMessage, removeThumb, setThumb } from "../state/groupOrders.mjs";

const PREPARED = "👍";

/**
 * 👍 on an order message in the group means it's prepared; taking the 👍
 * off takes that back. Comes as a message_reaction update — which Telegram
 * only sends when the webhook asks for it (allowed_updates) and the bot is
 * an admin of the group. Anyone in the group counts; bots (the bot's own 👌
 * on reports among them) and messages that aren't orders are ignored. An
 * anonymous admin reacts as the group itself (actor_chat).
 */
export async function handleReaction(update) {
    const reaction = update.message_reaction;
    if (!reaction || reaction.user?.is_bot) return;

    const order = await readGroupOrderMessage(reaction.message_id);
    if (!order || String(order.chat_id) !== String(reaction.chat?.id)) return;

    const reactor = reaction.user ?? reaction.actor_chat;
    if (!reactor) return;
    const has = (list) => (list ?? []).some((entry) => entry.type === "emoji" && entry.emoji === PREPARED);
    const before = has(reaction.old_reaction);
    const now = has(reaction.new_reaction);
    if (before === now) return;

    if (now) {
        const name = [reactor.first_name, reactor.last_name].filter(Boolean).join(" ") || reactor.title || reactor.username || "";
        await setThumb(reaction.message_id, reactor.id, { name, at: new Date(reaction.date * 1000).toISOString() });
        console.log(`Telegram group: 👍 on ${order.order_number} (message ${reaction.message_id}) by ${name}`);
    } else {
        await removeThumb(reaction.message_id, reactor.id);
        console.log(`Telegram group: 👍 taken off ${order.order_number} (message ${reaction.message_id})`);
    }
}
