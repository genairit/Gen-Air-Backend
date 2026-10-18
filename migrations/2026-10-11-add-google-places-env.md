# Add Google Places API key

Date: 2026-10-11

## What to add

`GOOGLE_PLACES_API_KEY` — optional. Without it the server runs, but the `/address` endpoints answer
`503` and no project address can be verified.

## Why

Every project needs a Google-verified address. The server proxies Google Places (New) so the key
never reaches the browser: `GET /address/suggestions` returns autocomplete suggestions, and
`GET /address/places/:placeId` resolves a picked suggestion into the verified address and city.
Because the server resolves the place id itself, a client cannot submit an address it never picked.

## Value

A Google Cloud API key, for example `AIzaSyExampleExampleExampleExample000`. Never commit the key.

## One-time setup in Google

Use the shared Gen-Air Google Cloud project. Google Drive (`2026-10-07-add-google-drive-env.md`)
belongs in the same project, so there is one bill and one place to manage credentials.

1. Link a billing account to the project. Places is billed per request, with a monthly free
   allowance per SKU.
2. Enable **Places API (New)**.
3. Create an API key, restrict it to **Places API (New)** only, and, where the server has a fixed
   outbound IP, restrict it to that IP.
4. Cap spending: add a budget alert under **Billing → Budgets & alerts**, and lower the daily
   request quotas under **APIs & Services → Places API (New) → Quotas**, so a bug cannot run up a bill.
