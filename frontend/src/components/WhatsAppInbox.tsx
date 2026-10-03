import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, Search, SendHorizontal } from "lucide-react";
import {
  fetchWhatsAppChats,
  fetchWhatsAppConversation,
  sendWhatsAppChatMessage,
  type WhatsAppChat,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from "../lib/api";
import RefreshButton from "./RefreshButton";

/** How often an open conversation re-reads its history, to pick up new inbound messages. */
const CONVERSATION_POLL_MS = 10_000;

function initials(name: string) {
  const letters = name
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("");
  return letters.toUpperCase() || "#";
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

/** Messaging-app style timestamp: time today, "Yesterday", weekday this week, otherwise the date. */
function formatListTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  if (isSameDay(date, now)) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  if (now.getTime() - date.getTime() < 6 * 24 * 60 * 60 * 1000) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString();
}

function formatDayDivider(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  if (isSameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function StatusTicks({ status }: { status?: string }) {
  if (status === "read") return <CheckCheck size={14} className="wa-bubble__ticks wa-bubble__ticks--read" />;
  if (status === "delivered") return <CheckCheck size={14} className="wa-bubble__ticks" />;
  if (status === "failed") return <span className="wa-bubble__failed">Failed</span>;
  return <Check size={14} className="wa-bubble__ticks" />;
}

/**
 * The WhatsApp tab of the Messages page: every customer with a phone on file
 * (plus any other number that has written in), listed like a messaging app's
 * chats, and a chat view for the selected one. History is whatever the
 * webhook and this app have stored (kept for 7 days); replying is only
 * possible within 24 hours of the contact's last message.
 */
export default function WhatsAppInbox() {
  const [chats, setChats] = useState<WhatsAppChat[] | null>(null);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openChat, setOpenChat] = useState<WhatsAppChat | null>(null);

  const loadChats = useCallback(
    () =>
      fetchWhatsAppChats()
        .then((list) => {
          setChats(list);
          setChatsError(null);
        })
        .catch((e) => setChatsError(e instanceof Error ? e.message : "Failed to load chats")),
    [],
  );

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  if (openChat) {
    return (
      <ChatView
        chat={openChat}
        onBack={() => {
          setOpenChat(null);
          loadChats();
        }}
      />
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleChats = (chats ?? []).filter(
    (chat) =>
      !normalizedQuery ||
      chat.name.toLowerCase().includes(normalizedQuery) ||
      chat.phone.includes(normalizedQuery.replace(/\D/g, "") || normalizedQuery),
  );

  return (
    <div>
      <div className="wa-list__toolbar">
        <div className="search-field wa-list__search">
          <Search size={16} className="search-field__icon" />
          <input
            type="text"
            className="input search-field__input"
            placeholder="Search contacts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <RefreshButton onRefresh={loadChats} />
      </div>

      {chatsError && <div className="form-error">{chatsError}</div>}

      {chats === null && !chatsError ? (
        <div className="items-area__empty">Loading...</div>
      ) : visibleChats.length === 0 ? (
        <div className="items-area__empty">{normalizedQuery ? "No matching contacts" : "No contacts with a phone number"}</div>
      ) : (
        <div className="wa-list">
          {visibleChats.map((chat) => (
            <button
              key={`${chat.phone}-${chat.customer_id ?? ""}`}
              type="button"
              className="wa-list__row"
              onClick={() => setOpenChat(chat)}
            >
              <span className="wa-avatar">{initials(chat.name)}</span>
              <span className="wa-list__main">
                <span className="wa-list__top">
                  <span className="wa-list__name">{chat.name}</span>
                  {chat.last_message && (
                    <span className="wa-list__time">{formatListTime(chat.last_message.timestamp)}</span>
                  )}
                </span>
                <span className="wa-list__preview">
                  {chat.last_message
                    ? `${chat.last_message.direction === "out" ? "You: " : ""}${chat.last_message.text}`
                    : `+${chat.phone}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatView({ chat, onBack }: { chat: WhatsAppChat; onBack: () => void }) {
  const [conversation, setConversation] = useState<WhatsAppConversation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messageCount = conversation?.messages.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetchWhatsAppConversation(chat.phone)
        .then((result) => {
          if (cancelled) return;
          setConversation(result);
          setLoadError(null);
        })
        .catch((e) => {
          if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load conversation");
        });
    }
    load();
    const interval = window.setInterval(load, CONVERSATION_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [chat.phone]);

  // Jump to the newest message whenever one arrives. Scrolling to the very
  // bottom of the page (rather than scrollIntoView on the last message)
  // leaves the pinned composer and the tab bar below it, not on top of it.
  // Depending on viewport, either the page body or the document scrolls.
  useEffect(() => {
    if (messageCount === 0) return;
    const scrollers = [endRef.current?.closest(".app-frame__body"), document.scrollingElement];
    for (const scroller of scrollers) {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
  }, [messageCount]);

  function handleSend() {
    const body = text.trim();
    if (!body || isSending) return;
    setIsSending(true);
    setSendError(null);
    sendWhatsAppChatMessage(chat.phone, body)
      .then((result) => {
        setConversation(result);
        setText("");
      })
      .catch((e) => setSendError(e instanceof Error ? e.message : "Failed to send message"))
      .finally(() => setIsSending(false));
  }

  const messages = conversation?.messages ?? [];
  const canReply = conversation?.can_reply ?? false;

  return (
    <div className="wa-chat">
      <div className="wa-chat__header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to contacts">
          <ArrowLeft size={18} />
        </button>
        <span className="wa-avatar wa-avatar--small">{initials(chat.name)}</span>
        <div className="wa-chat__title">
          <div className="wa-chat__name">{chat.name}</div>
          <div className="wa-chat__phone">+{chat.phone}</div>
        </div>
      </div>

      {loadError && <div className="form-error">{loadError}</div>}

      <div className="wa-chat__messages">
        {conversation === null && !loadError ? (
          <div className="items-area__empty">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="items-area__empty">No messages in the last 7 days</div>
        ) : (
          messages.map((message, index) => {
            const previous = messages[index - 1];
            const showDivider = !previous || !isSameDay(new Date(previous.timestamp), new Date(message.timestamp));
            return (
              <div key={message.id}>
                {showDivider && <div className="wa-chat__day">{formatDayDivider(message.timestamp)}</div>}
                <MessageBubble message={message} />
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="wa-composer">
        {conversation && !canReply && (
          <div className="wa-composer__notice">
            WhatsApp only allows replies within 24 hours of the contact's last message.
          </div>
        )}
        {sendError && <div className="form-error">{sendError}</div>}
        <div className="wa-composer__row">
          <textarea
            className="textarea wa-composer__input"
            rows={1}
            placeholder={canReply ? "Type a message" : "Replies unavailable"}
            value={text}
            disabled={!canReply || isSending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            className="wa-composer__send"
            onClick={handleSend}
            disabled={!canReply || isSending || !text.trim()}
            aria-label="Send message"
            title="Send"
          >
            <SendHorizontal size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const isOut = message.direction === "out";
  return (
    <div className={`wa-bubble-row${isOut ? " wa-bubble-row--out" : ""}`}>
      <div className={`wa-bubble${isOut ? " wa-bubble--out" : ""}${message.type === "template" ? " wa-bubble--template" : ""}`}>
        {message.type === "template" && <div className="wa-bubble__label">Template message</div>}
        <div className="wa-bubble__text">{message.text}</div>
        <div className="wa-bubble__meta">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {isOut && <StatusTicks status={message.status} />}
        </div>
        {message.reaction && <span className="wa-bubble__reaction">{message.reaction}</span>}
      </div>
    </div>
  );
}
