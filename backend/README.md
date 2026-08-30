# Order Manager Pro — Backend

Express + TypeScript API that proxies Zoho Invoice, the Telegram Bot API, and the WhatsApp Cloud API. See the [repo root README](../README.md) for environment variables and the full API reference.

## Scripts

```
npm run dev     # tsx watch src/index.ts
npm run build   # tsc
npm start       # node dist/index.js (run build first)
```

## Structure

```
src/
  index.ts              app entry — mounts routers, connects Redis
  config/redis.ts        Redis client (node `redis` package)
  constants/env.ts        typed env var access, loaded via dotenv
  middlewares/
    env_validate.middleware.ts   rejects requests if any ENV value is missing
    zoho_refresh_tokens.middleware.ts   keeps a Zoho access token fresh, attaches it as Authorization
  routes/          one file per resource, Express Router
  controllers/     request handlers — read req, call services, shape the response
  services/
    zoho/          Zoho Invoice API calls (client.ts wraps fetch + org header)
    telegram/      Telegram Bot API calls + invoice message formatting
    whatsapp/      WhatsApp Cloud API calls, notification templates, invoice-notify orchestration
  utils/           calculations, formatting, small helpers, in-memory TTL cache
```

## Request flow

Every `/api` route goes through, in order: `validateEnv` → `refreshZohoToken` → the matched router. `validateEnv` 500s if any `ENV` value is falsy; `refreshZohoToken` reuses an in-memory access token until it expires, then calls Zoho's OAuth endpoint and sets `req.headers['Authorization']` for the handler to use.

## Caching

Two separate mechanisms, don't confuse them:

- **`utils/cache.ts`** — an in-memory `Map` with per-key TTL via `setTimeout`. Used for things like the customers list (`getCustomers` controller) that are expensive to refetch and don't need cross-process consistency. Lost on restart.
- **`config/redis.ts`** — the shared Redis client (`redisClient`), used for state that must survive restarts / be consistent across instances: the Telegram message ID per invoice (so later actions can edit/reply to the right message) and the daily Zoho API request counter (`zoho:requests:YYYY-MM-DD`, 48h TTL, read via `GET /api/zoho-usage`).

## Zoho integration notes

- All Zoho calls go through `services/zoho/client.ts`'s `ZohoApi()`, which also increments the daily request counter — so any new Zoho call automatically counts toward usage, no extra wiring needed.
- Line items sent to `POST /invoices` are passed through to Zoho unfiltered (whatever shape the frontend sends is what Zoho gets), aside from stripping the `###` exclusion marker from descriptions.
- `POST /invoices` creates a new invoice unless the request body includes `invoice_id`, in which case it updates that specific draft's line items/date instead. Which invoice (if any) to update is decided entirely by the caller — the backend never guesses based on the customer. The submitted line items are sent as-is on update — the caller is expected to already include the draft's existing items if it wants them kept, not just the new ones.
- `POST /contacts` (via `ZohoCreateCustomer` in `services/zoho/customers.ts`) sets the org's "preferred_language" contact custom field by its `customfield_id`, hardcoded in that file — Zoho's Invoice API only documents setting custom fields by `index`/`label` on create, not `api_name`, so `customfield_id` (an exact, unambiguous identifier taken from the field's own metadata) was used instead. Unlike `ZohoApi()`'s other callers, this one explicitly checks the response's `code` field (Zoho returns `0` on success even on a 200 OK), since Zoho-side validation errors don't surface as a non-2xx HTTP status.

## Telegram integration notes

- `services/telegram/invoices.ts` builds the invoice notification text (with Amharic day/weekday labels) and sends/edits/replies via `services/telegram/messages.ts`.
- If replying to a previous invoice message fails (e.g. it was deleted on Telegram without Redis knowing), the code falls back to sending a fresh message rather than failing the request.

## WhatsApp integration notes

- `services/whatsapp/client.ts` wraps the WhatsApp Cloud API (`graph.facebook.com`), including media (PDF) uploads used for the balance-notification template's document header.
- `services/whatsapp/notifications.ts` sends the two approved templates — payment confirmation and balance/invoice-sent (with the invoice PDF attached) — picking the template name per the customer's `preferred_language` (`WA_*_TEMPLATE_AM/AR/EN` env vars). Amharic templates are registered in Meta Business Manager under the `en` language code, not `am`.
- `services/whatsapp/invoices.ts` is the orchestration layer the controllers call: it resolves the invoice's customer phone/language from Zoho, then sends the appropriate notification(s). Both `notifyPaymentRecorded` and `notifyInvoiceSent` swallow their own errors (logged, not thrown) so a WhatsApp failure never fails or rolls back the Zoho action that triggered it.
- There is deliberately no endpoint that only sends a WhatsApp message. Notifications are always an optional (`notify: true`) side effect of `POST /invoices/:id/payments`, `POST /invoices/:id/status/sent`, or `POST /customers/:id/payments` — the recipient is always the invoice/customer's phone on file in Zoho, never a value from the request body. This keeps a leaked/guessed URL from being usable to send arbitrary customer messages.
- `GET /api/wa-webhook` (`controllers/wa-webhook.controller.ts`) only implements Meta's subscription verification handshake; there is no handler yet for incoming message webhook events.
