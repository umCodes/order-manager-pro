import { readGroupOrderMessage, recordInteraction, removeAllMissing, removeThumb, setAllMissing, setThumb } from "../state/groupOrders.mjs";

const PREPARED = "👍";
const ALL_MISSING = "❤";

/**
 * 👍 on an order message in the group means it's prepared, and ❤️ that
 * everything on it is missing; taking either off takes that back. Comes as a message_reaction update — which Telegram
 * only sends when the webhook asks for it (allowed_updates) and the bot is
 * an admin of the group. Anyone in the group counts; bots (the bot's own 👌
 * on reports among them) and messages that aren't orders are ignored. An
 * anonymous admin reacts as the group itself (actor_chat). On a backup list,
 * any reaction at all also marks the list as seen to (recordInteraction).
 */
export async function handleReaction(update) {
    const reaction = update.message_reaction;
    if (!reaction || reaction.user?.is_bot) return;

    const order = await readGroupOrderMessage(reaction.message_id);
    if (!order || String(order.chat_id) !== String(reaction.chat?.id)) return;

    const reactor = reaction.user ?? reaction.actor_chat;
    if (!reactor) return;
    const reactorName = [reactor.first_name, reactor.last_name].filter(Boolean).join(" ") || reactor.title || reactor.username || "";

    // Any reaction on a backup list counts as having seen to it.
    if (order.kind === "backup_list" && (reaction.new_reaction ?? []).length > 0) {
        await recordInteraction(reaction.message_id, reactor.id, { name: reactorName, at: new Date(reaction.date * 1000).toISOString(), kind: "reaction" });
    }

    const hasEmoji = (list, emoji) => (list ?? []).some((entry) => entry.type === "emoji" && entry.emoji === emoji);
    const at = new Date(reaction.date * 1000).toISOString();

    // ❤️ on the order message: everything on it is missing (taken back with the ❤️).
    const heartBefore = hasEmoji(reaction.old_reaction, ALL_MISSING);
    const heartNow = hasEmoji(reaction.new_reaction, ALL_MISSING);
    if (heartNow && !heartBefore) {
        await setAllMissing(reaction.message_id, reactor.id, { name: reactorName, at });
        console.log(`Telegram group: ❤️ on ${order.order_number} (message ${reaction.message_id}) by ${reactorName}: all missing`);
    } else if (heartBefore && !heartNow) {
        await removeAllMissing(reaction.message_id, reactor.id);
        console.log(`Telegram group: ❤️ taken off ${order.order_number} (message ${reaction.message_id})`);
    }

    const before = hasEmoji(reaction.old_reaction, PREPARED);
    const now = hasEmoji(reaction.new_reaction, PREPARED);
    if (before === now) return;

    if (now) {
        const name = reactorName;
        await setThumb(reaction.message_id, reactor.id, { name, at });
        console.log(`Telegram group: 👍 on ${order.order_number} (message ${reaction.message_id}) by ${name}`);
    } else {
        await removeThumb(reaction.message_id, reactor.id);
        console.log(`Telegram group: 👍 taken off ${order.order_number} (message ${reaction.message_id})`);
    }
}
