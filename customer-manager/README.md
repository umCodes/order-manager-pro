# Customer Manager

A standalone, single-purpose app for adding and editing customers — nothing
else. It talks to the same backend as the main `frontend` app (no new
backend, no new database), it just gives customer data entry its own
focused, easy-to-use screen instead of living inside the full order-manager
app's tab bar and invoice flow.

Two screens only:
- **List** — search existing customers by name, company, or phone; tap one
  to edit it.
- **Form** — add a new customer or edit an existing one: contact name,
  company name, phone (new customers only), customer type, business type,
  preferred language, and address (city, district, street).

## Running it

```
cp .env.example .env   # point VITE_API_BASE_URL at your backend
npm install
npm run dev
```

By default it expects the backend at `http://localhost:3000/api` — see
`.env.example`.

## Deploying it separately from the main frontend

If this is deployed at its own URL, set `CUSTOMER_MANAGER_URL` in the
backend's environment (alongside the existing `FRONTEND_URL`) so the
backend's CORS allow-list includes it — see `backend/src/app.ts`.
