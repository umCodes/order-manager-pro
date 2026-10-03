import { parseWebhookBody, extractMessages, extractStatuses, extractSenderNames } from "./parseWebhookBody.mjs";
import { detectLanguage } from "../language/detectLanguage.mjs";
import { getContactNotice } from "../messages/contactNotice.mjs";
import { markNotifiedIfFirstTime } from "../state/notifiedStore.mjs";
import { appendChatMessage, applyChatStatus, applyChatReaction } from "../state/chatStore.mjs";
import { replyToWhatsAppMessage, sendContactCard } from "../services/whatsapp/client.mjs";
import { notifyByEmail } from "./notifyByEmail.mjs";
import { notifyByPush } from "./notifyByPush.mjs";
import { findCustomerByPhone } from "../services/zoho/customers.mjs";

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

/** The sender's Zoho customer match, or undefined (no match, or Zoho unavailable — notifications still go out). */
async function lookUpCustomer(phone) {
    try {
        return await findCustomerByPhone(phone);
    } catch (error) {
        console.error(`Error looking up Zoho contact for ${phone}:`, JSON.stringify(error));
        return undefined;
    }
}

/**
 * Parses an inbound webhook POST body: push-notifies subscribed devices and
 * emails a notification for every message, and sends the once-per-language
 * contact notice to each sender.
 */
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
    const senderNames = extractSenderNames(body);
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

        // Stored first, so the chat already has the message when a notification is tapped.
        try {
            const timestamp = message.timestamp ? Number(message.timestamp) * 1000 : Date.now();
            await appendChatMessage(message.from, { ...message, direction: "in", timestamp });
        } catch (error) {
            console.error(`Error persisting chat message ${message?.id}:`, JSON.stringify(error));
        }

        const customerMatch = await lookUpCustomer(message.from);

        // Same name the app's chat list shows (the Zoho customer), else the sender's WhatsApp profile name.
        const senderName = customerMatch?.contact?.contact_name || senderNames.get(message.from);
        try {
            await notifyByPush(message, senderName);
        } catch (error) {
            console.error(`Error sending push notification for message ${message?.id}:`, JSON.stringify(error));
        }

        try {
            await notifyByEmail(message, customerMatch);
        } catch (error) {
            console.error(`Error emailing notification for message ${message?.id}:`, JSON.stringify(error));
        }

        try {
            await notifyOnce(message);
        } catch (error) {
            console.error(`Error handling message ${message?.id}:`, JSON.stringify(error));
        }
    }

    for (const status of statuses) {
        try {
            const error = status.errors?.[0];
            const reason = error?.error_data?.details || error?.message || error?.title;
            await applyChatStatus(status.recipient_id, status.id, status.status, reason);
        } catch (error) {
            console.error(`Error applying status update for message ${status?.id}:`, JSON.stringify(error));
        }
    }
}
