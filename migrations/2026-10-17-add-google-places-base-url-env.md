# Add GOOGLE_PLACES_BASE_URL

Date: 2026-10-17

## What to add

`GOOGLE_PLACES_BASE_URL` — optional. Defaults to `https://places.googleapis.com/v1`.

## Why

The Gen-Air-Automation end-to-end suite runs the server against a local fake Google Places server,
so project creation (which verifies the address server-side) can be tested without a real key,
network access or billing. Production and development environments leave it unset.

## Value

A base URL serving the Places API (New) `places:autocomplete` and `places/:placeId` routes, for
example `http://localhost:4100/v1`. Only the automation environment sets it.
