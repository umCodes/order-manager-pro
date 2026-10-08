import type { WhatsAppChat, WhatsAppChatPreview, WhatsAppConversation, WhatsAppMessage } from "./api";

/**
 * On-device copy of the WhatsApp inbox, kept in localStorage so the chat list
 * and conversations show instantly (and older history stays readable after
 * the server's 7-day retention drops it). Every server load is merged in, by
 * message id, with the server's copy winning for anything it still returns.
 *
 * Deleting is local only: a deleted message is remembered by id (and a
 * cleared chat by a cut-off time), so it stays hidden when the server sends
 * it again on the next refresh. The customer's copy is never touched.
 *
 * Storage can be full, blocked or wiped at any time; every read and write
 * tolerates that and the app falls back to the server.
 */

const CHATS_KEY = "wa:chats:v1";
const conversationKey = (phone: string) => `wa:conversation:v1:${phone}`;

/** Oldest messages beyond this are dropped from a chat's local copy. */
const MAX_STORED_MESSAGES_PER_CHAT = 1000;

/**
 * How long a deleted message's id is remembered. Only needs to outlive the
 * server's own retention (7 days), after which it can't come back anyway.
 */
const DELETED_ID_TTL_MS = 8 * 24 * 60 * 60 * 1000;

type StoredConversation = {
  /** Visible messages only (deleted / cleared ones are removed), oldest first. */
  messages: WhatsAppMessage[];
  can_reply: boolean;
  reply_window_expires_at?: number;
  /** Deleted message id → its timestamp (to expire the entry, and to match the list preview). */
  deleted: Record<string, number>;
  /** "Clear chat": every message at or before this time stays hidden. */
  cleared_at?: number;
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or unavailable: the app keeps working from the server.
  }
}

function readConversation(phone: string): StoredConversation | null {
  const stored = read<StoredConversation>(conversationKey(phone));
  return stored && Array.isArray(stored.messages) ? { ...stored, deleted: stored.deleted ?? {} } : null;
}

function isHidden(stored: Pick<StoredConversation, "deleted" | "cleared_at">, message: WhatsAppMessage) {
  return message.id in stored.deleted || (stored.cleared_at !== undefined && message.timestamp <= stored.cleared_at);
}

function toConversation(stored: StoredConversation): WhatsAppConversation {
  return {
    messages: stored.messages,
    can_reply: stored.can_reply,
    reply_window_expires_at: stored.reply_window_expires_at,
  };
}

function save(phone: string, stored: StoredConversation) {
  const cutoff = Date.now() - DELETED_ID_TTL_MS;
  const deleted = Object.fromEntries(Object.entries(stored.deleted).filter(([, timestamp]) => timestamp > cutoff));
  write(conversationKey(phone), { ...stored, deleted });
}

/**
 * A chat's name as shown: a name taken from the contact's own WhatsApp
 * profile (no Zoho customer has the number) gets WhatsApp's "~" prefix, the
 * way WhatsApp shows people who aren't in your contacts.
 */
export function chatDisplayName(chat: Pick<WhatsAppChat, "name" | "name_source">) {
  return chat.name_source === "whatsapp" ? `~${chat.name}` : chat.name;
}

export function loadStoredChats(): WhatsAppChat[] | null {
  const chats = read<WhatsAppChat[]>(CHATS_KEY);
  return Array.isArray(chats) ? chats : null;
}

export function saveStoredChats(chats: WhatsAppChat[]) {
  write(CHATS_KEY, chats);
}

/** Last 9 digits — how the backend matches numbers across country-code / leading-zero differences. */
function phoneMatchKey(phone: string) {
  return phone.replace(/\D/g, "").replace(/^00/, "").replace(/^0/, "").slice(-9);
}

/**
 * The WhatsApp chat for a phone number as stored on a customer's contact
 * (in whatever format it was typed): the matching entry of the chat list if
 * there is one, else just its WhatsApp number — a local "0…" number taken
 * as Saudi (+966), the app's default country.
 */
