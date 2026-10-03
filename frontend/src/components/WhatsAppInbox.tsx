import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, CheckCheck, RotateCw, Search, Trash2 } from "lucide-react";
import {
  fetchWhatsAppChats,
  fetchWhatsAppConversation,
  retryWhatsAppMessage,
  type WhatsAppChat,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from "../lib/api";
import {
  chatPreview,
  clearStoredConversation,
  deleteStoredMessage,
  loadStoredChats,
  loadStoredConversation,
  mergeServerConversation,
  saveStoredChats,
} from "../lib/whatsappStore";
import { onServiceWorkerMessage } from "../lib/push";
import type { ChatOpenRequest } from "../lib/serviceWorkerMessages";
import RefreshButton from "./RefreshButton";
import NotificationToggle from "./NotificationToggle";
import ConfirmModal from "./ConfirmModal";
import WhatsAppComposer from "./WhatsAppComposer";
import WhatsAppMedia from "./WhatsAppMedia";

/** Viewport shrinkage beyond this many px is taken to mean the on-screen keyboard is open. */
const KEYBOARD_THRESHOLD_PX = 120;

/** Holding a message this long opens its actions (copy / delete). */
const LONG_PRESS_MS = 500;

/**
 * An open conversation is loaded once when opened (and again on refresh or
 * when the app comes back to the foreground) — there's no open-ended
 * polling. The only repeated checking is right after sending: re-read this
 * often, for at most this long, so the new message's ticks (sent →
 * delivered → read, or failed) update promptly.
 */
const AFTER_SEND_POLL_MS = 3_000;
const AFTER_SEND_POLL_WINDOW_MS = 60_000;

/** Read and failed are final: a message's ticks won't change after either. */
function isSettled(message: WhatsAppMessage) {
  return message.status === "read" || message.status === "failed";
}

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
export default function WhatsAppInbox({
  chatRequest,
  onChatRequestHandled,
}: {
  /** A chat to open as soon as possible (a tapped notification). */
  chatRequest?: ChatOpenRequest | null;
  /** Called once that chat is open, so the request isn't replayed on a later visit. */
  onChatRequestHandled?: () => void;
}) {
  // Shown straight from this device's copy, then refreshed from the server.
  const [chats, setChats] = useState<WhatsAppChat[] | null>(() => loadStoredChats());
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
          saveStoredChats(list);
          setChatsError(null);
        })
        .catch((e) => setChatsError(e instanceof Error ? e.message : "Failed to load chats")),
    [],
  );

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // A message just arrived (pushed to this device): refresh the list's previews.
  useEffect(
    () =>
      onServiceWorkerMessage((message) => {
        if (message.type === "wa-message") loadChats();
      }),
    [loadChats],
  );

  // Open the chat a tapped notification points at, once the list is known
  // (from this device's copy or the server). A number not on the list (e.g.
  // a new contact) still opens, under its phone number.
  const [handledRequestId, setHandledRequestId] = useState<number | null>(null);
  if (chatRequest && chatRequest.id !== handledRequestId && (chats !== null || chatsError)) {
    setHandledRequestId(chatRequest.id);
    const match = chats?.find((chat) => chat.phone === chatRequest.phone);
    setOpenChat(match ?? { phone: chatRequest.phone, name: `+${chatRequest.phone}` });
  }
  useEffect(() => {
    if (chatRequest && chatRequest.id === handledRequestId) onChatRequestHandled?.();
  }, [chatRequest, handledRequestId, onChatRequestHandled]);

  // Last-message previews, with local deletes applied. Re-read whenever the
  // list changes identity — including on returning from a chat, below.
  const previews = useMemo(
    () => new Map((chats ?? []).map((chat) => [chat.phone, chatPreview(chat)] as const)),
    [chats],
  );

  if (openChat) {
    return (
      <ChatView
        // A notification can switch straight from one chat to another: start fresh.
        key={openChat.phone}
        chat={openChat}
        onBack={() => {
          setOpenChat(null);
          // A new array so the previews pick up anything deleted in the chat
          // right away, even before (or without) the server reload.
          setChats((current) => (current ? [...current] : current));
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
        <NotificationToggle />
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
          {visibleChats.map((chat) => {
            const preview = previews.get(chat.phone);
            return (
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
                    {preview && <span className="wa-list__time">{formatListTime(preview.timestamp)}</span>}
                  </span>
                  <span className="wa-list__preview">
                    {preview ? `${preview.direction === "out" ? "You: " : ""}${preview.text}` : `+${chat.phone}`}
                  </span>
                </span>
              </button>
            );
          })}
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
  // This device's copy shows instantly; opening the chat then refreshes it.
  const [conversation, setConversation] = useState<WhatsAppConversation | null>(() => loadStoredConversation(chat.phone));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryingMessage, setRetryingMessage] = useState<WhatsAppMessage | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<WhatsAppMessage | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const lastMessageId = conversation?.messages.at(-1)?.id;
  // Until when to keep checking a just-sent message (0 = not checking), and
  // which message that is.
  const fastPollUntilRef = useRef(0);
  const watchedMessageIdRef = useRef<string | null>(null);
  // Starts the after-send checks; loads the conversation now (refresh button).
  const startAfterSendPollRef = useRef<() => void>(() => {});
  const loadRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Loads once on open, again when the app returns to the foreground, and
  // repeatedly only during the after-send window. Leaving the chat stops
  // everything; reopening it loads the latest state anyway.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    function scheduleAfterSendCheck() {
      window.clearTimeout(timer);
      timer = undefined;
      if (Date.now() < fastPollUntilRef.current) timer = window.setTimeout(load, AFTER_SEND_POLL_MS);
    }

    function load() {
      return fetchWhatsAppConversation(chat.phone)
        .then((result) => {
          if (cancelled) return;
          setConversation(mergeServerConversation(chat.phone, result));
          setLoadError(null);
          // A poll that started before the send won't have the message yet:
          // keep watching until a response actually shows it settled.
          const watched = result.messages.find((m) => m.id === watchedMessageIdRef.current);
          if (watched && isSettled(watched)) fastPollUntilRef.current = 0;
        })
        .catch((e) => {
          if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load conversation");
        })
        .finally(() => {
          if (!cancelled) scheduleAfterSendCheck();
        });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") load();
    }

    // A message from this contact was just pushed to this device: show it now.
    const stopListening = onServiceWorkerMessage((message) => {
      if (message.type === "wa-message" && message.phone === chat.phone) load();
    });

    loadRef.current = load;
    startAfterSendPollRef.current = scheduleAfterSendCheck;
    load();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopListening();
      loadRef.current = () => Promise.resolve();
      startAfterSendPollRef.current = () => {};
    };
  }, [chat.phone]);

  /** Shows a conversation returned by a send, then watches the new message's status for a while. */
  function showSentConversation(result: WhatsAppConversation) {
    const merged = mergeServerConversation(chat.phone, result);
    setConversation(merged);
    const sent = merged.messages.findLast((m) => m.direction === "out");
    if (!sent || isSettled(sent)) return;
    watchedMessageIdRef.current = sent.id;
    fastPollUntilRef.current = Date.now() + AFTER_SEND_POLL_WINDOW_MS;
    startAfterSendPollRef.current();
  }

  function handleDeleteMessage(message: WhatsAppMessage) {
    if (conversation) setConversation(deleteStoredMessage(chat.phone, message, conversation));
    setActionMessage(null);
  }

  function handleClearChat() {
    if (conversation) setConversation(clearStoredConversation(chat.phone, conversation));
    setIsClearConfirmOpen(false);
  }

  function handleCopyMessage(message: WhatsAppMessage) {
    navigator.clipboard?.writeText(message.text).catch(() => {});
    setActionMessage(null);
  }

  // Keep the chat exactly the size of the visible area. A fixed full-height
  // panel doesn't shrink when the on-screen keyboard opens, so mobile browsers
  // scroll the page to reveal the reply box and the header slides out of view.
  // Tracking the visual viewport keeps the header pinned at the top and the
  // reply box just above the keyboard, with the messages scrolling in between.
  useEffect(() => {
    const viewport = window.visualViewport;
    const panel = chatRef.current;
    if (!viewport || !panel) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function fit() {
      if (!viewport || !panel) return;
      const list = messagesRef.current;
      const wasAtBottom = list ? list.scrollHeight - list.scrollTop - list.clientHeight < 24 : false;
      panel.style.top = `${viewport.offsetTop}px`;
      panel.style.height = `${viewport.height}px`;
      panel.classList.toggle("wa-chat--keyboard", window.innerHeight - viewport.height > KEYBOARD_THRESHOLD_PX);
      if (list && wasAtBottom) list.scrollTop = list.scrollHeight;
    }

    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Jump to the newest message whenever one arrives (not when an older one is deleted).
  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastMessageId]);

  function handleRetry() {
    if (!retryingMessage) return;
    setIsRetrying(true);
    setRetryError(null);
    retryWhatsAppMessage(chat.phone, retryingMessage.id)
      .then((result) => {
        showSentConversation(result);
        setRetryingMessage(null);
      })
      .catch((e: Error & { conversation?: WhatsAppConversation }) => {
        // The new attempt is in the conversation as its own failed message.
        if (e.conversation) {
          setConversation(mergeServerConversation(chat.phone, e.conversation));
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
    <div className="wa-chat" ref={chatRef}>
      <div className="wa-chat__header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to contacts">
          <ArrowLeft size={18} />
        </button>
        <span className="wa-avatar wa-avatar--small">{initials(chat.name)}</span>
        <div className="wa-chat__name">{chat.name}</div>
        <div className="wa-chat__header-actions">
          <RefreshButton onRefresh={() => loadRef.current()} />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setIsClearConfirmOpen(true)}
            disabled={messages.length === 0}
            aria-label="Clear chat"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="wa-chat__messages" ref={messagesRef}>
        {loadError && <div className="form-error">{loadError}</div>}
        {conversation === null && !loadError ? (
          <div className="items-area__empty">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="items-area__empty">No messages</div>
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
                  onLongPress={() => setActionMessage(message)}
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
          showSentConversation(result);
        }}
      />

      {actionMessage && (
        <div className="modal-overlay">
          <div className="modal-overlay__backdrop" onClick={() => setActionMessage(null)} />
          <div className="modal">
            <div className="modal__title">Message</div>
            <div className="invoice-details__summary-row" style={{ marginBottom: 14 }}>
              Deleting removes it from this device only — {chat.name} still has it.
            </div>
            <div className="wa-message-actions">
              {actionMessage.text && (
                <button type="button" className="btn btn--secondary" onClick={() => handleCopyMessage(actionMessage)}>
                  Copy text
                </button>
              )}
              <button type="button" className="btn btn--primary" onClick={() => handleDeleteMessage(actionMessage)}>
                Delete for me
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => setActionMessage(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isClearConfirmOpen && (
        <ConfirmModal
          title="Clear chat?"
          message={`Remove all messages with ${chat.name} from this device? They still have them, and new messages will still show up here.`}
          confirmLabel="Clear chat"
          onConfirm={handleClearChat}
          onCancel={() => setIsClearConfirmOpen(false)}
        />
      )}

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

/**
 * Press-and-hold (touch) or right-click (mouse) handlers. Moving the finger
 * (scrolling) cancels the hold.
 */
function useLongPress(onLongPress: () => void) {
  const timerRef = useRef<number | undefined>(undefined);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function cancel() {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    startRef.current = null;
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return; // mice use right-click instead
      cancel();
      startRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = window.setTimeout(() => {
        cancel();
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const start = startRef.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      cancel();
      onLongPress();
    },
  };
}

function MessageBubble({
  phone,
  message,
  onRetry,
  onLongPress,
}: {
  phone: string;
  message: WhatsAppMessage;
  onRetry: () => void;
  onLongPress: () => void;
}) {
  const longPressHandlers = useLongPress(onLongPress);
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
      <div
        className={`wa-bubble${isOut ? " wa-bubble--out" : ""}${isTemplate ? " wa-bubble--template" : ""}`}
        {...longPressHandlers}
      >
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
