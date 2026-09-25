import { verifyWebhook } from "./webhook/verifyWebhook.mjs";
import { handleIncomingMessages } from "./webhook/handleIncomingMessages.mjs";

export const handler = async (event) => {
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
