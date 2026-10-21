import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { apiGet } from '@/lib/api';
import { SignedDecimalStringSchema } from '@/lib/money';

// All fields are documented as always present; exchange and relatedId are null
// when they do not apply, so they are nullable rather than optional.
const ActivityItemSchema = z.object({
  id: z.string(),
  type: z.enum(['accrual', 'reversal', 'claim']),
  asset: z.string(),
  amount: SignedDecimalStringSchema,
  status: z.enum(['pending', 'confirmed', 'completed', 'failed']),
  exchange: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  relatedId: z.string().nullable(),
});

const ActivityPageSchema = z.object({
  items: z.array(ActivityItemSchema),
  nextCursor: z.string().nullable(),
});

export type ActivityItem = z.infer<typeof ActivityItemSchema>;

const PAGE_SIZE = 20;

export const activityKeys = {
  all: ['activity'] as const,
};

export function useActivity() {
  return useInfiniteQuery({
    queryKey: activityKeys.all,
    queryFn: ({ pageParam, signal }) =>
      apiGet(
        `/v1/activity?limit=${PAGE_SIZE}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        ActivityPageSchema,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
