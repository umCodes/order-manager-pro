import { telegramApi } from "../services/telegram/client.mjs";
import { addBotReply, botRepliesTo, forgetBotReplies, readGroupReport, readOrderGroupMessages, saveGroupReport } from "../state/groupOrders.mjs";

/**
 * Shortage reports: a preparer replies to an order message in the group with
 * one item per line —
 *   3 M   item ③ is completely missing (m or M; 3 0 says the same)
 *   3 5   only 5 of item ③ is available (2.5 or 2,5 too)
 * Amounts are read as the message shows the item (telegramAmount): kilograms
 * when it has ኪሎ (a box shows as 10ኪሎ), a plain count when it has no ኪሎ (a
 * pack); for an item shown in grams (ግራም), a whole number is grams and a
 * fraction kilograms. Report lines are saved in those Telegram amounts.
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
 * messages, so deleting goes through the bot instead (deleteReports.mjs):
 * "." or "።" as an edit or a reply, or a ❤️. Once a report is saved, the
 * bot's earlier warnings on it are deleted.
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

/** "pack" in any case, also "packs", "packet(s)", "pk", "pkt(s)" and "እሽግ" — as backend/src/utils/quantity.ts. */
const PACK_UNIT = /^\s*(packs?|packets?|pk|pkts?|እሽግ)\.?\s*$/i;

/**
 * A quantity as the Telegram message counts it: kilograms (a box is 10kg), or
 * a plain count for a pack. Must match quantityCalc and telegramAmount in
 * backend/src/utils/quantity.ts.
 */
export function telegramAmount(quantity, unit) {
    if (PACK_UNIT.test(unit ?? "")) return { amount: quantity, unit: "pcs" };
    if (unit === "box") return { amount: round(quantity * 10), unit: "kg" };
    return { amount: quantity, unit: "kg" };
}

