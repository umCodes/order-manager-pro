const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"];

/** Describes an inbound message's content in a type-agnostic way for logging/notification purposes. */
export function describeMessage(message) {
    const type = message?.type;

    if (type === "text") {
        return { type, text: message.text?.body ?? "" };
    }

    if (MEDIA_TYPES.includes(type)) {
        const media = message[type];
        return {
            type,
            mediaId: media?.id,
            caption: media?.caption,
            filename: media?.filename,
        };
    }

    if (type === "location") {
        const location = message.location;
        return { type, latitude: location?.latitude, longitude: location?.longitude, name: location?.name };
    }

    return { type: type ?? "unknown" };
}
