# Notes

## Decisions

### Amounts
Amounts stay decimal strings everywhere and all maths goes through big.js. I only round when showing a value. Asset amounts are shown as the server sends them, just with thousands separators. USD is calculated at full precision and rounded to 2 dp on screen, and anything non-zero under a cent shows as "< 0.01 USD" rather than 0.00. Input accepts a comma as the decimal point and is normalised to the form the API wants ("05" becomes "5", "0.50" becomes "0.5") before I validate or send it.

### Balance right after a claim
I asked the AI for options before choosing (search "at least two approaches" in the log). It gave four: show only the server snapshot with a notice, an optimistic update reconciled by asOf, hide the number until it's fresh, or show a projected "after" line. I picked the reconciled optimistic update.

When a claim is accepted, I take its amount off available and show it under claiming, but only on snapshots older than the claim (asOf <= createdAt, both server times). Once a newer snapshot arrives, the server number already includes the claim and I drop my adjustment. So the balance drops right away, which answers the first complaint, and a stale snapshot can't bring it back up, which answers the second. The only real jump up is a failed claim, and the app says why. Exchanges do the same thing with free and locked funds on the server; I do it on the client because the snapshot can lag by up to about 30 s.

If asOf equals createdAt, I treat the claim as not included yet. If that's wrong, the balance is a bit too low for one cycle, never too high. I didn't take the notice-only option because the number stays unchanged, which is how the first user ended up claiming twice. Hiding the number looks broken for up to 30 s, and two numbers on screen make people guess which one is theirs.

### Unknown claim outcome
Every claim gets one Idempotency-Key. I save it in localStorage with the exact JSON body before sending, and if the save fails, nothing is sent. A network error, my 15 s timeout, a 5xx or 504, or a 2xx I can't read all count as unknown. The app then retries with the same key and body for about two minutes, waits retryAfterMs on a 429, and after that shows "Couldn't confirm yet" with a Check again button. Until it's resolved the amount is locked, the balance isn't adjusted, and that asset can't start another claim. A 400 or 409 is final. Saved claims are kept per token, so on a shared phone a claim never resumes under someone else's token.

This happened for real during the task: the first POST got a 504, the retry with the same key got 200 with `Idempotent-Replayed: true`, and Activity shows exactly one claim (docs/idempotent-replay.png).

### Other decisions
- The token is checked against /v1/balances when saved. A 401 rejects it. Any other error saves it anyway, so a flaky server can't lock people out.
- The API has open CORS, so the app calls it directly. I prepared the scaffold the day before (commits from 2026-10-20) with a Worker proxy that held the token as a secret, and removed the proxy because the brief doesn't allow the token in the build.
- TanStack Query pauses requests when the browser is offline instead of failing them, so Balances shows "You're offline" instead of spinning forever. Claims are sent outside TanStack so they never sit paused.
- Pending claims are polled in the background, so the asset lock and the balance adjustment follow the real status.

## Working with AI

All code came from one Claude Code session: [ai-logs/main-chat.md](ai-logs/main-chat.md). Search the quoted phrases to find each moment.

1. A prompt that didn't work. I sent the kickoff before the brief was in the repo, so the plan missed the USD total, data freshness, Max and the confirm step. I added docs/ and sent my answers again with the missing requirements ("Re-read the brief").
2. AI output that was wrong. The AI said S2 was done, including "a double tap creates one claim". When I read the code, every Confirm press made a new Idempotency-Key and the button stayed enabled, so two quick taps could create two real claims. We fixed it with one key per confirm step, a lock inside the sender and a test ("double-submit hole"). Earlier it said going offline would show an error banner; on the live link the screen just spun with no requests, and it turned out TanStack pauses queries offline ("onlineManager"). I also found tests that checked less than their names said ("don't prove what their names say").
3. Disagreeing with the AI. To stop a pending claim from locking its asset forever, the AI added a 60 s timer. I said no: a timer guesses, and the server can tell us. Polling pending claims fixed the lock and also two other gaps, a failed claim still lowering the balance and a completed one still shown as claiming ("don't want the 60 s cap").

The AI also caught something I'd missed: a saved claim could resume under a different token on a shared phone. I fixed it by keeping claims per token ("Poke holes").

## Not done / known issues
- Two open tabs don't share claim state. The server still deduplicates their retries, but the other tab's UI won't know.
- A claim refused in the background (for example after a reload) only shows its message on that asset's Claim screen.
- Activity uses a Load more button instead of loading on scroll, and only accepts the statuses in the docs. An unknown status fails the page with Retry.
- Reloading while offline shows the browser's offline page, there's no service worker.
- Pull-to-refresh doesn't work on web, so there's a Refresh button.
- The failed-claim screen says the money came back twice.

Next I'd want the server to return balances that include fresh claims, or push updates, so the client adjustment can go. I'd also add an end-to-end test of the claim flow against a mocked API.
