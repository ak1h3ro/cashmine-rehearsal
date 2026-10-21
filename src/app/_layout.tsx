import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { ChangeTokenLink } from '@/components/change-token-link';
import { queryRetryDelay, shouldRetryQuery } from '@/lib/api';
import { redirectOnUnauthorized } from '@/lib/auth';
import { balanceKeys } from '@/lib/balances';
import { resumeClaims, setOnClaimCreated } from '@/lib/claim-sender';
import { useToken } from '@/lib/token';

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

  // A confirmed claim: fetch balances at once instead of waiting for the next 15 s tick.
  useEffect(() => {
    setOnClaimCreated(() => void queryClient.invalidateQueries({ queryKey: balanceKeys.all }));
    return () => setOnClaimCreated(undefined);
  }, [queryClient]);

  // Claims whose outcome was unknown when the app closed are retried with
  // their saved key; only the current token's claims (see claim-store).
  useEffect(() => {
    if (token) resumeClaims();
  }, [token]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Protected guard={token !== null} redirectTo="/token">
            <Stack.Screen name="index" options={{ title: 'Balances', headerRight: () => <ChangeTokenLink /> }} />
            <Stack.Screen name="claim/[asset]" options={{ title: 'Claim' }} />
            <Stack.Screen name="claims/[id]" options={{ title: 'Claim' }} />
          </Stack.Protected>
          <Stack.Screen name="token" options={{ title: 'API token' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
