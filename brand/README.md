# Brand

`logo/` holds the app's logo as delivered: three colour variations of the same mark (a receipt with a check, and a parcel), each as a **solid** icon (rounded square background) and **transparent** (the mark alone), in SVG and 1024×1024 PNG.

| File | Look |
|---|---|
| `logo-1-amber-*` | amber background, cream receipt, brown parcel — **the one the app uses** |
| `logo-2-brown-*` | dark brown background, cream receipt, amber parcel |
| `logo-3-bold-*` | amber background, dark receipt, brown parcel |

This is the **app's** logo (home-screen icon, launch screen, header, browser tab). The company's own logo on invoices and PDFs is separate and unchanged.

## Where the app uses it (`frontend/public/`)

| File | Made from | Used for |
|---|---|---|
| `logo.svg`, `favicon.svg` | `logo-1-amber-solid.svg` as is | launch screen, header, browser tab |
| `app-icon.png` (180), `app-icon-192.png`, `app-icon-512.png` | the same, square (no rounded corners: iOS and Android round them) | iPhone home screen (`apple-touch-icon`), Android / install icon |
| `app-icon-maskable-512.png` | the same, square, mark scaled to 0.9 so it fits Android's shaped-icon safe zone | Android adaptive icon |

To switch to another variation, regenerate these from its `-solid.svg` (same edits: remove the background's `rx` for the square ones; change the mark's `scale(1.12)` to `scale(0.9)` for the maskable one).
