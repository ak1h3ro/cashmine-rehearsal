import { ApiError, apiPost } from '@/lib/api';
import { redirectOnUnauthorized } from '@/lib/auth';
import {
  addRecord,
  type ClaimRecord,
  currentBucket,
  getRecord,
  isUnresolved,
  readRecords,
  updateRecord,
} from '@/lib/claim-store';
import { ClaimSchema } from '@/lib/claims';

/**
 * Sends claims with a persisted Idempotency-Key. When the outcome is unknown
 * (network error, our timeout, 5xx/504, a 2xx we cannot read) the same key and
 * the same body are retried automatically: the server replays the original
 * claim instead of creating a second one. Not a TanStack mutation on purpose:
 * a mutation pauses silently while offline, and this has to survive reloads.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_WINDOW_MS = 120_000;
const MAX_BACKOFF_MS = 15_000;

const inFlight = new Map<string, Promise<void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export class ClaimNotSavedError extends Error {}

/** The asset already has a claim in flight; a second one is not started. */
export class ClaimInProgressError extends Error {}

// A created claim settles in about 20 s. The record's status is only refreshed
// while the tracking screen is open, so do not trust "pending" for longer.
const BLOCK_CREATED_PENDING_MS = 60_000;

function blocksNewClaim(record: ClaimRecord, now: number): boolean {
  if (isUnresolved(record)) return true;
  const claim = record.state === 'created' ? record.claim : undefined;
  return claim?.status === 'pending' && now - Date.parse(claim.createdAt) < BLOCK_CREATED_PENDING_MS;
}

let onClaimCreated: (() => void) | undefined;

/** Called whenever a claim is confirmed to exist (used to refetch balances at once). */
export function setOnClaimCreated(handler: (() => void) | undefined) {
  onClaimCreated = handler;
}

type NewClaim = {
  asset: string;
  amount: string;
  destinationId: string;
  destinationLabel: string;
  fee: string;
  receiveAmount: string;
};

/**
 * Saves the claim, then sends it. `key` is created once when the confirm step
 * opens, so pressing Confirm twice reuses it: an already saved key is neither
 * saved nor sent again.
 * Throws ClaimInProgressError if the asset already has a claim in flight, and
 * ClaimNotSavedError (sending nothing) if the claim cannot be saved.
 */
export function submitClaim(input: NewClaim, key: string): string {
  const bucket = currentBucket();
  if (!bucket) throw new ClaimNotSavedError('No token');
  if (getRecord(bucket, key)) return key;
  const now = Date.now();
  if (readRecords(bucket).some((r) => r.asset === input.asset && blocksNewClaim(r, now))) {
    throw new ClaimInProgressError(`A claim for ${input.asset} is already in progress`);
  }
  const body = JSON.stringify({ asset: input.asset, amount: input.amount, destinationId: input.destinationId });
  try {
    addRecord(bucket, {
      key,
      asset: input.asset,
      body,
      amount: input.amount,
      fee: input.fee,
      receiveAmount: input.receiveAmount,
      destinationLabel: input.destinationLabel,
      state: 'checking',
      uncertain: false,
      attempts: 0,
      windowStartedAt: now,
    });
  } catch {
    throw new ClaimNotSavedError('Could not save the claim');
  }
  void attempt(bucket, key);
  return key;
}

/** "Check again": one attempt now, even after the retry window ran out. */
export function checkAgain(key: string): Promise<void> {
  const bucket = currentBucket();
  const record = bucket ? getRecord(bucket, key) : undefined;
  if (!bucket || !record || !isUnresolved(record)) return Promise.resolve();
  return attempt(bucket, key);
}

/** After a reload or a token change: retry every unresolved claim of the current token, with a fresh window. */
export function resumeClaims() {
  const bucket = currentBucket();
  if (!bucket) return;
  for (const record of readRecords(bucket)) {
    if (!isUnresolved(record)) continue;
    updateRecord(bucket, record.key, { state: 'checking', windowStartedAt: Date.now() });
    void attempt(bucket, record.key);
  }
}

/** One request at a time per claim: a second call joins the one in flight. */
function attempt(bucket: string, key: string): Promise<void> {
  const id = `${bucket}:${key}`;
  const running = inFlight.get(id);
  if (running) return running;
  clearTimeout(timers.get(id));
  timers.delete(id);
  const promise = send(bucket, key).finally(() => inFlight.delete(id));
  inFlight.set(id, promise);
  return promise;
}

async function send(bucket: string, key: string) {
  const record = getRecord(bucket, key);
  if (!record || !isUnresolved(record)) return;
  // Never send a claim saved under one token with another token.
  if (currentBucket() !== bucket) return;

  const attempts = record.attempts + 1;
  updateRecord(bucket, key, { attempts });
  try {
    const claim = await apiPost('/v1/claims', record.body, ClaimSchema, {
      headers: { 'Idempotency-Key': key },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 201, or 200 replaying the original claim (which may already be settled).
    updateRecord(bucket, key, { state: 'created', claim });
    onClaimCreated?.();
    return;
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http') {
      if (error.status === 400 || error.status === 404) {
        // Refused: nothing was created.
        updateRecord(bucket, key, { state: 'rejected', error: error.message, errorField: error.field });
        return;
      }
      if (error.status === 409) {
        updateRecord(bucket, key, {
          state: 'rejected',
          error: 'This claim key was already used with different details. Nothing new was sent.',
        });
        return;
      }
      if (error.status === 401) {
        // Keep the claim; it resumes once the same token is accepted again.
        redirectOnUnauthorized(error);
        return;
      }
      if (error.status === 429) {
        schedule(bucket, key, error.retryAfterMs ?? 2000);
        return;
      }
    }
    // 5xx, 504, network error, our timeout, unreadable 2xx: the outcome is unknown.
    updateRecord(bucket, key, { uncertain: true });
    schedule(bucket, key, Math.min(1000 * 2 ** (attempts - 1), MAX_BACKOFF_MS));
  }
}

function schedule(bucket: string, key: string, delayMs: number) {
  const record = getRecord(bucket, key);
  if (!record) return;
  if (Date.now() + delayMs - record.windowStartedAt > RETRY_WINDOW_MS) {
    updateRecord(bucket, key, { state: 'stalled' });
    return;
  }
  const id = `${bucket}:${key}`;
  timers.set(
    id,
    setTimeout(() => void attempt(bucket, key), delayMs),
  );
}
