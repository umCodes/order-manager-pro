# Order Manager Pro

Internal tool for creating and tracking Zoho Invoice drafts, with Telegram notifications for the fulfillment team. Two apps in this repo: an Express/TypeScript backend that proxies Zoho Invoice + Telegram Bot APIs, and a Vite/React frontend.

## Structure

```
backend/   Express API — Zoho Invoice + Telegram integration, Redis-backed caching
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
| `REDIS_URL` | Redis connection string |
| `PORT` | Backend port (default `3000`) |

## Architecture notes

- **Zoho auth**: `refreshZohoToken` middleware (applied to all `/api` routes) keeps a single in-memory access token fresh and attaches it as the `Authorization` header on every request; it only calls Zoho's token endpoint when the cached token has expired.
- **Zoho request counting**: every call through `ZohoApi()` (`backend/src/services/zoho/client.ts`) increments a Redis counter keyed `zoho:requests:YYYY-MM-DD`, with a 48h TTL so old days expire on their own. `GET /api/zoho-usage` reads today's count; the frontend shows it as a small badge on the New Invoice page header.
- **Draft merging**: creating an invoice for a customer with an existing draft doesn't create a new invoice — it merges into the most-recently-created matching draft (`ZohoGetDraftToMergeInto`). The frontend pre-loads that draft's line items into the cart when a customer is selected, so the line items sent on submit already represent the full desired state; the backend does not append to the draft's existing items itself.
- **Telegram message tracking**: the Telegram message ID for each invoice is stored in Redis (keyed by `invoice_id`) so later actions (adding items, rescheduling) can edit/reply to the original message instead of posting a new one. If a reply fails because the original message was deleted on Telegram's side, the backend falls back to sending a fresh message.
- **Frontend request cache**: `frontend/src/lib/requestCache.ts` is a simple in-memory, module-level cache keyed by string, shared across components for the life of the page. Used for items, customers, draft invoice lists, and individual invoice details — callers pass `{ force: true }` (wired to refresh buttons) to bypass it.

## API overview

All routes are mounted under `/api`.

**Invoices** (`backend/src/routes/invoices.routes.ts`)
- `GET /invoices/drafts` — list all draft invoices
- `GET /invoices/:id` — invoice detail
- `POST /invoices` — create an invoice (merges into an existing draft if one exists for the customer)
- `PATCH /invoices/:id/date` — update scheduled date
- `POST /invoices/:id/telegram/resend` — resend the Telegram notification
- `POST /invoices/:id/payments` — record a payment
- `POST /invoices/:id/status/sent` — mark as sent

**Customers** (`backend/src/routes/customers.routes.ts`)
- `GET /customers` — list customers (cached)
- `GET /customers/:id` — customer detail
- `GET /customers/:id/invoices/drafts` — all drafts for a customer
- `GET /customers/:id/invoices/draft-to-merge-into` — the specific draft (with line items) a new invoice would merge into, or `null`
- `POST /customers/:id/payments` — record a payment

**Items** (`backend/src/routes/items.routes.ts`)
- `GET /items` — catalog items
- `GET /draftitems` — line items aggregated across all drafts

**Telegram** (`backend/src/routes/telegram.routes.ts`)
- `POST /telegram/messages` — send a message
- `POST /telegram/messages/reply` — reply to a message

**Usage**
- `GET /zoho-usage` — today's Zoho API request count
