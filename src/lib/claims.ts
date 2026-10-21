import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiGet } from '@/lib/api';
import { DecimalStringSchema } from '@/lib/money';

// All fields are documented as always present; only failureReason is null
// until a claim fails, so it is nullable rather than optional.
export const ClaimSchema = z.object({
  id: z.string(),
  asset: z.string(),
  amount: DecimalStringSchema,
  fee: DecimalStringSchema,
  receiveAmount: DecimalStringSchema,
  destinationId: z.string(),
  status: z.enum(['pending', 'completed', 'failed']),
  failureReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type Claim = z.infer<typeof ClaimSchema>;

const ClaimOptionsSchema = z.object({
  asset: z.string(),
  minAmount: DecimalStringSchema,
  fee: DecimalStringSchema,
  destinations: z.array(z.object({ id: z.string(), label: z.string() })),
});

export type ClaimOptions = z.infer<typeof ClaimOptionsSchema>;

export const claimKeys = {
  options: (asset: string) => ['claim-options', asset] as const,
  detail: (id: string) => ['claims', id] as const,
};

export function useClaimOptions(asset: string) {
  return useQuery({
    queryKey: claimKeys.options(asset),
    queryFn: ({ signal }) => apiGet(`/v1/claim-options?asset=${encodeURIComponent(asset)}`, ClaimOptionsSchema, { signal }),
  });
}

/** A pending claim settles within about 20 s; poll until it does. */
export function useClaim(id: string) {
  return useQuery({
    queryKey: claimKeys.detail(id),
    queryFn: ({ signal }) => apiGet(`/v1/claims/${encodeURIComponent(id)}`, ClaimSchema, { signal }),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 2000 : false),
  });
}
