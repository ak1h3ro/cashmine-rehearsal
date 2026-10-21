# CashMine payback (take-home)

Expo (SDK 58) web app for viewing payback balances and claiming them, built for a phone screen (~390 px).

**Live:** https://cashmine-rehearsal.d-a-stiranets.workers.dev

Decisions and known issues are in [NOTES.md](NOTES.md).

## Run locally

```bash
npm install
npm run web
```

Open the URL Expo prints and paste your API token on the first screen. The token is kept only in this
browser's localStorage, never in the code or the build. The API is called directly from the browser
(`API_BASE_URL` in `src/lib/api.ts`).

## Test

```bash
npm test            # unit tests (Jest)
npm run typecheck
npm run lint
```

## Deploy

```bash
npm run deploy
```

Builds the web app (`expo export -p web`) and uploads `dist/` to Cloudflare Workers as static assets
(`wrangler.toml`). It needs your own Cloudflare account (`npx wrangler login`), and there are no secrets to set.

## What works

- **Token:**
  - Asked for on first open and checked against the API before saving. A rejected token (401) gets an inline error; if the check fails for any other reason, the token is saved anyway.
  - Changeable from the "Token" link in the Balances header.
  - Any 401 sends the user back to the token screen.
- **Balances:**
  - Each asset shows available, pending and claiming in its own unit (exact server amounts) and in USD.
  - The header shows the total available in USD, with the pending and claiming totals below it.
  - "Updated Xs ago" is based on the snapshot time. Balances refresh every 15 s, and there's a Refresh button.
  - If a refresh fails while data is on screen, the data stays with an inline "Couldn't refresh" message and Retry. A separate message says when the browser is offline.
  - Loading, error and empty states are handled.
- **Claim:**
  - Amount field (a comma is accepted as the decimal point) and a Max button.
  - Checked against the API rules: amount format, the asset's number of decimal places, the minimum and the available amount. The amount must also be more than the fee.
  - Shows the fee and the amount you receive, and a destination picker when there is more than one destination.
  - A confirm step comes before submitting, and Confirm is disabled while offline.
- **Claims are never sent twice:**
  - Each claim is saved in localStorage, with its Idempotency-Key and exact request body, before it is sent. Saved claims are kept per token.
  - If the result is unknown (network error, 15 s timeout, 5xx/504, or a response that can't be read), the app retries with the same key and body. A 429 waits the time the server asks for.
  - After 2 minutes it shows "Couldn't confirm yet" with a Check again button. Unfinished claims are retried again after a reload.
  - While a claim is being checked or is still pending, no new claim can be started for that asset.
- **Tracking:**
  - `/claims/[id]` follows a claim until it completes or fails and shows the failure reason.
  - Pending claims are also checked every 2.5 s in the background.
- **Balance right after a claim:** a claim the current snapshot doesn't include yet is taken off available straight away. A still-pending claim is also added to claiming. An older snapshot can't undo this, and a failed claim is no longer subtracted.
- **Tests:** 49 unit tests covering amount parsing and validation, the fee and receive amount, USD totals, the balance adjustment, and the claim sender (retries, idempotency, locking, 409/429/unknown outcomes).

## What doesn't (yet)

- **Activity** (the paginated history) isn't built.
- **Pull-to-refresh** doesn't work on web (react-native-web ignores it), so use the Refresh button.
- **Two open tabs** don't share claim state.
- **A claim refused in the background** (e.g. after a reload) only shows its message on that asset's Claim screen.
- **Only tested on web**, not as a native iOS/Android build.
