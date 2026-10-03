import { deletePushSubscription, fetchPushPublicKey, savePushSubscription } from "./api";
import type { ServiceWorkerMessage } from "./serviceWorkerMessages";

/**
 * Push notifications for inbound WhatsApp messages (Web Push). Each device
 * opts in once: the browser asks its own push service (Google's on Android /
 * Chrome, Apple's on iPhone) for a subscription, which is stored by the
 * backend; the webhook Lambda then pushes to it whenever a message arrives,
 * and the service worker (src/sw/sw.ts) shows the notification.
 */

export type PushSupport =
  | "supported"
  /** iPhone/iPad in a Safari tab: web push only works from the Home Screen app. */
  | "needs-home-screen"
  | "unsupported";

export type PushState = "on" | "off" | "blocked";

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function getPushSupport(): PushSupport {
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (hasPush) return "supported";
  return isIos() && !isStandalone() ? "needs-home-screen" : "unsupported";
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function getPushState(): Promise<PushState> {
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

function base64UrlToBytes(value: string) {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const bytes = new Uint8Array(a);
  return bytes.length === b.length && bytes.every((byte, i) => byte === b[i]);
}

/**
 * Turns notifications on for this device. Must be called straight from a tap:
 * iPhones only show the permission prompt in direct response to one.
 */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied" ? "Notifications are blocked for this app in your phone's settings." : "Notifications weren't allowed.");
  }

  const publicKey = await fetchPushPublicKey();
  if (!publicKey) throw new Error("Notifications aren't set up on the server yet.");
  const serverKey = base64UrlToBytes(publicKey);

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  // Subscribed under an old server key (keys were changed): start over.
  if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
    await deletePushSubscription(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
  await savePushSubscription(subscription.toJSON());
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await deletePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}

let hasResynced = false;

/**
 * Re-registers an existing subscription, in case the server lost it (e.g. a
 * Redis reset). Once per app launch is enough.
 */
export async function resyncPushSubscription(): Promise<void> {
  if (hasResynced) return;
  hasResynced = true;
  const subscription = await currentSubscription();
  if (subscription) await savePushSubscription(subscription.toJSON());
}

/** Listens for the service worker's messages; returns an unsubscribe function. */
export function onServiceWorkerMessage(handler: (message: ServiceWorkerMessage) => void) {
  if (!("serviceWorker" in navigator)) return () => {};
  const listener = (event: MessageEvent) => {
    const data = event.data as ServiceWorkerMessage | undefined;
    if (data && (data.type === "wa-message" || data.type === "open-chat") && typeof data.phone === "string") handler(data);
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}

/**
 * The chat a tapped notification asked to open, when it had to launch the
 * app fresh (`/?chat=<phone>`). Removed from the address bar once read.
 */
export function takeChatFromUrl(): string | null {
  const url = new URL(window.location.href);
  const phone = url.searchParams.get("chat");
  if (!phone) return null;
  url.searchParams.delete("chat");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  return phone;
}
