import { queryOptions, useQuery } from '@tanstack/react-query';
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

/** A pending claim settles within about 20 s. */
export const CLAIM_POLL_MS = 2500;

/** One definition per claim, shared by the background poller and the tracking screen. */
export function claimQuery(id: string) {
  return queryOptions({
    queryKey: claimKeys.detail(id),
    queryFn: ({ signal }) => apiGet(`/v1/claims/${encodeURIComponent(id)}`, ClaimSchema, { signal }),
  });
}

/**
 * `poll` is off when the claim is one of ours: the background poller
 * (PendingClaimsPoller) already refreshes it, so it is not polled twice.
 */
export function useClaim(id: string, poll: boolean) {
  return useQuery({
    ...claimQuery(id),
    refetchInterval: (query) => (poll && query.state.data?.status === 'pending' ? CLAIM_POLL_MS : false),
  });
}
