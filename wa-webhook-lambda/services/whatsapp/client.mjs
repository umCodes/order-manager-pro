const WA_BASE_URL = () => `https://graph.facebook.com/v25.0/${process.env.WA_PHONE_NUMBER_ID || "1250845681454031"}`;

/** Calls the WhatsApp Cloud API, throwing the error body as-is on a non-2xx response. */
export async function WhatsAppApi(endPoint, method = "GET", body) {
    const response = await fetch(`${WA_BASE_URL()}/${endPoint}`, {
        method,
        headers: {
            Authorization: `Bearer ${process.env.WA_TOKEN}`,
            ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(body && { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw data;
    return data;
}

/** Sends a plain text message — only valid inside an open 24h customer service window. */
export async function replyToWhatsAppMessage(to, message) {
    try {
        return await WhatsAppApi("messages", "POST", {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: message },
        });
    } catch (error) {
        console.error("Error replying to WhatsApp message:", error);
        throw error;
    }
}

/** Downloads a media object by ID: first resolves its (short-lived, authenticated) URL, then fetches the bytes. */
export async function getWhatsAppMedia(mediaId) {
    const metaBase = `https://graph.facebook.com/v25.0/${mediaId}`;
    const metaResponse = await fetch(metaBase, {
        headers: { Authorization: `Bearer ${process.env.WA_TOKEN}` },
    });
    const meta = await metaResponse.json();
    if (!metaResponse.ok) throw meta;

    const fileResponse = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${process.env.WA_TOKEN}` },
    });
    if (!fileResponse.ok) throw new Error(`Failed to download WhatsApp media ${mediaId}: ${fileResponse.status}`);

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    return { buffer, mimeType: meta.mime_type };
}

/** Sends a WhatsApp contact card for `contactNumber` — tapping it opens a WhatsApp chat with that number. */
export async function sendContactCard(to, contactName, contactNumber) {
    try {
        return await WhatsAppApi("messages", "POST", {
            messaging_product: "whatsapp",
            to,
            type: "contacts",
            contacts: [
                {
                    name: { formatted_name: contactName, first_name: contactName },
                    phones: [{ phone: contactNumber, wa_id: contactNumber.replace(/[^\d]/g, ""), type: "WORK" }],
                },
            ],
        });
    } catch (error) {
        console.error("Error sending WhatsApp contact card:", error);
        throw error;
    }
}
