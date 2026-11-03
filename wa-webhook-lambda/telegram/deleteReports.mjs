import { botRepliesTo, forgetBotReplies, messageAnsweredBy, readReplyToOrder } from "../state/groupOrders.mjs";
import { call, cancelReport } from "./shortageReports.mjs";

/**
 * Deleting a report from the group. Telegram never tells bots a message was
 * deleted, so preparers ask the bot to do it instead (the warning tells
 * them how): a ❤️ on the report, or on the bot's warning on it, and the bot
 * deletes the report message with its own warnings on it, and cancels the
 * report. Order messages themselves are never deleted this way. Needs the
 * bot to be a group admin allowed to delete messages.
 */

const HEART = "❤";

/** The report a message belongs to: the message itself when it's a reply to an order, or the one a bot warning answered. */
async function reportFor(messageId) {
    if (await readReplyToOrder(messageId)) return messageId;
    const answered = await messageAnsweredBy(messageId);
    return answered && (await readReplyToOrder(answered)) ? answered : null;
}

/** Deletes a report message with the bot's warnings on it, and cancels the report. */
export async function deleteReportChain(chatId, reportId) {
    const tracked = await readReplyToOrder(reportId);
    if (!tracked || String(tracked.chat_id) !== String(chatId)) return;
    const warnings = await botRepliesTo(reportId);
    await call("deleteMessages", { chat_id: chatId, message_ids: [reportId, ...warnings] });
    await forgetBotReplies(reportId, warnings);
    await cancelReport(reportId);
    console.log(`Telegram group: report ${reportId} deleted on request (with ${warnings.length} warning(s))`);
}

/** A ❤️ newly put on a report, or on the bot's warning on it. */
export async function handleHeartReaction(update) {
    const reaction = update.message_reaction;
    if (!reaction || reaction.user?.is_bot) return;
    const has = (list) => (list ?? []).some((entry) => entry.type === "emoji" && entry.emoji === HEART);
    if (!has(reaction.new_reaction) || has(reaction.old_reaction)) return;
    const reportId = await reportFor(reaction.message_id);
    if (reportId) await deleteReportChain(reaction.chat.id, reportId);
}
