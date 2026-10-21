import { Link, useTheme } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { BalanceRow, BalancesHeader } from '@/components/balances';
import { Screen } from '@/components/screen';
import { useBalances } from '@/lib/balances';

export default function BalancesScreen() {
  const { colors } = useTheme();
  const { data, isPending, isError, isRefetchError, error, refetch } = useBalances();
  // Only a refresh the user asked for shows a spinner; the 15 s background refetch stays silent.
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  if (isPending) {
    return (
      <Screen>
        <ActivityIndicator style={styles.center} />
      </Screen>
    );
  }

  // Full-screen error only when there is nothing to show; a failed refresh keeps the old data.
  if (isError && !data) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={{ color: colors.text }}>{error.message}</Text>
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
            refreshFailed={isRefetchError}
          />
        }
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.text }]}>No assets yet.</Text>}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/claim/[asset]', params: { asset: item.asset } }} asChild>
            <Pressable>
              <BalanceRow balance={item} />
            </Pressable>
          </Link>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  retry: { padding: 8 },
  empty: { textAlign: 'center', marginTop: 32 },
  separator: { height: StyleSheet.hairlineWidth },
});
