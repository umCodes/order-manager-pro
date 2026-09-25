import { parseWebhookBody, extractMessages, extractStatuses } from "./parseWebhookBody.mjs";
import { detectLanguage } from "../language/detectLanguage.mjs";
import { getContactNotice } from "../messages/contactNotice.mjs";
import { markNotifiedIfFirstTime } from "../state/notifiedStore.mjs";
import { appendChatMessage, applyChatStatus, applyChatReaction } from "../state/chatStore.mjs";
import { replyToWhatsAppMessage, sendContactCard } from "../services/whatsapp/client.mjs";
import { notifyByEmail } from "./notifyByEmail.mjs";

function messageText(message) {
    return message?.text?.body ?? "";
}

async function notifyOnce(message) {
    const language = detectLanguage(messageText(message));
    console.log(`Detected language "${language}" for message ${message.id}`);

    const isFirstTime = await markNotifiedIfFirstTime(message.from, language);
    if (!isFirstTime) {
        console.log(`Already notified ${message.from} in "${language}" within the last 24h, skipping`);
        return;
    }

    const supportNumber = process.env.WA_SUPPORT_NUMBER;
    await replyToWhatsAppMessage(message.from, getContactNotice(language));
    await sendContactCard(message.from, "Umer", supportNumber);
}

/** Parses an inbound webhook POST body: emails a notification for every message, and sends the once-per-language contact notice to each sender. */
export async function handleIncomingMessages(event) {
    let body;
    try {
        body = parseWebhookBody(event);
    } catch (error) {
        console.error("Error parsing webhook body:", error);
        return;
    }

    const messages = extractMessages(body);
    const statuses = extractStatuses(body);
    console.log(`Found ${messages.length} message(s), ${statuses.length} status update(s)`);

    for (const message of messages) {
        if (message?.type === "reaction") {
            try {
                await applyChatReaction(message.from, message.reaction?.message_id, message.reaction?.emoji);
            } catch (error) {
                console.error(`Error applying reaction for message ${message?.id}:`, JSON.stringify(error));
            }
            continue;
        }

        try {
            await notifyByEmail(message);
        } catch (error) {
            console.error(`Error emailing notification for message ${message?.id}:`, JSON.stringify(error));
        }

        try {
            await notifyOnce(message);
        } catch (error) {
            console.error(`Error handling message ${message?.id}:`, JSON.stringify(error));
        }

        try {
            const timestamp = message.timestamp ? Number(message.timestamp) * 1000 : Date.now();
            await appendChatMessage(message.from, { ...message, direction: "in", timestamp });
        } catch (error) {
            console.error(`Error persisting chat message ${message?.id}:`, JSON.stringify(error));
        }
    }

    for (const status of statuses) {
        try {
            await applyChatStatus(status.recipient_id, status.id, status.status);
        } catch (error) {
            console.error(`Error applying status update for message ${status?.id}:`, JSON.stringify(error));
        }
    }
}
