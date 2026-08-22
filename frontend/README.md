# Order Manager Pro — Frontend

Vite + React app for creating and tracking Zoho Invoice drafts. See the [repo root README](../README.md) for the full project overview, environment setup, and API reference.

## Scripts

```
npm run dev       # start the dev server
npm run build     # type-check and build for production
npm run lint      # eslint
npm run preview   # preview the production build
```

## Pages

- **New Invoice** (`src/pages/NewInvoicePage.tsx`) — pick a customer, optional scheduled date, and line items. If the customer has an existing draft, its line items are loaded into the cart automatically.
- **Drafts** (`src/pages/DraftsPage.tsx`) — sortable list of draft invoices, with a background prefetch of each draft's line items so the Copy button can write to the clipboard synchronously.
- **Items** / **Customers** — catalog and customer browsing.
- **Invoice Details** / **Customer Details** — detail views pushed over the tabbed pages (no URL routing; navigation is plain component state in `App.tsx`).

## Notes

- `src/lib/api.ts` holds all backend fetch calls; `src/lib/requestCache.ts` is the shared in-memory GET cache they use.
- Cart state lives in `App.tsx` (not inside `NewInvoicePage`) so it survives switching tabs.
- Set `VITE_API_BASE_URL` if the backend isn't reachable at the default `/api` path.
