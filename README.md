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
| `WA_BUSINESS_ACCOUNT_ID` | Optional. WhatsApp Business Account ID that owns the message templates (Messages → WhatsApp → Templates). When unset, it's looked up from the accounts `WA_TOKEN` was granted |
| `WA_APP_ID` | Optional. Meta app ID, used to upload the sample file a template with a document / image / video header needs for review. When unset, it's read from `WA_TOKEN` |
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
- **WhatsApp customer notifications are opt-in per action, decided server-side**: `POST /invoices/:id/payments` and `POST /invoices/:id/status/sent` (and `POST /customers/:id/payments`) accept an optional `notify: boolean` in the body. When `true`, the backend sends a WhatsApp template message to the invoice/customer's phone number (resolved server-side from the Zoho contact — never taken from the request) after the underlying Zoho action succeeds. Template notifications are always a side effect of an action the caller could already perform (or an on-demand resend of one, to the customer's own contacts), so a leaked URL can't be used to spam arbitrary numbers. The only free-text send is the WhatsApp chat reply (below), which is refused unless that number has messaged in within the last 24 hours. A WhatsApp send failure is logged and reported back via a `notified` flag in the response — it never fails or rolls back the Zoho action it rode in on. Recording a payment on a still-draft invoice implicitly transitions it to "sent" (Zoho's own behavior); when that happens and `notify` is true, both the balance notification (with the invoice PDF attached) and the payment notification are sent. Templates are chosen per customer via their Zoho `preferred_language` custom field (`am`/`ar`/`en`); Amharic templates are registered under Meta's `en` language code (see `services/whatsapp/notifications.ts`). In the app's chat history these notifications are recorded as a list — customer name, then invoice number / amount / paid / previous balance / total balance (balance notice) or amount paid / date / remaining balance (payment confirmation) — labelled in the same language the customer's template went out in.
- **WhatsApp webhook**: `GET /api/wa-webhook` handles Meta's subscription verification handshake (`hub.mode`/`hub.verify_token`/`hub.challenge`).
- **WhatsApp chats**: the Messages page's WhatsApp tab lists customers (plus any other number that has written in) and shows each conversation. History lives in Redis under `chats:*` keys with a 7-day TTL: the webhook Lambda (`wa-webhook-lambda/state/chatStore.mjs`) writes inbound messages and delivery/read statuses, plus each sender's WhatsApp profile name (`chats:profiles`, used to name chats with numbers no Zoho customer has — shown with a "~" and a "WhatsApp name" tag), and the backend (`services/whatsapp/chatStore.ts`) writes everything it sends — template notifications (with a readable summary) and text replies — in the same layout. Replies (text, files, photos and voice notes) are free-form, so they're only allowed within WhatsApp's 24-hour window after the contact's last message; the backend enforces that before sending. Voice notes are recorded in the browser straight to Ogg/Opus with `opus-recorder` — the format WhatsApp plays as a voice note, which browsers' own MediaRecorder mostly can't produce — so the backend needs no audio conversion. Images, voice notes and files in the history are shown inline, fetched through the backend. Template sends are recorded with their parameters, including ones WhatsApp rejects outright (stored as failed with its reason); the Lambda stores the failure reason from failed status webhooks and never moves a status backwards. A failed template, or one still only "sent" an hour later, can be sent again from the chat (`POST /whatsapp/chats/:phone/messages/:messageId/retry`) — same template and parameters, same number, once per message.
- **WhatsApp chat list order**: chats with unread messages always come first, then the rest by most recent conversation. A toggle next to the search cycles All → Read → Unread → All (All by default). A number that is a contact person under a customer is listed under the person's name, with the customer's as a secondary label. A customer's contact cards open that contact's chat in the app (separately from the button that opens WhatsApp itself); tapping a contact's underlined number offers to call it.
- **Unread WhatsApp badges**: "unread" means a customer message that arrived after the chat was last opened in the app (not WhatsApp's own read receipts, which are about the customer). The backend keeps a last-opened time per chat in the Redis hash `chats:read` (shared by every device); history from before the feature was first used counts as read (`chats:read:since`). `GET /whatsapp/unread` returns the counts (only chats with activity since they were read are scanned); opening a chat calls `POST /whatsapp/chats/:phone/read`. The app (`frontend/src/lib/unread.ts`) shows them on the Messages tab, the WhatsApp toggle and each chat, refreshing on start, on returning to the app, and once a minute while it's on screen.
- **Return Invoice (Zoho credit notes)**: the app calls them "Return Invoice"; internally each is a Zoho credit note created with `POST creditnotes?invoice_id=<original>`. The user picks items in the usual item sheet, limited to the invoice's own items and how many of each can still be returned (invoiced − already returned). Customer, item, price, tax and unit all come from the original invoice, never from the request; the price credited is the line's price after its own and any invoice-wide discount. The backend re-checks quantities under a per-invoice Redis lock. Zoho can't list credit notes by invoice, so the ids of returns made in the app are kept in the Redis set `invoice-returns:<invoice_id>` and re-read from Zoho on each check (deleted / void ones stop counting); returns made directly in Zoho aren't known to the app. After creating, any credit up to the invoice's unpaid balance is applied to it (the rest stays as customer credit), and the optional reason is added as a credit note comment.
- **Frontend request cache**: `frontend/src/lib/requestCache.ts` is a simple in-memory, module-level cache keyed by string, shared across components for the life of the page. Used for items, customers, draft invoice lists, and individual invoice details — callers pass `{ force: true }` (wired to refresh buttons) to bypass it.

## API overview

All routes are mounted under `/api`.

**Invoices** (`backend/src/routes/invoices.routes.ts`)
- `GET /invoices/drafts` — list all draft invoices, each with its customer's custom fields attached as `customer_custom_fields` (joined from the cached customer list — never one request per customer)
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
- `GET /customers/:id/payments` — the customer's payments, newest first
- `POST /customers/:id/payments` — record a payment (`{ amount, payment_mode?, notify? }`); `notify: true` sends a WhatsApp payment notification
- `POST /customers/:id/payments/:paymentId/notify` — send the WhatsApp payment confirmation for an existing payment (`{ notify_contact_ids? }`)

**WhatsApp** (`backend/src/routes/whatsapp.routes.ts`)
- `GET /whatsapp/chats` — contact list: customers with a phone, plus other numbers with history, most recent conversation first; each with `city` / `district` from the customer's address, which the WhatsApp tab filters by (city chips when there's more than one city, then All + district chips, most common first)
- `GET /whatsapp/chats/:phone/messages` — a conversation's stored history and whether a reply is currently allowed (`can_reply`)
- `POST /whatsapp/chats/:phone/messages` — send a free-text reply (`{ text }`); refused outside the 24-hour window
- `POST /whatsapp/chats/:phone/messages/:messageId/retry` — send a failed or undelivered template message again
- `GET /whatsapp/chats/:phone/contact/lookup?customer_id=` — before linking a number to a customer: whether it's already one of that customer's contact persons, and their name
- `PUT /whatsapp/chats/:phone/contact` — save a number that isn't any customer's own phone to the app's contact list: `{ name }` names it, `{ customer_id, name? }` links it to a customer — as the contact person with that number if the customer has one (their name wins), else as the optional `name`. A linked number is listed under the person's name, with the customer's name as a secondary label (`customer_name`), and the customer's city / district. Stored in the Redis hash `chats:saved` with no TTL, so a saved number stays listed after its history expires; a saved name / link takes precedence over the WhatsApp profile name
- `DELETE /whatsapp/chats/:phone/contact` — remove a saved name / customer link
- `DELETE /whatsapp/templates/:id` — delete one template (that name in that language only). The templates configured as `WA_*_NOTIFICATION_TEMPLATE_*` can't be deleted
- `POST /whatsapp/chats/:phone/media` — send a file as a reply: raw bytes as `application/octet-stream`, with `X-File-Type` / `X-File-Name` headers and optional `?caption=` / `?voice=1`. JPEG/PNG up to 5 MB go as images, MP4/3GP as video, Ogg/MP3/M4A/AAC/AMR as audio (an Ogg/Opus recording from the app as a voice note), anything else as a document; 16 MB max; same 24-hour rule as text
- `GET /whatsapp/chats/:phone/messages/:messageId/media` — the image / voice note / file of a message in that conversation, downloaded from WhatsApp

