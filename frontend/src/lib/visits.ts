import { useSyncExternalStore } from "react";
import {
  cancelCustomerVisit,
  fetchVisits,
  markCustomerVisited,
  scheduleCustomerVisit,
  type ScheduledVisit,
} from "./api";
import { businessDayKey } from "./businessTime";

/**
 * Scheduled customer visits, shared app-wide (the Customers tab badge, the
 * pinned customers, each customer's Visit button). Kept on the server, so
 * every phone sees the same list. Refreshed when the app starts, when it
 * comes back to the foreground, every few minutes while it's on screen, and
 * right after any change made here.
 */

const REFRESH_MS = 5 * 60_000;

type VisitsState = { today: string; byCustomer: Record<string, ScheduledVisit>; loaded: boolean };

let state: VisitsState = { today: businessDayKey(), byCustomer: {}, loaded: false };
const listeners = new Set<() => void>();

function setState(next: VisitsState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVisits(): VisitsState {
  return useSyncExternalStore(subscribe, () => state);
}

export function refreshVisits(): Promise<void> {
  return fetchVisits()
    .then(({ today, visits }) =>
      setState({ today, byCustomer: Object.fromEntries(visits.map((v) => [v.customer_id, v])), loaded: true }),
    )
    .catch(() => {
      // Keep what we have; the next refresh will try again.
    });
}

/** Visits not done yet, earliest day first; `overdue` ones are for a business day already over. */
export function visitSummary(current: VisitsState) {
  const visits = Object.values(current.byCustomer).sort((a, b) => a.day.localeCompare(b.day));
  const overdue = visits.filter((v) => v.day < current.today).length;
  const dueToday = visits.filter((v) => v.day === current.today).length;
  return { visits, overdue, dueToday, total: visits.length };
}

/** The customer's visit if it's due (today or overdue) — what a payment, delivery or return can confirm. */
export function dueVisitFor(customerId: string | undefined | null): ScheduledVisit | null {
  if (!customerId) return null;
  const visit = state.byCustomer[String(customerId)];
  return visit && visit.day <= state.today ? visit : null;
}

export async function scheduleVisit(customerId: string, customerName: string, day: string) {
  const visit = await scheduleCustomerVisit(customerId, customerName, day);
  setState({ ...state, byCustomer: { ...state.byCustomer, [customerId]: visit } });
  return visit;
}

function dropLocally(customerId: string) {
  const byCustomer = { ...state.byCustomer };
  delete byCustomer[customerId];
  setState({ ...state, byCustomer });
}

export async function cancelVisit(customerId: string) {
  await cancelCustomerVisit(customerId);
  dropLocally(customerId);
}

export async function completeVisit(customerId: string, confirmation: Parameters<typeof markCustomerVisited>[1]) {
  const result = await markCustomerVisited(customerId, confirmation);
  dropLocally(customerId);
  return result;
}

/** Starts keeping the visits fresh; returns a stop function. Call once, from the app root. */
export function startVisitsWatcher() {
  let timer: number | undefined;

  function schedule() {
    window.clearInterval(timer);
    timer = document.visibilityState === "visible" ? window.setInterval(refreshVisits, REFRESH_MS) : undefined;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") refreshVisits();
    schedule();
  }

  refreshVisits();
  schedule();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function addDays(day: string, n: number) {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

/** "Today", "Tomorrow", "Tue 21 Oct"; overdue visits read "Overdue · Mon 18 Oct". */
export function visitDayLabel(day: string, today: string) {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const plain = `${WEEKDAYS[date.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
  if (day < today) return `Overdue · ${plain}`;
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return plain;
}

// ---------- "Mark today's visit as done?" after a payment, delivery or return ----------

export type VisitActivity = "payment" | "delivery" | "return";
type VisitPrompt = { customerId: string; customerName: string; activity: VisitActivity } | null;

let prompt: VisitPrompt = null;
const promptListeners = new Set<() => void>();

function setPrompt(next: VisitPrompt) {
  prompt = next;
  for (const listener of promptListeners) listener();
}

export function useVisitPrompt(): VisitPrompt {
  return useSyncExternalStore(
    (listener) => {
      promptListeners.add(listener);
      return () => promptListeners.delete(listener);
    },
    () => prompt,
  );
}

/**
 * After a payment, delivery (invoice marked as sent) or return for a
 * customer: if they have a visit due (today or overdue), ask whether to mark
 * it done, confirmed by that activity. Does nothing otherwise.
 */
export function offerVisitCompletion(customerId: string | number | undefined | null, activity: VisitActivity) {
  const visit = dueVisitFor(customerId == null ? null : String(customerId));
  if (visit) setPrompt({ customerId: visit.customer_id, customerName: visit.customer_name, activity });
}

export function dismissVisitPrompt() {
  setPrompt(null);
}
