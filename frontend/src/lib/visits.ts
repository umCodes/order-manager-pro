import { useSyncExternalStore } from "react";
import { fetchCustomerVisits, type CustomerVisits } from "./api";

/**
 * The "To visit" list, shared app-wide so the Customers tab can show how
 * many customers are due. Loaded when the app starts and when it comes back
 * to the foreground (no timer: the list only changes by the day, or when
 * something is recorded in the app, which refreshes it).
 */

let state: CustomerVisits | null = null;
let error: string | null = null;
const listeners = new Set<() => void>();
let snapshot: { state: CustomerVisits | null; error: string | null } = { state, error };

function publish() {
  snapshot = { state, error };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVisits() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function refreshVisits(): Promise<void> {
  return fetchCustomerVisits()
    .then((next) => {
      state = next;
      error = null;
    })
    .catch((e) => {
      error = e instanceof Error ? e.message : "Failed to load visits";
    })
    .finally(publish);
}

/** Call once from the app root; returns a stop function. */
export function startVisitsWatcher() {
  function handleVisibilityChange() {
    if (document.visibilityState === "visible") refreshVisits();
  }
  refreshVisits();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
}
