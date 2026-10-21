import { Link, useTheme } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { BalanceRow, BalancesHeader } from '@/components/balances';
import { Screen } from '@/components/screen';
import { useAdjustedBalances } from '@/lib/balances';
import { isUnresolved, useClaimRecords } from '@/lib/claim-store';

export default function BalancesScreen() {
  const { colors } = useTheme();
  const { data, isPending, isError, isRefetchError, error, refetch, fetchStatus } = useAdjustedBalances();
  const records = useClaimRecords();
  // With the default networkMode 'online', TanStack Query does not fail while the
  // browser is offline: it pauses the fetch until the connection returns.
  const offline = fetchStatus === 'paused';
  // Only a refresh the user asked for shows a spinner, and only while a request
  // is really in flight; the 15 s background refetch stays silent.
  const [refreshRequested, setRefreshRequested] = useState(false);
  const refreshing = refreshRequested && fetchStatus === 'fetching';

  async function refresh() {
    setRefreshRequested(true);
    await refetch();
    setRefreshRequested(false);
  }

  // Nothing to show yet and no network: say so instead of spinning forever.
  // The paused fetch resumes by itself when the connection returns.
  if (!data && offline) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={[styles.message, { color: colors.text }]}>
            You&apos;re offline. Balances will load when you&apos;re back online.
          </Text>
        </View>
      </Screen>
    );
  }

  if (isPending) {
    return (
      <Screen>
        <ActivityIndicator style={styles.center} />
      </Screen>
    );
  }

  // Full-screen error only when there is nothing to show; a failed refresh keeps the old data.
  if (!data) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={{ color: colors.text }}>{isError ? error.message : 'Something went wrong.'}</Text>
          <Pressable onPress={() => void refresh()} disabled={refreshing} style={styles.retry}>
            {refreshing ? <ActivityIndicator /> : <Text style={{ color: colors.primary }}>Retry</Text>}
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={data.items}
        keyExtractor={(balance) => balance.asset}
        // No-op on web (react-native-web renders a plain View); the header has a Refresh button.
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <BalancesHeader
            balances={data}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            staleReason={offline ? 'offline' : isRefetchError ? 'failed' : null}
          />
        }
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.text }]}>No assets yet.</Text>}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/claim/[asset]', params: { asset: item.asset } }} asChild>
            <Pressable>
              <BalanceRow
                balance={item}
                checkingClaim={records.find((r) => r.asset === item.asset && isUnresolved(r))?.amount}
              />
            </Pressable>
          </Link>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  message: { textAlign: 'center' },
  retry: { padding: 8 },
  empty: { textAlign: 'center', marginTop: 32 },
  separator: { height: StyleSheet.hairlineWidth },
});
