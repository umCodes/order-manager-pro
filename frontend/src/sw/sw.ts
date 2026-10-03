/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim } from "workbox-core";
import type { ServiceWorkerMessage } from "../lib/serviceWorkerMessages";

/**
 * The app's service worker. The caching half reproduces what the PWA plugin
 * used to generate (precached app shell, SPA navigation fallback, cache-first
 * item list). The push half shows a notification for every inbound WhatsApp
 * message the webhook Lambda pushes — even with the app closed — and opens
 * that chat when the notification is tapped.
 */

declare const self: ServiceWorkerGlobalScope;

/** Payload sent by wa-webhook-lambda/webhook/notifyByPush.mjs. */
type WhatsAppPush = { title?: string; body?: string; phone?: string; tag?: string };


// "autoUpdate": a new version takes over right away.
self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/items"),
  new CacheFirst({ cacheName: "api-cache", plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })] }),
);

async function postToWindows(message: ServiceWorkerMessage) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage(message);
}

self.addEventListener("push", (event) => {
  let data: WhatsAppPush;
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }

  // Every push must show a notification: iPhones (and Chrome) revoke the
  // subscription of a site whose pushes stay silent.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "New WhatsApp message", {
        body: data.body ?? "",
        icon: "/app-icon-192.png",
        // One notification per chat: a newer message replaces the older one but still alerts.
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { phone: data.phone },
      } as NotificationOptions),
      // An open app refreshes right away instead of waiting to be reopened.
      data.phone ? postToWindows({ type: "wa-message", phone: data.phone }) : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const phone: string | undefined = event.notification.data?.phone;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        if (phone) existing.postMessage({ type: "open-chat", phone } satisfies ServiceWorkerMessage);
        return;
      }
      const url = new URL(phone ? `/?chat=${encodeURIComponent(phone)}` : "/", self.location.origin);
      await self.clients.openWindow(url.href);
    })(),
  );
});
