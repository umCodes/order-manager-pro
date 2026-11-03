import { botRepliesTo, forgetBotReplies, messageAnsweredBy, readReplyToOrder } from "../state/groupOrders.mjs";
import { call, cancelReport } from "./shortageReports.mjs";

/**
 * Deleting a report from the group. Telegram never tells bots a message was
 * deleted, so preparers ask the bot to do it instead (the warning tells them
 * how), and the bot deletes the report message, its own warnings on it, and
 * the message that asked — and cancels the report:
 *   - edit the report (or a wrong report) to just "." or "።"
 *   - reply "." or "።" to the report, or to the bot's warning on it
 *   - react ❤️ to the report, or to the bot's warning on it
 * Order messages themselves are never deleted this way. Needs the bot to be
 * a group admin allowed to delete messages.
 */

const DELETE_MARK = /^\s*[.።]\s*$/;
const HEART = "❤";

export const isDeleteMark = (text) => DELETE_MARK.test(String(text ?? ""));

/** The report a message belongs to: the message itself when it's a reply to an order, or the one a bot warning answered. */
async function reportFor(messageId) {
    if (await readReplyToOrder(messageId)) return messageId;
    const answered = await messageAnsweredBy(messageId);
    return answered && (await readReplyToOrder(answered)) ? answered : null;
}

/** Deletes a report message with the bot's warnings on it (and `alsoDelete`), and cancels the report. */
export async function deleteReportChain(chatId, reportId, alsoDelete = []) {
    const tracked = await readReplyToOrder(reportId);
    if (!tracked || String(tracked.chat_id) !== String(chatId)) return;
    const warnings = await botRepliesTo(reportId);
    await call("deleteMessages", { chat_id: chatId, message_ids: [reportId, ...warnings, ...alsoDelete] });
    await forgetBotReplies(reportId, warnings);
    await cancelReport(reportId);
    console.log(`Telegram group: report ${reportId} deleted on request (with ${warnings.length} warning(s))`);
}

/** A "." / "።" reply (new or edited) to a report, or to the bot's warning on it. Replies to order messages are handled by groupReplies.mjs. */
export async function handleDeleteReply(update) {
    const message = update.message ?? update.edited_message;
    const repliedTo = message?.reply_to_message;
    if (!repliedTo || message.from?.is_bot || !isDeleteMark(message.text ?? message.caption)) return;
    const reportId = await reportFor(repliedTo.message_id);
    if (reportId) await deleteReportChain(message.chat.id, reportId, [message.message_id]);
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
