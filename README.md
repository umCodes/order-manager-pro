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
- **Telegram item numbers**: every item on a Telegram order message is numbered ①, ②, ③ … (circled numbers go up to ㊿; preparers type the plain digit). The numbers are given when the order is first posted and kept per invoice in the Redis hash `telegram:invoice-numbers:<invoice_id>` (30 days, like the thread): a changes reply shows each item's own number, an item added later takes the next free one, and a removed item's number isn't reused. Orders posted before numbering have no stored numbers, so their change replies stay unnumbered.
- **Backup lists**: the Invoice tab's "Items Only" mode posts items to Telegram without a Zoho invoice and keeps them as a backup list, under an id made of the business time (UTC+3) it was sent: `BK-YYYYMMDDHHmmss` (e.g. `BK-20261027154512`), so ids don't depend on a counter. The id heads the message where an invoice number would be, and the items are numbered the same way. Each list (items by Zoho item id, with catalog name, description, quantity, unit and number, plus the Telegram chat/message ids) is kept 30 days in `backup-list:<id>`, found through the sorted set `backup-lists`. Removing a list (from the Items tab, or by deleting its message on the Messages tab) only marks it removed, so the daily report still knows what was open at the end of an earlier day. The Items tab shows the open lists in their own "Backup lists" section, apart from the drafts' items.
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
- `GET /customers/:id/transactions?type=invoices|payments|returns&from=YYYY-MM-DD&to=YYYY-MM-DD` — the customer's invoices (drafts and voided ones left out), payments or returns dated in that period, any length (unlike the 30-day Previous Transactions), with the period's totals; returns carry the invoice they were made against
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
- `GET /backup-lists` — the backup lists not removed yet, newest first
- `DELETE /backup-lists/:id` — remove a backup list and delete its Telegram message (Telegram refuses after 48 hours; the list goes either way)
- `GET /draftitems` — line items aggregated across all drafts; each breakdown entry carries its source draft's `date` so the Items tab can group by day

**Telegram** (`backend/src/routes/telegram.routes.ts`)
- `POST /telegram/messages` — send a message
- `POST /telegram/messages/reply` — reply to a message
- `POST /telegram/items-list` — `{ line_items, date? }` → posts the items without an invoice and keeps them as a backup list; returns `{ message, list }`

**WhatsApp** (`backend/src/routes/wa-webhook.routes.ts`)
- `GET /wa-webhook` — Meta webhook subscription verification (no message-send endpoint is exposed; notifications only ever ride along with the invoice/customer actions above)

**Returns** ("Return Invoice" = Zoho credit note)
- `GET /invoices/:id/returns` — per item: invoiced, already returned, returnable, credited price; plus past returns
- `POST /invoices/:id/returns` — `{ items: [{ item_id, quantity }], reason? }` → creates the credit note, applies credit to the invoice's balance

**Daily report** (`backend/src/routes/reports.routes.ts`) — business days run 4am to 4am (UTC+3); what happens each day is recorded in Redis as it happens (`services/dailyReport/store.ts`), kept 7 days after the day ends, or 3 days once its report is handed over (downloaded, or delivered on WhatsApp)
- `GET /reports/daily/days` — the current and previous business day, and whether WhatsApp sending is set up
- `GET /reports/daily?day=YYYY-MM-DD` — the day's Amharic PDF report; `&download=1` as an attachment. Its undelivered orders are every draft dated that day or earlier (read from Zoho, so an order stays on each day's report until delivered), plus, for a past day, orders delivered only after it ended. Its last section totals, per item, the items of every backup list still open when the day ended (or now, for the running day)
- `POST /reports/daily/send` — `{ day }` → sends the PDF on WhatsApp to the numbers chosen in Settings, with the chosen template (document header; `{{1}}` date, `{{2}}` sales, `{{3}}` payments collected, `{{4}}` invoices issued, `{{5}}` outstanding)
- `POST /reports/daily/scheduled` — for a scheduler (e.g. cron-job.org, daily just after 4am business time): sends the business day that just ended, like `/reports/daily/send`. Needs the `X-Cron-Secret` header to equal the `CRON_SECRET` env var (unset: refused). Answers `202` at once and sends in the background; each day is sent once (a repeat answers `200` "Already sent"); a send that fails for every number can be retried. `400` when the template or numbers aren't set in Settings
- `GET` / `PUT /settings/daily-report-whatsapp` — that template (approved or under review) and up to 3 numbers
- `GET` / `PUT /settings/invoice-due` — how long new invoices have before they're overdue (their due date, set when created): `{ period: "month" }` (default, one calendar month) or `{ period: "days", days: 0–365 }`
- `GET` / `PUT /settings/general-items` — `{ item_ids }`, up to 3 "general items": catalog items whose unit (normally pieces) can be changed on each invoice line when they're added (the line's `unit` is sent to Zoho, and Telegram and the PDFs follow it as usual). Until it's saved, it's Zoho's "General-Item" (`4645478000000084021`) and "General Stuff" (`4645478000004531006`)
- `GET` / `PUT /settings/general-items-whatsapp` — `{ template, recipient }`: when an invoice is created, or a draft updated, with a general item line, the line's description is sent with that template to that number (in the background; never fails the invoice). The template's body variables are filled in order, as many as it has (1–4): `{{1}}` description, `{{2}}` quantity and unit, `{{3}}` customer, `{{4}}` invoice number; its header can't have variables or media. Each line is sent once per invoice (Redis set `general-items:notified:<invoice_id>`, 30 days, by item and description), so a draft update only sends general lines it didn't have. Nothing is sent until both are set

**Customer visits** (`backend/src/routes/visits.routes.ts`) — kept in Redis (`visits:scheduled`, one per customer; `visits:log` of done ones); days are business days (4am to 4am). Customers with a visit not done yet are pinned on the Customers tab, with a banner and a tab badge. A payment, an invoice marked as sent (delivery) or a return for the customer confirms their scheduled visit automatically, whatever day it was for.
- `GET /visits` — visits not done yet, the current business day, and the latest done ones
- `PUT /customers/:id/visit` — `{ day, customer_name }` → schedule or move the visit; `DELETE` cancels it
- `POST /customers/:id/visit/done` — `{ method: "location", position: { lat, lng, accuracy } }` compares the phone with the customer's map link (short links are followed and cached; within 200 m counts as at the customer), or `{ method: "not_checked" | "payment" | "delivery" | "return" }`
- `POST /customers/:id/location` — `{ lat, lng }` → saves a phone position as the customer's map link (on their existing address)
- `GET /geocode/reverse?lat=&lng=` — `{ street, district, city }` in English for a point, from OpenStreetMap's Nominatim (free, no key; cached a month in Redis) — for the customer form's "Use my location", which also sets the Google Maps link to that point

**Usage**
- `GET /zoho-usage` — today's Zoho API request count
