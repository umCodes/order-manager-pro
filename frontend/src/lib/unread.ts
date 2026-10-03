import { useSyncExternalStore } from "react";
import { fetchWhatsAppUnread, markWhatsAppChatRead, type WhatsAppUnread } from "./api";

/**
 * Unread WhatsApp message counts for the badges (Messages tab, WhatsApp
 * toggle, each chat in the list), shared app-wide. "Unread" means a
 * customer's message arrived after the chat was last opened in the app —
 * tracked by the backend, so it's the same on every device.
 *
 * Refreshed when the app starts, when it comes back to the foreground, and
 * once a minute while it's on screen (a single small request; nothing runs
 * while the app is in the background).
 */

const REFRESH_MS = 60_000;

let state: WhatsAppUnread = { total: 0, chats: {} };
const listeners = new Set<() => void>();

function setState(next: WhatsAppUnread) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current counts, outside React. */
export function getUnread(): WhatsAppUnread {
  return state;
}

export function useUnread(): WhatsAppUnread {
  return useSyncExternalStore(subscribe, () => state);
}

export function refreshUnread(): Promise<void> {
  return fetchWhatsAppUnread()
    .then(setState)
    .catch(() => {
      // Keep the last known counts; the next refresh will try again.
    });
}

/** Clears a chat's count right away (it's open), and records it as read on the server. */
export function markChatRead(phone: string) {
  if (state.chats[phone]) {
    const chats = { ...state.chats };
    const cleared = chats[phone];
    delete chats[phone];
    setState({ total: Math.max(0, state.total - cleared), chats });
  }
  markWhatsAppChatRead(phone).catch(() => {});
}

/** Starts keeping the counts fresh; returns a stop function. Call once, from the app root. */
export function startUnreadWatcher() {
  let timer: number | undefined;

  function schedule() {
    window.clearInterval(timer);
    timer = document.visibilityState === "visible" ? window.setInterval(refreshUnread, REFRESH_MS) : undefined;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") refreshUnread();
    schedule();
  }

  refreshUnread();
  schedule();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
