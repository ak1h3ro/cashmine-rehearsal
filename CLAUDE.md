# CashMine take-home

2-hour take-home for CashMine (crypto exchange aggregator with payback).
Expo SDK 58 + TypeScript, web build served as static assets on Cloudflare Workers, used on a phone (~390 px wide).
Brief: docs/brief.md. API docs: docs/api.md (copy of https://task-api.cashmine.io/docs).

See AGENTS.md for Expo rules. Before using an Expo / React Native / Expo Router API
you are not sure about, check the SDK 58 docs (docs.expo.dev/versions/v58.0.0/).

## Structure
- Routes only in src/app/ (every file is a screen; _layout.tsx defines navigators).
- Data: src/lib/<entity>.ts = zod schema, `type X = z.infer<...>`, query keys, hooks.
- HTTP: src/lib/api.ts. API_BASE_URL is defined there and nowhere else. The app calls the
  API directly from the browser (CORS is open) with `Authorization: Bearer <token>`.
- Screens wrap content in Screen (src/components/screen.tsx).

## Rules
- Money, prices, fees: decimal strings + big.js only, never float / Number() / parseFloat.
  Round only for display. Always show the asset or USD.
- Validate every response with zod. Tell me which fields you made optional and why.
- Every screen handles loading, error with Retry, and empty states.
- Web-safe APIs only: no Alert.alert (errors inline), no expo-secure-store, FlatList not FlashList.
- Server state lives in TanStack Query; no global state library.
- No new dependencies without asking me first. Expo packages via `npx expo install`.

## Token
- The user enters the API token in the app on first open; it is kept in localStorage and
  can be changed from the UI. 401 sends the user back to the token screen.
- The token never appears in code, tests, fixtures, logs, commits or the build.
- Never read or print .dev.vars or .dev.vars.*.

## SDK 58 gotchas
- <Link asChild> with a style array on the child crashes at runtime: use StyleSheet.flatten([...]).
- useTheme, DarkTheme, DefaultTheme, ThemeProvider, Stack come from 'expo-router';
  @react-navigation/native is not installed.
- RefreshControl: onRefresh={() => void refetch()}.
- Tests: import { describe, expect, it } from '@jest/globals'.
- After adding a route file, typed routes update only when expo start restarts;
  a tsc error on href may be stale.

## Workflow
- One slice per request. If a request needs more than that, stop and ask.
- After each slice run `npm run typecheck && npm test`, then tell me what changed
  and what to check in the browser.
- For a bug, confirm the cause and tell me before changing code.
- Never delete files without listing them and waiting for my OK.
- Do not commit or push unless I ask. Git commands one at a time, never chained.
