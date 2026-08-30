# Order Manager Pro

Internal tool for creating and tracking Zoho Invoice drafts, with Telegram notifications for the fulfillment team and optional WhatsApp notifications to customers. Two apps in this repo: an Express/TypeScript backend that proxies Zoho Invoice, Telegram Bot, and WhatsApp Cloud APIs, and a Vite/React frontend.

## Structure

```
backend/   Express API — Zoho Invoice + Telegram + WhatsApp integration, Redis-backed caching
frontend/  Vite + React app — invoice creation, drafts, items, customers
```

## Setup

### Backend

```
cd backend
npm install
npm run dev      # tsx watch, http://localhost:3000
```

Requires a `.env` file (see [Environment variables](#environment-variables) below) and a running Redis instance.

### Frontend

```
cd frontend
npm install
npm run dev       # vite dev server
```

Set `VITE_API_BASE_URL` if the backend isn't reachable at the default `/api` proxy path.

## Environment variables

Backend (`backend/src/constants/env.ts`), loaded via `dotenv`:

| Variable | Purpose |
|---|---|
| `CLIENT_ID`, `CLIENT_SECRET` | Zoho OAuth app credentials |
| `ZOHO_REFRESH_TOKEN` | Long-lived token used to mint access tokens (see `refreshZohoToken` middleware) |
| `ORGANIZATION_ID` | Zoho Invoice organization ID (sent as `X-com-zoho-invoice-organizationid`) |
| `REDIRECT_URI` | OAuth redirect URI registered with Zoho |
| `TELEGRAM_TOKEN` | Telegram bot token |
| `TELEGRAM_CHATID` | Chat/channel the bot posts invoice notifications to |
| `TELEGRAM_CHANNEL_LINK` | Public link to the Telegram channel |
| `WA_TOKEN` | WhatsApp Cloud API bearer token |
| `WA_VERIFY_TOKEN` | Verify token for the `GET /api/wa-webhook` handshake |
| `WA_PHONE_NUMBER_ID` | WhatsApp Business phone number ID (defaults to the org's number) |
| `WA_PREP_NUM` | (see `services/whatsapp`) |
| `WA_PAYMENT_NOTIFICATION_TEMPLATE_AM` / `_AR` / `_EN` | Approved WhatsApp template name for the payment-confirmation message, per customer `preferred_language` |
| `WA_BALANCE_NOTIFICATION_TEMPLATE_AM` / `_AR` / `_EN` | Approved WhatsApp template name for the invoice-sent/balance message, per customer `preferred_language` |
| `REDIS_URL` | Redis connection string |
| `PORT` | Backend port (default `3000`) |

## Architecture notes

- **Zoho auth**: `refreshZohoToken` middleware (applied to all `/api` routes) keeps a single in-memory access token fresh and attaches it as the `Authorization` header on every request; it only calls Zoho's token endpoint when the cached token has expired.
- **Zoho request counting**: every call through `ZohoApi()` (`backend/src/services/zoho/client.ts`) increments a Redis counter keyed `zoho:requests:YYYY-MM-DD`, with a 48h TTL so old days expire on their own. `GET /api/zoho-usage` reads today's count; the frontend shows it as a small badge on the New Invoice page header.
- **Draft updates**: the New Invoice page has a "Create New Invoice" / "Update Draft" mode toggle. In "Update Draft" mode the user explicitly picks one of the customer's drafts by invoice number, and its line items are pre-loaded into the cart; submitting sends that draft's `invoice_id` in the request body, which `POST /invoices` uses to update that specific invoice instead of creating a new one. In "Create New Invoice" mode no `invoice_id` is sent and a new invoice is always created, regardless of any existing drafts. Either way, the line items sent on submit already represent the full desired state; the backend does not append to the draft's existing items itself.
- **Telegram message tracking**: the Telegram message ID for each invoice is stored in Redis (keyed by `invoice_id`) so later actions (adding items, rescheduling) can edit/reply to the original message instead of posting a new one. If a reply fails because the original message was deleted on Telegram's side, the backend falls back to sending a fresh message.
- **WhatsApp customer notifications are opt-in per action, decided server-side**: `POST /invoices/:id/payments` and `POST /invoices/:id/status/sent` (and `POST /customers/:id/payments`) accept an optional `notify: boolean` in the body. When `true`, the backend sends a WhatsApp template message to the invoice/customer's phone number (resolved server-side from the Zoho contact — never taken from the request) after the underlying Zoho action succeeds. There is no standalone "send a WhatsApp message" endpoint; notifying is always a side effect of an action the caller could already perform, so a leaked URL can't be used to spam arbitrary messages on its own. A WhatsApp send failure is logged and reported back via a `notified` flag in the response — it never fails or rolls back the Zoho action it rode in on. Recording a payment on a still-draft invoice implicitly transitions it to "sent" (Zoho's own behavior); when that happens and `notify` is true, both the balance notification (with the invoice PDF attached) and the payment notification are sent. Templates are chosen per customer via their Zoho `preferred_language` custom field (`am`/`ar`/`en`); Amharic templates are registered under Meta's `en` language code (see `services/whatsapp/notifications.ts`).
- **WhatsApp webhook**: `GET /api/wa-webhook` handles Meta's subscription verification handshake (`hub.mode`/`hub.verify_token`/`hub.challenge`).
- **Frontend request cache**: `frontend/src/lib/requestCache.ts` is a simple in-memory, module-level cache keyed by string, shared across components for the life of the page. Used for items, customers, draft invoice lists, and individual invoice details — callers pass `{ force: true }` (wired to refresh buttons) to bypass it.

## API overview

All routes are mounted under `/api`.

**Invoices** (`backend/src/routes/invoices.routes.ts`)
- `GET /invoices/drafts` — list all draft invoices
- `GET /invoices/:id` — invoice detail
- `POST /invoices` — create an invoice, or update an existing draft's line items/date if `invoice_id` is included in the body
- `PATCH /invoices/:id/date` — update scheduled date
- `POST /invoices/:id/telegram/resend` — resend the Telegram notification
- `POST /invoices/:id/split` — trim a draft down to selected line items, optionally moving the rest into a new draft
- `POST /invoices/:id/payments` — record a payment (`{ amount, payment_mode?, discount?, notify? }`); `notify: true` sends a WhatsApp payment notification, plus a balance notification if this payment just transitioned the invoice out of draft
- `POST /invoices/:id/status/sent` — mark as sent (`{ notify? }`); `notify: true` sends a WhatsApp balance notification with the invoice PDF attached

**Customers** (`backend/src/routes/customers.routes.ts`)
- `GET /customers` — list customers (cached)
- `POST /customers` — create a customer (all required: contact_name, company_name, phone, customer_sub_type: "business"|"individual", preferred_language: "am"|"ar"|"en")
- `PUT /customers/:id` — update a customer
- `GET /customers/:id` — customer detail
- `GET /customers/:id/invoices/drafts` — all drafts for a customer
- `POST /customers/:id/payments` — record a payment (`{ amount, payment_mode?, notify? }`); `notify: true` sends a WhatsApp payment notification

**Items** (`backend/src/routes/items.routes.ts`)
- `GET /items` — catalog items
- `GET /draftitems` — line items aggregated across all drafts

**Telegram** (`backend/src/routes/telegram.routes.ts`)
- `POST /telegram/messages` — send a message
- `POST /telegram/messages/reply` — reply to a message

**WhatsApp** (`backend/src/routes/wa-webhook.routes.ts`)
- `GET /wa-webhook` — Meta webhook subscription verification (no message-send endpoint is exposed; notifications only ever ride along with the invoice/customer actions above)

**Usage**
- `GET /zoho-usage` — today's Zoho API request count
