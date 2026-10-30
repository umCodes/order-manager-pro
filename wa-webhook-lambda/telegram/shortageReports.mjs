import { telegramApi } from "../services/telegram/client.mjs";
import { readGroupReport, readOrderGroupMessages, saveGroupReport } from "../state/groupOrders.mjs";

/**
 * Shortage reports: a preparer replies to an order message in the group with
 * one item per line —
 *   3 M   item ③ is completely missing (m or M)
 *   3 5   only 5 of item ③ is available, in the item's own unit (2.5 or 2,5 too)
 * Lines that don't start with a digit are notes and are left alone; a reply
 * with no item lines isn't a report. Every item line must check out against
 * the message replied to, or nothing in the reply is saved and the bot
 * answers with what's wrong and the format. A saved report gets the
 * CONFIRM_REACTION.
 *
 * Editing a report replaces it: the item lines it has now are what counts,
 * so taking a line out takes that item's report away, and taking every line
 * out cancels the report (its reaction is removed). Earlier versions are kept
 * in the record's history. Telegram doesn't tell bots about deleted
 * messages, so an edit is the way to correct one.
 *
 * Nothing here touches Zoho.
 */

/** Bots may only react with emoji from Telegram's reaction list (✅ isn't on it); 👍 is kept for "prepared". */
const CONFIRM_REACTION = "👌";

const ITEM_LINE = /^\d/;
const MISSING_LINE = /^(\d+)\s*[mM]$/;
const AMOUNT_LINE = /^(\d+)\s+(\d+(?:[.,]\d+)?)$/;

/** ① – ⑳, ㉑ – ㉟ and ㊱ – ㊿, as the order messages show them; "(51)" past that. */
function circledNumber(n) {
    if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
    if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21);
    if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + n - 36);
    return `(${n})`;
}

const round = (quantity) => Math.round(quantity * 1000) / 1000;

/** The item lines of a reply, each checked against the order message's items: { lines, errors }. */
export function parseReport(text, orderMessage) {
    const itemLines = String(text ?? "").split("\n").map((line) => line.trim()).filter((line) => ITEM_LINE.test(line));
    const byNumber = new Map(orderMessage.items.map((item) => [item.number, item]));
    const lines = [];
    const errors = [];
    const seen = new Set();

    for (const text of itemLines) {
        const missing = text.match(MISSING_LINE);
        const amount = missing ? null : text.match(AMOUNT_LINE);
        if (!missing && !amount) {
            errors.push(`"${text}" isn't a report line`);
            continue;
        }
        const number = Number((missing ?? amount)[1]);
        const item = byNumber.get(number);
        if (!item) {
            errors.push(`${circledNumber(number)} isn't on this message`);
            continue;
        }
        if (item.change === "decreased" || item.change === "removed") {
            errors.push(`${circledNumber(number)} was ${item.change === "removed" ? "removed" : "reduced"} here, so there's nothing to prepare for it`);
            continue;
        }
        if (seen.has(number)) {
            errors.push(`${circledNumber(number)} is written twice`);
            continue;
        }
        seen.add(number);

        const available = missing ? 0 : round(Number(amount[2].replace(",", ".")));
        if (available > item.quantity) {
            errors.push(`${circledNumber(number)}: ${available} is more than the ${item.quantity} ${item.unit} on this message`);
            continue;
        }
        lines.push({
            number,
            item_id: item.item_id,
            item_key: item.item_key,
            description: item.description,
            unit: item.unit,
            ordered: item.quantity,
            available,
            missing: available === 0,
            text,
        });
    }
    return { lines, errors };
}

/** Whether a newer full order message has replaced this one (a resend), so reports belong on the newer one. */
async function isReplaced(orderMessage) {
    const messages = await readOrderGroupMessages(orderMessage.order_id);
    return messages.some((message) => message.message_type === "order" && message.posted_at > orderMessage.posted_at);
}

async function call(method, body) {
    try {
        const response = await telegramApi(method, body);
        if (!response.ok) console.error(`Telegram: ${method} failed:`, response.description);
    } catch (error) {
        console.error(`Telegram: ${method} failed`, error);
    }
}

const react = (message, emoji) =>
    call("setMessageReaction", {
        chat_id: message.chat.id,
        message_id: message.message_id,
        reaction: emoji ? [{ type: "emoji", emoji }] : [],
    });

function answer(message, lines) {
    return call("sendMessage", {
        chat_id: message.chat.id,
        text: lines.join("\n"),
        reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
    });
}

const FORMAT_HELP = ["", "One item per line:", "3 M → ③ is missing", "3 5 → only 5 of ③ is available"];

/**
 * Handles a reply (new or edited) to an order message: `message` is the
 * update's message or edited_message, `orderMessage` the record of the
 * order message it replies to.
 */
export async function handleShortageReport(message, orderMessage, { edited }) {
    const text = message.text ?? message.caption ?? "";
    const previous = await readGroupReport(message.message_id);
    const { lines, errors } = parseReport(text, orderMessage);

    if (lines.length === 0 && errors.length === 0) {
        // No item lines: not a report — or, for an edited report, every line taken out.
        if (edited && previous && previous.lines.length > 0) {
            await saveGroupReport(nextVersion(previous, message, text, []));
            await react(message, null);
            console.log(`Telegram group: report ${message.message_id} on ${orderMessage.order_number} cancelled by an edit`);
        }
        return;
    }

    if (errors.length === 0 && (await isReplaced(orderMessage))) {
        errors.push(`${orderMessage.order_number} was sent again since this message; reply to the newest one`);
    }

    if (errors.length > 0) {
        const kept = edited && previous?.lines.length ? " (the earlier version stays)" : "";
        await answer(message, [`⚠️ Not saved${kept}:`, ...errors.map((error) => `• ${error}`), ...FORMAT_HELP]);
        console.log(`Telegram group: report ${message.message_id} on ${orderMessage.order_number} refused:`, errors.join("; "));
        return;
    }

    const report = previous
        ? nextVersion(previous, message, text, lines)
        : {
              chat_id: String(message.chat.id),
              message_id: message.message_id,
              reply_to_message_id: orderMessage.message_id,
              kind: orderMessage.kind,
              order_id: orderMessage.order_id,
              order_number: orderMessage.order_number,
              from: sender(message),
              sent_at: new Date(message.date * 1000).toISOString(),
              updated_at: new Date().toISOString(),
              text,
              lines,
              history: [],
          };
    await saveGroupReport(report);
    await react(message, CONFIRM_REACTION);
    console.log(`Telegram group: report ${message.message_id} on ${orderMessage.order_number} saved:`, lines.map((line) => line.text).join(", "));
}

function nextVersion(previous, message, text, lines) {
    const { history = [], ...current } = previous;
    return {
        ...current,
        text,
        lines,
        updated_at: new Date((message.edit_date ?? message.date) * 1000).toISOString(),
        history: [...history, { text: previous.text, lines: previous.lines, updated_at: previous.updated_at }],
    };
}

function sender(message) {
    return {
        id: message.from?.id ?? null,
        name: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" "),
        username: message.from?.username ?? null,
    };
}
