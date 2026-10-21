import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { z } from 'zod';

import { apiGet } from '@/lib/api';
import { adjustBalances, canForget } from '@/lib/claim-adjust';
import { currentBucket, removeRecord, useClaimRecords } from '@/lib/claim-store';
import { DecimalStringSchema } from '@/lib/money';

// Every field is documented as always present, so none are optional.
const BalanceSchema = z.object({
  asset: z.string(),
  decimals: z.number().int().nonnegative(),
  available: DecimalStringSchema,
  pending: DecimalStringSchema,
  claiming: DecimalStringSchema,
  usdPrice: DecimalStringSchema,
});

const BalancesSchema = z.object({
  asOf: z.iso.datetime({ offset: true }),
  items: z.array(BalanceSchema),
});

export type Balance = z.infer<typeof BalanceSchema>;
export type Balances = z.infer<typeof BalancesSchema>;

/** The server recomputes balance snapshots every 15 s. */
export const BALANCES_REFRESH_MS = 15_000;

export const balanceKeys = {
  all: ['balances'] as const,
};

export function useBalances() {
  return useQuery({
    queryKey: balanceKeys.all,
    queryFn: ({ signal }) => apiGet('/v1/balances', BalancesSchema, { signal }),
    refetchInterval: BALANCES_REFRESH_MS,
  });
}

/**
 * Balances with created claims applied that the snapshot does not include yet
 * (see claim-adjust). Use this for anything shown to the user or used for limits.
 */
export function useAdjustedBalances() {
  const query = useBalances();
  const records = useClaimRecords();
  const snapshot = query.data;
  const data = useMemo(() => snapshot && adjustBalances(snapshot, records), [snapshot, records]);

  // Forget created claims the snapshot now includes and that have settled.
  useEffect(() => {
    const bucket = currentBucket();
    if (!snapshot || !bucket) return;
    const now = Date.now();
    for (const record of records) {
      if (canForget(record, snapshot.asOf, now)) removeRecord(bucket, record.key);
    }
  }, [snapshot, records]);

  return { ...query, data };
}
