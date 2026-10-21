import { describe, expect, it } from '@jest/globals';

import type { Balances } from '@/lib/balances';
import { adjustBalances, canForget, snapshotIncludes } from '@/lib/claim-adjust';
import type { ClaimRecord } from '@/lib/claim-store';
import type { Claim } from '@/lib/claims';

const T0 = '2026-10-21T06:00:00.000Z';
const T_CLAIM = '2026-10-21T06:00:07.000Z';
const T_LATER = '2026-10-21T06:00:15.000Z';

const snapshot = (asOf: string): Balances => ({
  asOf,
  items: [
    { asset: 'ETH', decimals: 18, available: '1.5', pending: '0', claiming: '0', usdPrice: '2500' },
    { asset: 'BTC', decimals: 8, available: '0.01', pending: '0', claiming: '0', usdPrice: '67000' },
  ],
});

function created(claim: Partial<Claim> = {}): ClaimRecord {
  const full: Claim = {
    id: 'clm_1',
    asset: 'ETH',
    amount: '0.5',
    fee: '0.0012',
    receiveAmount: '0.4988',
    destinationId: 'dest_wallet',
    status: 'pending',
    failureReason: null,
    createdAt: T_CLAIM,
    updatedAt: T_CLAIM,
    ...claim,
  };
  return {
    key: `key_${full.id}`,
    asset: full.asset,
    body: '{}',
    amount: full.amount,
    fee: full.fee,
    receiveAmount: full.receiveAmount,
    destinationLabel: 'Wallet',
    state: 'created',
    uncertain: false,
    attempts: 1,
    windowStartedAt: 0,
    claim: full,
  };
}

const eth = (b: Balances) => b.items.find((i) => i.asset === 'ETH')!;

describe('snapshotIncludes', () => {
  it('treats equal times as not included yet', () => {
    expect(snapshotIncludes(T_CLAIM, T_CLAIM)).toBe(false);
    expect(snapshotIncludes(T0, T_CLAIM)).toBe(false);
    expect(snapshotIncludes(T_LATER, T_CLAIM)).toBe(true);
  });

  it('compares times, not strings', () => {
    // Same instant written with an offset: string comparison would get this wrong.
    expect(snapshotIncludes('2026-10-21T08:00:08+02:00', T_CLAIM)).toBe(true);
  });
});

describe('adjustBalances', () => {
  it('moves a claim from available to claiming on a stale snapshot', () => {
    const adjusted = eth(adjustBalances(snapshot(T0), [created()]));
    expect(adjusted.available).toBe('1');
    expect(adjusted.claiming).toBe('0.5');
  });

  it('still applies when asOf equals createdAt', () => {
    expect(eth(adjustBalances(snapshot(T_CLAIM), [created()])).available).toBe('1');
  });

  it('stops applying once the snapshot includes the claim', () => {
    const later = snapshot(T_LATER);
    expect(adjustBalances(later, [created()])).toBe(later);
  });

  it('drops the adjustment as soon as the claim is known to have failed', () => {
    expect(eth(adjustBalances(snapshot(T0), [created({ status: 'failed' })])).available).toBe('1.5');
  });

  it('sums several claims per asset and leaves other assets alone', () => {
    const result = adjustBalances(snapshot(T0), [created(), created({ id: 'clm_2', amount: '0.25' })]);
    expect(eth(result).available).toBe('0.75');
    expect(eth(result).claiming).toBe('0.75');
    expect(result.items.find((i) => i.asset === 'BTC')!.available).toBe('0.01');
  });

  it('ignores claims whose outcome is unknown or that were rejected', () => {
    const base = created();
    const unknown: ClaimRecord = { ...base, state: 'checking', claim: undefined };
    const rejected: ClaimRecord = { ...base, state: 'rejected', claim: undefined };
    expect(eth(adjustBalances(snapshot(T0), [unknown, rejected])).available).toBe('1.5');
  });

  it('never shows a negative balance', () => {
    expect(eth(adjustBalances(snapshot(T0), [created({ amount: '2' })])).available).toBe('0');
  });
});

describe('canForget', () => {
  const now = Date.parse(T_LATER);

  it('keeps a record until the snapshot includes it and it has settled', () => {
    expect(canForget(created({ status: 'completed' }), T0, now)).toBe(false);
    expect(canForget(created({ status: 'pending' }), T_LATER, now)).toBe(false);
    expect(canForget(created({ status: 'completed' }), T_LATER, now)).toBe(true);
    expect(canForget(created({ status: 'failed' }), T_LATER, now)).toBe(true);
  });

  it('never forgets an unresolved claim', () => {
    expect(canForget({ ...created(), state: 'checking', claim: undefined }, T_LATER, now + 1e9)).toBe(false);
  });

  it('forgets a created claim after an hour even without a final status', () => {
    expect(canForget(created(), T0, Date.parse(T_CLAIM) + 61 * 60 * 1000)).toBe(true);
  });
});
