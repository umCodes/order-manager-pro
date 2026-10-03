import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, CheckCheck, RotateCw, Search } from "lucide-react";
import {
  fetchWhatsAppChats,
  fetchWhatsAppConversation,
  retryWhatsAppMessage,
  type WhatsAppChat,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from "../lib/api";
import RefreshButton from "./RefreshButton";
import ConfirmModal from "./ConfirmModal";
import WhatsAppComposer from "./WhatsAppComposer";
import WhatsAppMedia from "./WhatsAppMedia";

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
  if (status === "failed") return <AlertCircle size={14} className="wa-bubble__ticks wa-bubble__ticks--failed" aria-label="Not delivered" />;
  return <Check size={14} className="wa-bubble__ticks" />;
}

/** Distinct values with how many contacts have each, most common first (as on the Customers page). */
function rankedValues(chats: WhatsAppChat[], pick: (chat: WhatsAppChat) => string | undefined) {
  const counts = new Map<string, number>();
  for (const chat of chats) {
    const value = pick(chat);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

function FilterChip({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`wa-chip${active ? " wa-chip--active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
      {count !== undefined && <span className="wa-chip__count">{count}</span>}
    </button>
  );
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
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);
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

  const allChats = chats ?? [];
  const cityOptions = rankedValues(allChats, (chat) => chat.city);
  const chatsInCity = cityFilter ? allChats.filter((chat) => chat.city === cityFilter) : allChats;
  const districtOptions = rankedValues(chatsInCity, (chat) => chat.district);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleChats = chatsInCity.filter(
    (chat) =>
      (!districtFilter || chat.district === districtFilter) &&
      (!normalizedQuery ||
        chat.name.toLowerCase().includes(normalizedQuery) ||
        chat.phone.includes(normalizedQuery.replace(/\D/g, "") || normalizedQuery)),
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

      {/* Only worth a row when customers are spread over more than one city. */}
      {cityOptions.length > 1 && (
        <div className="wa-chips" role="group" aria-label="Filter by city">
          <FilterChip
            label="All cities"
            active={cityFilter === null}
            onClick={() => {
              setCityFilter(null);
              setDistrictFilter(null);
            }}
          />
          {cityOptions.map(({ value, count }) => (
            <FilterChip
              key={value}
              label={value}
              count={count}
              active={cityFilter === value}
              onClick={() => {
                setCityFilter(value);
                setDistrictFilter(null);
              }}
            />
          ))}
        </div>
      )}

      {districtOptions.length > 0 && (
        <div className="wa-chips" role="group" aria-label="Filter by district">
          <FilterChip label="All" count={chatsInCity.length} active={districtFilter === null} onClick={() => setDistrictFilter(null)} />
          {districtOptions.map(({ value, count }) => (
            <FilterChip
              key={value}
              label={value}
              count={count}
              active={districtFilter === value}
              onClick={() => setDistrictFilter(value)}
            />
          ))}
        </div>
      )}

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

/**
 * Full-screen conversation (covers the tab bar): header with the back button
 * and contact name, the message history scrolling in between, and the reply
 * box fixed at the bottom.
 */
function ChatView({ chat, onBack }: { chat: WhatsAppChat; onBack: () => void }) {
  const [conversation, setConversation] = useState<WhatsAppConversation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryingMessage, setRetryingMessage] = useState<WhatsAppMessage | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
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

  // Jump to the newest message whenever one arrives.
  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messageCount]);

  function handleRetry() {
    if (!retryingMessage) return;
    setIsRetrying(true);
    setRetryError(null);
    retryWhatsAppMessage(chat.phone, retryingMessage.id)
      .then((result) => {
        setConversation(result);
        setRetryingMessage(null);
      })
      .catch((e: Error & { conversation?: WhatsAppConversation }) => {
        // The new attempt is in the conversation as its own failed message.
        if (e.conversation) {
          setConversation(e.conversation);
          setRetryingMessage(null);
          setSendError(`Sent again, but it failed: ${e.message}`);
        } else {
          setRetryError(e.message);
        }
      })
      .finally(() => setIsRetrying(false));
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
        <div className="wa-chat__name">{chat.name}</div>
      </div>

      <div className="wa-chat__messages" ref={messagesRef}>
        {loadError && <div className="form-error">{loadError}</div>}
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
                <MessageBubble
                  phone={chat.phone}
                  message={message}
                  onRetry={() => {
                    setRetryError(null);
                    setRetryingMessage(message);
                  }}
                />
              </div>
            );
          })
        )}
      </div>

      {sendError && <div className="form-error wa-chat__error">{sendError}</div>}
      <WhatsAppComposer
        phone={chat.phone}
        canReply={canReply || conversation === null}
        closedNotice="WhatsApp only allows replies within 24 hours of the contact's last message."
        onSent={(result) => {
          setSendError(null);
          setConversation(result);
        }}
      />

      {retryingMessage && (
        <ConfirmModal
          title="Send again?"
          message={
            retryingMessage.status === "failed"
              ? `This message wasn't delivered${retryingMessage.error ? ` (${retryingMessage.error})` : ""}. Send it to ${chat.name} again?`
              : `This message hasn't been delivered yet. Send it to ${chat.name} again?`
          }
          confirmLabel={isRetrying ? "Sending..." : "Send again"}
          error={retryError}
          isConfirming={isRetrying}
          onConfirm={handleRetry}
          onCancel={() => setRetryingMessage(null)}
        />
      )}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

function MessageBubble({ phone, message, onRetry }: { phone: string; message: WhatsAppMessage; onRetry: () => void }) {
  const isOut = message.direction === "out";
  const isTemplate = message.type === "template";
  const isFailed = message.status === "failed";
  const problem = isFailed
    ? `Not delivered${message.error ? `: ${message.error}` : ""}`
    : message.can_retry
      ? "Not delivered yet"
      : undefined;
  return (
    <div className={`wa-bubble-row${isOut ? " wa-bubble-row--out" : ""}`}>
      {isOut && message.can_retry && (
        <button
          type="button"
          className={`wa-retry${isFailed ? " wa-retry--failed" : ""}`}
          onClick={onRetry}
          aria-label={`${problem}. Try again`}
          title={`${problem} — tap to try again`}
        >
          <RotateCw size={13} />
        </button>
      )}
      <div className={`wa-bubble${isOut ? " wa-bubble--out" : ""}${isTemplate ? " wa-bubble--template" : ""}`}>
        {isTemplate && <div className="wa-bubble__label">Template message</div>}
        {message.media && <WhatsAppMedia phone={phone} message={message} />}
        {message.text && <div className="wa-bubble__text">{message.text}</div>}
        <div className="wa-bubble__meta" title={problem}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {isOut && isTemplate && message.status && !isFailed && (
            <span className="wa-bubble__status">{STATUS_LABELS[message.status] ?? message.status}</span>
          )}
          {isOut && <StatusTicks status={message.status} />}
        </div>
        {message.reaction && <span className="wa-bubble__reaction">{message.reaction}</span>}
      </div>
    </div>
  );
}
