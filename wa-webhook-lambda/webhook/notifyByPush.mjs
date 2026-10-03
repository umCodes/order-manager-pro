import webpush from "web-push";
import { describeMessage } from "./messageContent.mjs";
import { listPushSubscriptions, removePushSubscription } from "../state/pushSubscriptions.mjs";

/** Push services keep an undelivered notification this long (e.g. phone off) before dropping it. */
const PUSH_TTL_SECONDS = 24 * 60 * 60;

/** Notification bodies are cut to roughly what a lock screen shows anyway. */
const MAX_BODY_LENGTH = 180;

const MEDIA_LABELS = {
    image: "📷 Photo",
    video: "🎥 Video",
    audio: "🎤 Voice message",
    document: "📄 Document",
    sticker: "Sticker",
    location: "📍 Location",
};

function notificationBody(message) {
    const content = describeMessage(message);
    if (content.type === "text") return content.text;
    if (content.type === "audio" && !message.audio?.voice) return "🎵 Audio";
    const label = MEDIA_LABELS[content.type] ?? "New message";
    const detail = content.caption || content.filename || content.name;
    return detail ? `${label}: ${detail}` : label;
}

function truncate(text) {
    return text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH - 1)}…` : text;
}

/**
 * Sends a push notification for an inbound WhatsApp message to every
 * subscribed device. The payload is encrypted for each device by web-push;
 * the browser's push service (Google, Apple, Mozilla, ...) only relays it.
 * Subscriptions the push service reports as gone (404/410: notifications
 * turned off, app uninstalled) are removed. Never throws for a single
 * device's failure.
 */
export async function notifyByPush(message, senderName) {
    const { WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT } = process.env;
    if (!WEB_PUSH_PUBLIC_KEY || !WEB_PUSH_PRIVATE_KEY || !WEB_PUSH_SUBJECT) {
        console.log("Web push keys not set, skipping push notification");
        return;
    }

    const subscriptions = await listPushSubscriptions();
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
        title: senderName || `+${message.from}`,
        body: truncate(notificationBody(message)),
        phone: message.from,
        // One notification per chat on the device: a newer message replaces the older one.
        tag: `wa-${message.from}`,
    });
    const options = {
        TTL: PUSH_TTL_SECONDS,
        urgency: "high",
        vapidDetails: { subject: WEB_PUSH_SUBJECT, publicKey: WEB_PUSH_PUBLIC_KEY, privateKey: WEB_PUSH_PRIVATE_KEY },
    };

    await Promise.all(
        subscriptions.map(async (subscription) => {
            try {
                await webpush.sendNotification(subscription, payload, options);
            } catch (error) {
                if (error?.statusCode === 404 || error?.statusCode === 410) {
                    console.log(`Push subscription gone (${error.statusCode}), removing: ${subscription.endpoint}`);
                    await removePushSubscription(subscription.endpoint);
                } else {
                    console.error(`Error sending push to ${subscription.endpoint}:`, error?.statusCode, error?.body ?? error);
                }
            }
        }),
    );
}
