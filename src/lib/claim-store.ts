import { useSyncExternalStore } from 'react';
import { z } from 'zod';

import { type Claim, ClaimSchema } from '@/lib/claims';
import { getToken, subscribeToken } from '@/lib/token';

/**
 * Submitted claims, kept in localStorage so a claim whose outcome is unknown
 * can be retried with the same Idempotency-Key and body after a reload.
 *
 * Records are stored per token ("bucket"): on a shared device a claim made
 * with one token must never be retried with another, or it would be created
 * on someone else's account.
 */

const ClaimRecordSchema = z.object({
  /** The Idempotency-Key; also the record id. */
  key: z.string(),
  asset: z.string(),
  /** The exact JSON body, resent byte for byte on every retry. */
  body: z.string(),
  amount: z.string(),
  fee: z.string(),
  receiveAmount: z.string(),
  destinationLabel: z.string(),
  /**
   * - checking: sent or about to be sent; outcome not known yet (auto-retrying)
   * - stalled: still unknown after the retry window; waits for "Check again" or a reload
   * - created: the server returned the claim (201, or 200 on a replay)
   * - rejected: the server refused it, so nothing was created
   */
  state: z.enum(['checking', 'stalled', 'created', 'rejected']),
  /** True once an attempt ended with an unknown outcome ("sending" vs "checking" in the UI). */
  uncertain: z.boolean(),
  attempts: z.number(),
  /** Start of the current automatic retry window (ms). */
  windowStartedAt: z.number(),
  claim: ClaimSchema.optional(),
  /** Why the claim was rejected, and which field the server pointed at. */
  error: z.string().optional(),
  errorField: z.string().optional(),
});

export type ClaimRecord = z.infer<typeof ClaimRecordSchema>;

const PREFIX = 'cashmine.claims.';
const EMPTY: readonly ClaimRecord[] = [];

const cache = new Map<string, readonly ClaimRecord[]>();
const listeners = new Set<() => void>();

/** Short FNV-1a hash of the token: only names the bucket, it is not a secret. */
function bucketFor(token: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function currentBucket(): string | null {
  const token = getToken();
  return token ? bucketFor(token) : null;
}

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readRecords(bucket: string): readonly ClaimRecord[] {
  const cached = cache.get(bucket);
  if (cached) return cached;
  let records: readonly ClaimRecord[] = EMPTY;
  try {
    const raw = storage()?.getItem(PREFIX + bucket);
    const parsed = z.array(ClaimRecordSchema).safeParse(raw ? JSON.parse(raw) : []);
    if (parsed.success) records = parsed.data;
  } catch {
    // Unreadable storage: start empty.
  }
  cache.set(bucket, records);
  return records;
}

/** Writes through to localStorage. Throws if it cannot be saved. */
function write(bucket: string, records: readonly ClaimRecord[]) {
  const store = storage();
  if (!store) throw new Error('Storage unavailable');
  store.setItem(PREFIX + bucket, JSON.stringify(records));
  cache.set(bucket, records);
  listeners.forEach((listener) => listener());
}

/**
 * Saves a new claim before it is sent. Throws if it cannot be saved: the
 * no-duplicates guarantee depends on the key surviving, so we do not send without it.
 */
export function addRecord(bucket: string, record: ClaimRecord) {
  write(bucket, [...readRecords(bucket), record]);
}

export function updateRecord(bucket: string, key: string, patch: Partial<ClaimRecord>) {
  const records = readRecords(bucket).map((r) => (r.key === key ? { ...r, ...patch } : r));
  try {
    write(bucket, records);
  } catch {
    // Keep the update in memory for this session; the record itself was saved before sending.
    cache.set(bucket, records);
    listeners.forEach((listener) => listener());
  }
}

export function removeRecord(bucket: string, key: string) {
  const records = readRecords(bucket).filter((r) => r.key !== key);
  try {
    write(bucket, records);
  } catch {
    cache.set(bucket, records);
    listeners.forEach((listener) => listener());
  }
}

export function getRecord(bucket: string, key: string): ClaimRecord | undefined {
  return readRecords(bucket).find((r) => r.key === key);
}

/** Unresolved claims lock their asset: no new claim until we know the outcome. */
export function isUnresolved(record: ClaimRecord): boolean {
  return record.state === 'checking' || record.state === 'stalled';
}

export function subscribeClaims(listener: () => void) {
  listeners.add(listener);
  const unsubscribeToken = subscribeToken(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeToken();
  };
}

function snapshot(): readonly ClaimRecord[] {
  const bucket = currentBucket();
  return bucket ? readRecords(bucket) : EMPTY;
}

/** Claims of the current token. */
export function useClaimRecords(): readonly ClaimRecord[] {
  return useSyncExternalStore(subscribeClaims, snapshot, () => EMPTY);
}

/** Keeps a created record's claim up to date (e.g. from the tracking screen), so a failure drops its adjustment. */
export function syncClaim(claim: Claim) {
  const bucket = currentBucket();
  if (!bucket) return;
  const record = readRecords(bucket).find((r) => r.claim?.id === claim.id);
  if (record && (record.claim?.status !== claim.status || record.claim?.updatedAt !== claim.updatedAt)) {
    updateRecord(bucket, record.key, { claim });
  }
}