/** An amount the way the message writes it: "10ኪሎ", "500ግራም", or just the count. */
function shown({ amount, unit }) {
    if (unit === "pcs") return String(amount);
    return amount < 1 ? `${round(amount * 1000)}ግራም` : `${amount}ኪሎ`;
}

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
            errors.push(`"${text}" አልገባኝም`);
            continue;
        }
        const number = Number((missing ?? amount)[1]);
        const item = byNumber.get(number);
        if (!item) {
            errors.push(`${circledNumber(number)} በዚህ መልእክት ላይ የለም`);
            continue;
        }
        if (item.change === "decreased" || item.change === "removed") {
            errors.push(`${circledNumber(number)} እዚህ ${item.change === "removed" ? "ቀርቷል" : "ተቀንሷል"}`);
            continue;
        }
        if (seen.has(number)) {
            errors.push(`${circledNumber(number)} ሁለት ጊዜ ተጽፏል`);
            continue;
        }
        seen.add(number);

        const onMessage = telegramAmount(item.quantity, item.unit);
        const typed = missing ? 0 : Number(amount[2].replace(",", "."));
        // Shown in grams: a whole number is grams, a fraction kilograms.
        const available = onMessage.unit === "kg" && onMessage.amount < 1 && typed >= 1 ? round(typed / 1000) : round(typed);
        if (available > onMessage.amount) {
            errors.push(`${circledNumber(number)}: ${amount[2]} ከ${shown(onMessage)} ይበልጣል`);
            continue;
        }
        lines.push({
            number,
            item_id: item.item_id,
            item_key: item.item_key,
            description: item.description,
            unit: item.unit,
            ordered: onMessage.amount,
            available,
            tg_unit: onMessage.unit,
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

/** Calls the Bot API, logging (never throwing) a failure; returns Telegram's answer, or null when it couldn't be reached. */
export async function call(method, body) {
    try {
        const response = await telegramApi(method, body);
        if (!response.ok) console.error(`Telegram: ${method} failed:`, response.description);
        return response;
    } catch (error) {
        console.error(`Telegram: ${method} failed`, error);
        return null;
    }
}

const react = (message, emoji) =>
    call("setMessageReaction", {
        chat_id: message.chat.id,
        message_id: message.message_id,
        reaction: emoji ? [{ type: "emoji", emoji }] : [],
    });

/** Sends the bot's warning (HTML) as a reply to `message`, and remembers it, so the report's chain can be deleted together. */
async function answer(message, html) {
    const response = await call("sendMessage", {
        chat_id: message.chat.id,
        text: html,
        parse_mode: "HTML",
        reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
    });
    if (response?.ok) await addBotReply(message.message_id, response.result.message_id);
}

/**
 * The owner's wording for a report the bot couldn't read, laid out in
 * sections (Telegram HTML: bold headers, the example order in a quote, the
 * reply lines as code so they copy on a tap): how to delete it, how to
 * report a shortage, 👍 for ready, ❤️ to delete. What exactly was wrong is
 * only logged, not listed.
 */
export function warningText({ keptEarlier = false } = {}) {
    return [
        "<b>⚠️ የገባው መልእክት ልክ አይደለም</b>",
        ...(keptEarlier ? ["(የቀድሞው እንዳለ ነው)"] : []),
        "",
        "<b>🗑️ መልእክቱን ጭራሽ ለማጥፋት</b>",
        "• መልእክቱን ኤዲት አድርገው <code>።</code> ወይም <code>.</code> ብቻ ያድርጉት",
        "• ወይም በ <code>.</code> ምላሽ ይላኩ",
        "• ወይም ❤️ እስቲከር ያርጉት",
        "<i>መልእክቱን በራስዎ ማጥፋት ስህተት ነው።</i>",
        "",
        "<b>❗️ ጉድለት ለማሳወቅ</b>",
        "የእቃ ቁጥር (1, 2, 3…) + እጅ ላይ ያለው መጠን",
        "",
        "ምሳሌ፦",
        "<blockquote>INV-004042:\n① 10ኪሎ ሽሮ ኪሎ\n② 10ኪሎ ሽሮ ሩብ\n③ 10ኪሎ ሽሮ ኑስ\n🟢 ለዛሬ</blockquote>",
        "ምላሽ መልእክት፦",
        "<code>2 5</code>  →  ② በእጅ ላይ ያለው 5 ኪሎ ብቻ ነው",
        "<code>3 0</code>  →  ③ በእጅ ላይ ምንም የለም",
        "",
        "<b>👍 ትዕዛዝ ዝግጁ መሆኑን ለማሳወቅ</b>",
        'በትዕዛዙ መልእክት ላይ "👍" እስቲከር ያርጉት',
        "",
        "<b>❤️ ይህን መልእክት ለማጥፋት</b>",
        '"❤️" እስቲከር ያርጉት',
    ].join("\n");
}

/** The bot's warnings answering a message, once it's been fixed — deleted so the chat only keeps what's still wrong. */
async function clearWarnings(message) {
    const warnings = await botRepliesTo(message.message_id);
    if (warnings.length === 0) return;
    await call("deleteMessages", { chat_id: message.chat.id, message_ids: warnings });
    await forgetBotReplies(message.message_id, warnings);
}

/** Cancels a report (its message was deleted with "." / "።" / ❤️): no item lines from now on, with the earlier ones kept in its history. */
export async function cancelReport(messageId, at = new Date()) {
    const previous = await readGroupReport(messageId);
    if (!previous || previous.deleted_at) return;
    const { history = [], ...current } = previous;
    await saveGroupReport({
        ...current,
        lines: [],
        deleted_at: at.toISOString(),
        updated_at: at.toISOString(),
        history: [...history, { text: previous.text, lines: previous.lines, updated_at: previous.updated_at }],
    });
}

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
        errors.push(`${orderMessage.order_number} እንደገና ተልኳል፤ አዲሱን መልእክት ይመልሱ`);
    }

    if (errors.length > 0) {
        await answer(message, warningText({ keptEarlier: !!(edited && previous?.lines.length) }));
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
              updated_at: new Date(message.date * 1000).toISOString(),
              text,
              lines: lines.map((line) => ({ ...line, updated_at: new Date(message.date * 1000).toISOString() })),
              history: [],
          };
    await saveGroupReport(report);
    await react(message, CONFIRM_REACTION);
    await clearWarnings(message);
    console.log(`Telegram group: report ${message.message_id} on ${orderMessage.order_number} saved:`, lines.map((line) => line.text).join(", "));
}

function nextVersion(previous, message, text, lines) {
    const { history = [], ...current } = previous;
    const updatedAt = new Date((message.edit_date ?? message.date) * 1000).toISOString();
    // A line the edit left as it was keeps its own time, so only what changed counts as new.
    const before = new Map(previous.lines.map((line) => [line.number, line]));
    return {
        ...current,
        text,
        lines: lines.map((line) => {
            const old = before.get(line.number);
            const unchanged = old && old.available === line.available;
            return { ...line, updated_at: unchanged ? (old.updated_at ?? previous.updated_at) : updatedAt };
        }),
        updated_at: updatedAt,
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