export function findChatForPhone(phone: string, chats: WhatsAppChat[] | null): { phone: string; chat?: WhatsAppChat } {
  const key = phoneMatchKey(phone);
  const chat = chats?.find((c) => phoneMatchKey(c.phone) === key);
  if (chat) return { phone: chat.phone, chat };
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return { phone: digits.startsWith("0") ? `966${digits.slice(1)}` : digits };
}

/** The locally stored conversation, or null if this chat was never opened on this device. */
export function loadStoredConversation(phone: string): WhatsAppConversation | null {
  const stored = readConversation(phone);
  if (!stored) return null;
  // The stored reply window may have closed since it was saved.
  const windowClosed = stored.reply_window_expires_at !== undefined && stored.reply_window_expires_at <= Date.now();
  return { ...toConversation(stored), can_reply: stored.can_reply && !windowClosed };
}

/** Merges a conversation fresh from the server into the local copy, and returns what to show. */
export function mergeServerConversation(phone: string, server: WhatsAppConversation): WhatsAppConversation {
  const stored = readConversation(phone) ?? { messages: [], can_reply: false, deleted: {} };
  const byId = new Map(stored.messages.map((m) => [m.id, m]));
  for (const message of server.messages) {
    if (!isHidden(stored, message)) byId.set(message.id, message);
  }
  const messages = Array.from(byId.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_STORED_MESSAGES_PER_CHAT);
  const next: StoredConversation = {
    ...stored,
    messages,
    can_reply: server.can_reply,
    reply_window_expires_at: server.reply_window_expires_at,
  };
  save(phone, next);
  return toConversation(next);
}

/** Removes one message from this device only. */
export function deleteStoredMessage(phone: string, message: WhatsAppMessage, current: WhatsAppConversation): WhatsAppConversation {
  const stored = readConversation(phone) ?? { ...current, deleted: {} };
  const next: StoredConversation = {
    ...stored,
    messages: stored.messages.filter((m) => m.id !== message.id),
    deleted: { ...stored.deleted, [message.id]: message.timestamp },
  };
  save(phone, next);
  return toConversation(next);
}

/** Removes every message in the chat from this device only; newer messages still show up. */
export function clearStoredConversation(phone: string, current: WhatsAppConversation): WhatsAppConversation {
  const stored = readConversation(phone) ?? { ...current, deleted: {} };
  const latest = stored.messages.at(-1)?.timestamp ?? 0;
  const next: StoredConversation = { ...stored, messages: [], cleared_at: Math.max(Date.now(), latest) };
  save(phone, next);
  return toConversation(next);
}

function previewOf(message: WhatsAppMessage): WhatsAppChatPreview {
  let text = message.text;
  if (message.media) {
    const label = message.media.voice
      ? "Voice message"
      : message.media.filename || message.type.charAt(0).toUpperCase() + message.type.slice(1);
    text = text ? `[${label}] ${text}` : `[${label}]`;
  }
  return { text, timestamp: message.timestamp, direction: message.direction };
}

/**
 * The last-message preview for the chat list, respecting local deletes: the
 * server's preview is replaced when that message was deleted or cleared here,
 * or when the local copy has something newer.
 */
export function chatPreview(chat: WhatsAppChat): WhatsAppChatPreview | undefined {
  const stored = readConversation(chat.phone);
  const server = chat.last_message;
  if (!stored) return server;
  const localLast = stored.messages.at(-1);
  const serverHidden =
    server !== undefined &&
    ((stored.cleared_at !== undefined && server.timestamp <= stored.cleared_at) ||
      Object.values(stored.deleted).includes(server.timestamp));
  if (!server || serverHidden || (localLast && localLast.timestamp > server.timestamp)) {
    return localLast ? previewOf(localLast) : undefined;
  }
  return server;
}
