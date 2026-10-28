import { parseWebhookBody } from "../webhook/parseWebhookBody.mjs";
import { claimUpdate, recordUpdate } from "../state/telegramUpdates.mjs";
import { linkGroupReply } from "./groupReplies.mjs";

const ok = { statusCode: 200, body: JSON.stringify({ ok: true }) };

/** Telegram's own name for what an update carries: "message", "channel_post", "message_reaction", … */
function updateKind(update) {
    return Object.keys(update).find((key) => key !== "update_id") ?? "unknown";
}

/**
 * POST /telegram — the Telegram bot's webhook (set with setWebhook and a
 * secret_token). Only requests carrying that secret in the
 * X-Telegram-Bot-Api-Secret-Token header are accepted (TELEGRAM_WEBHOOK_SECRET;
 * unset refuses everything). Each update is recorded once; Telegram's
 * repeats are answered 200 and ignored. Always answers 200 once the secret
 * checks out, so a bad update is never retried forever. Replies to order
 * messages in the preparers' group are tied to their order (groupReplies.mjs);
 * nothing is answered in the chat.
 */
export async function handleTelegramUpdate(event) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    const given = event?.headers?.["x-telegram-bot-api-secret-token"];
    if (!expected || given !== expected) {
        console.warn("Telegram webhook: missing or wrong secret token, refused");
        return { statusCode: 401, body: JSON.stringify({ ok: false }) };
    }

    let update;
    try {
        update = parseWebhookBody(event);
    } catch (error) {
        console.error("Telegram webhook: couldn't parse the body", error);
        return ok;
    }
    if (typeof update?.update_id !== "number") {
        console.warn("Telegram webhook: no update_id, ignored");
        return ok;
    }

    try {
        if (!(await claimUpdate(update.update_id))) {
            console.log(`Telegram update ${update.update_id} already handled, skipping`);
            return ok;
        }
        console.log(`Telegram update ${update.update_id} (${updateKind(update)}):`, JSON.stringify(update));
        await recordUpdate(update);
        await linkGroupReply(update);
    } catch (error) {
        console.error(`Telegram webhook: failed to record update ${update.update_id}`, error);
    }
    return ok;
}