**Items** (`backend/src/routes/items.routes.ts`)
- `GET /items` — catalog items
- `GET /draftitems` — line items aggregated across all drafts; each breakdown entry carries its source draft's `date` so the Items tab can group by day

**Telegram** (`backend/src/routes/telegram.routes.ts`)
- `POST /telegram/messages` — send a message
- `POST /telegram/messages/reply` — reply to a message

**WhatsApp** (`backend/src/routes/wa-webhook.routes.ts`)
- `GET /wa-webhook` — Meta webhook subscription verification (no message-send endpoint is exposed; notifications only ever ride along with the invoice/customer actions above)

**Returns** ("Return Invoice" = Zoho credit note)
- `GET /invoices/:id/returns` — per item: invoiced, already returned, returnable, credited price; plus past returns
- `POST /invoices/:id/returns` — `{ items: [{ item_id, quantity }], reason? }` → creates the credit note, applies credit to the invoice's balance

**Prepare & deliver** (`backend/src/routes/prep.routes.ts`) — warehouse screens in the frontend, with none of the office tabs: `/prep` for preparers (step 1 Prepare, step 2 Send) and `/driver` for delivery drivers (Receive). Each draft line is recorded in three steps — how much was prepared, how much was sent, how much the driver received — any amount of 0 or more. A received amount that differs from what was sent is a conflict, flagged on both screens and in the copied day report
- `GET /prep/orders` — every draft with its lines (internal `###` lines left out), each with `prepared` / `sent` / `received` (`null` = not done yet)
- `PUT /prep/orders/:id/:step` — `step` is `prepared`, `sent` or `received`; `{ lines: [{ line_item_id, quantity }] }` (`quantity: null` clears a line). Stored only in Redis (`prep:lines:<invoice_id>` hash, one field per line and step so the preparer and driver never overwrite each other; 60-day TTL); the Zoho invoice is never changed by this

**Usage**
- `GET /zoho-usage` — today's Zoho API request count
