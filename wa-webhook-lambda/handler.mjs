import { verifyWebhook } from "./webhook/verifyWebhook.mjs";
import { handleIncomingMessages } from "./webhook/handleIncomingMessages.mjs";
import { handleTelegramUpdate } from "./telegram/handleTelegramUpdate.mjs";

/**
 * One Function URL for both webhooks: /telegram is the Telegram bot's
 * (see telegram/handleTelegramUpdate.mjs); every other path is WhatsApp's,
 * as before — GET for Meta's verification, POST for messages and statuses.
 */
export const handler = async (event) => {
    // Handled before the event is logged: its headers carry the webhook secret.
    if (event?.rawPath === "/telegram") {
        return handleTelegramUpdate(event);
    }

    console.log("Received event:", JSON.stringify(event, null, 2));

    const method = event?.requestContext?.http?.method ?? "GET";

    if (method === "GET") {
        return verifyWebhook(event);
    }

    if (method === "POST") {
        await handleIncomingMessages(event);
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
