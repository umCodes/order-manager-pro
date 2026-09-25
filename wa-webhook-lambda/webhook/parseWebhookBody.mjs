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
