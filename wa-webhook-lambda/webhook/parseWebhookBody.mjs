/** Parses the JSON body off a Lambda Function URL event, handling the base64-encoded case. */
export function parseWebhookBody(event) {
    const raw = event.isBase64Encoded && event.body
        ? Buffer.from(event.body, "base64").toString("utf-8")
        : event.body;
    return raw ? JSON.parse(raw) : {};
}

/** Walks Meta's payload shape (entry[].changes[].value.messages[]) and returns the flat list of messages. */
export function extractMessages(body) {
    const messages = [];
    for (const entry of body?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            if (change?.field !== "messages") continue;
            messages.push(...(change?.value?.messages ?? []));
        }
    }
    return messages;
}

/**
 * The sender profiles that come with inbound messages
 * (entry[].changes[].value.contacts[]): each sender's wa_id and the name
 * they set on their WhatsApp (or WhatsApp Business) profile.
 */
export function extractContacts(body) {
    const contacts = [];
    for (const entry of body?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            if (change?.field !== "messages") continue;
            for (const contact of change?.value?.contacts ?? []) {
                const name = contact?.profile?.name?.trim();
                if (contact?.wa_id && name) contacts.push({ waId: String(contact.wa_id), name });
            }
        }
    }
    return contacts;
}

/** Walks Meta's payload shape (entry[].changes[].value.statuses[]) for delivery/read receipts on messages we sent. */
export function extractStatuses(body) {
    const statuses = [];
    for (const entry of body?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            if (change?.field !== "messages") continue;
            statuses.push(...(change?.value?.statuses ?? []));
        }
    }
    return statuses;
}
