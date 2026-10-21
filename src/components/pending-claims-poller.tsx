import { useQueries } from '@tanstack/react-query';
import { useEffect } from 'react';

import { syncClaim, useClaimRecords } from '@/lib/claim-store';
import { CLAIM_POLL_MS, claimQuery } from '@/lib/claims';

/**
 * Always mounted (root layout). While the current token has a created claim
 * that is still pending, polls GET /v1/claims/{id} and saves the status, so the
 * balance adjustment and the asset lock follow the real status wherever the
 * user is. Polls nothing once no claim is pending.
 */
export function PendingClaimsPoller() {
  const records = useClaimRecords();
  const pendingIds = records.flatMap((r) =>
    r.state === 'created' && r.claim?.status === 'pending' ? [r.claim.id] : [],
  );

  const results = useQueries({
    queries: pendingIds.map((id) => ({ ...claimQuery(id), refetchInterval: CLAIM_POLL_MS })),
  });

  const claims = results.flatMap((r) => (r.data ? [r.data] : []));
  // Re-run only when a claim's status or update time actually changes.
  const signature = claims.map((c) => `${c.id}:${c.status}:${c.updatedAt}`).join('|');
  useEffect(() => {
    claims.forEach(syncClaim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}
