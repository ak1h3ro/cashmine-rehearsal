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
      const own = claims
        .filter((c) => c.asset === item.asset)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      if (own.length === 0) return item;
      let available = new Big(item.available);
      let claiming = new Big(item.claiming);
      for (const claim of own) {
        // A claim larger than what is left cannot have come out of this
        // snapshot's available: the snapshot must already include it.
        if (new Big(claim.amount).gt(available)) continue;
        available = available.minus(claim.amount);
        // Only a pending claim counts as claiming; a completed one has left claiming too.
        if (claim.status === 'pending') claiming = claiming.plus(claim.amount);
      }
      return { ...item, available: available.toFixed(), claiming: claiming.toFixed() };
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
