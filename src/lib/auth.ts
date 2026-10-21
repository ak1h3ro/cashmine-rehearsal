import { router } from 'expo-router';

import { isUnauthorized } from '@/lib/api';

/**
 * A 401 anywhere means the token is invalid or expired: send the user to the
 * token screen. The stored token is kept, so a fresh one simply replaces it.
 */
export function redirectOnUnauthorized(error: unknown) {
  if (isUnauthorized(error)) {
    router.replace({ pathname: '/token', params: { reason: 'unauthorized' } });
  }
}
