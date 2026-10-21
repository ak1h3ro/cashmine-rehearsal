import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiGet } from '@/lib/api';
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
