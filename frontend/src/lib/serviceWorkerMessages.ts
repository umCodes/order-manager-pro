/**
 * Messages the service worker (src/sw/sw.ts) posts to open app windows:
 * a WhatsApp message just arrived for `phone`, or a tapped notification
 * wants that chat opened. Kept free of DOM / worker types so both sides can
 * import it.
 */
export type ServiceWorkerMessage = { type: "wa-message"; phone: string } | { type: "open-chat"; phone: string };

/** A request to open a WhatsApp chat; `id` makes a repeat tap on the same chat a new request. */
export type ChatOpenRequest = { phone: string; id: number };
