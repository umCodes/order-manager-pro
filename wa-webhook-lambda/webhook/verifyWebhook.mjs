/**
 * Handles Meta's webhook verification handshake: echoes back `hub.challenge`
 * when `hub.verify_token` matches WA_VERIFY_TOKEN, otherwise rejects with 403.
 */
export function verifyWebhook(event) {
    const params = event.queryStringParameters ?? {};
    const mode = params["hub.mode"];
    const token = params["hub.verify_token"];
    const challenge = params["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WA_VERIFY_TOKEN) {
        return { statusCode: 200, body: challenge ?? "" };
    }
    return { statusCode: 403, body: "" };
}
