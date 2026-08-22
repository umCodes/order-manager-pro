# Order Manager Pro — Backend

Express + TypeScript API that proxies Zoho Invoice and the Telegram Bot API. See the [repo root README](../README.md) for environment variables and the full API reference.

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
- Creating an invoice for a customer with an existing draft merges into the most-recently-created matching draft (`ZohoGetDraftToMergeInto` in `services/zoho/invoices.ts`) rather than creating a new one. The submitted line items are sent as-is on merge — the caller is expected to already include the draft's existing items if it wants them kept, not just the new ones.

## Telegram integration notes

- `services/telegram/invoices.ts` builds the invoice notification text (with Amharic day/weekday labels) and sends/edits/replies via `services/telegram/messages.ts`.
- If replying to a previous invoice message fails (e.g. it was deleted on Telegram without Redis knowing), the code falls back to sending a fresh message rather than failing the request.
