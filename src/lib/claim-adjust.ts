import Big from 'big.js';

import type { Balances } from '@/lib/balances';
import type { ClaimRecord } from '@/lib/claim-store';

/**
 * Balances are server snapshots recomputed every 15 s, so a snapshot taken
 * before a claim still shows the claimed amount as available. For each
 * created claim the snapshot does not include yet, move its amount from
 * available to claiming, as the server already has. A stale snapshot can
 * therefore never "undo" a claim on screen.
 */

/**
 * True if the snapshot already includes the claim. Equal times count as not
 * included: if that is wrong the balance is a bit low for one cycle, which is
 * better than too high and then dropping.
 */
export function snapshotIncludes(asOf: string, claimCreatedAt: string): boolean {
  return Date.parse(asOf) > Date.parse(claimCreatedAt);
}

/** Claims that still need to be applied on top of this snapshot. */
export function pendingAdjustments(asOf: string, records: readonly ClaimRecord[]) {
  return records.flatMap((record) => {
    const claim = record.state === 'created' ? record.claim : undefined;
    // A failed claim's amount is back in available, which a pre-claim snapshot already shows.
    if (!claim || claim.status === 'failed' || snapshotIncludes(asOf, claim.createdAt)) return [];
    return [claim];
  });
}

export function adjustBalances(balances: Balances, records: readonly ClaimRecord[]): Balances {
  const claims = pendingAdjustments(balances.asOf, records);
  if (claims.length === 0) return balances;
  return {
    ...balances,
    items: balances.items.map((item) => {
      const amounts = claims.filter((c) => c.asset === item.asset).map((c) => c.amount);
      if (amounts.length === 0) return item;
      const total = amounts.reduce((sum, amount) => sum.plus(amount), new Big(0));
      const available = new Big(item.available).minus(total);
      return {
        ...item,
        // Never show a negative balance if the server already moved part of it.
        available: (available.lt(0) ? new Big(0) : available).toFixed(),
        claiming: new Big(item.claiming).plus(total).toFixed(),
      };
    }),
  };
}

const MAX_RECORD_AGE_MS = 60 * 60 * 1000;

/**
 * A created claim's record can go once the snapshot includes it and it has
 * settled, or after an hour (claims settle in about 20 s; an older record
 * only means we never saw the final status).
 */
export function canForget(record: ClaimRecord, asOf: string, now: number): boolean {
  const claim = record.state === 'created' ? record.claim : undefined;
  if (!claim) return false;
  if (now - Date.parse(claim.createdAt) > MAX_RECORD_AGE_MS) return true;
  return claim.status !== 'pending' && snapshotIncludes(asOf, claim.createdAt);
}
