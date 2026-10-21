import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { useState } from 'react';
import { useColorScheme } from 'react-native';

import { ChangeTokenLink } from '@/components/change-token-link';
import { isUnauthorized, queryRetryDelay, shouldRetryQuery } from '@/lib/api';
import { useToken } from '@/lib/token';

// A 401 anywhere means the token is invalid or expired: send the user to the
// token screen. The stored token is kept, so a fresh one simply replaces it.
function redirectOnUnauthorized(error: unknown) {
  if (isUnauthorized(error)) {
    router.replace({ pathname: '/token', params: { reason: 'unauthorized' } });
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const token = useToken();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: redirectOnUnauthorized }),
        mutationCache: new MutationCache({ onError: redirectOnUnauthorized }),
        defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetryQuery, retryDelay: queryRetryDelay } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Protected guard={token !== null} redirectTo="/token">
            <Stack.Screen name="index" options={{ title: 'Balances', headerRight: () => <ChangeTokenLink /> }} />
            <Stack.Screen name="claim/[asset]" options={{ title: 'Claim' }} />
          </Stack.Protected>
          <Stack.Screen name="token" options={{ title: 'API token' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
