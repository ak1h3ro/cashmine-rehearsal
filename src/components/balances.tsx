import { useTheme } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Balance, Balances } from '@/lib/balances';
import { formatAssetAmount, formatUsd, isZero, sumUsd, usdValue } from '@/lib/money';
import { formatAge, formatTime, useNow } from '@/lib/time';

type HeaderProps = {
  balances: Balances;
  refreshing: boolean;
  onRefresh: () => void;
  /**
   * Why older data is on screen: 'offline' while the query is paused waiting
   * for the network, 'failed' when the last refresh failed.
   */
  staleReason: 'offline' | 'failed' | null;
};

/** Totals in USD and data freshness. Ticks every second on its own so the list does not re-render. */
export function BalancesHeader({ balances, refreshing, onRefresh, staleReason }: HeaderProps) {
  const { colors } = useTheme();
  const now = useNow();
  const { items, asOf } = balances;

  return (
    <View style={[styles.header, { borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.text }]}>Available to claim</Text>
      <Text style={[styles.total, { color: colors.text }]}>{formatUsd(sumUsd(items, (b) => b.available))}</Text>
      <Text style={[styles.secondary, { color: colors.text }]}>
        Pending {formatUsd(sumUsd(items, (b) => b.pending))}
      </Text>
      <Text style={[styles.secondary, { color: colors.text }]}>
        Claiming {formatUsd(sumUsd(items, (b) => b.claiming))}
      </Text>

      <View style={styles.freshness}>
        <Text style={[styles.muted, { color: colors.text }]}>Updated {formatAge(asOf, now)}</Text>
        <Pressable onPress={onRefresh} disabled={refreshing} hitSlop={8} style={styles.refresh}>
          {refreshing ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text style={{ color: colors.primary }}>Refresh</Text>
          )}
        </Pressable>
      </View>

      {staleReason === 'offline' ? (
        <View style={[styles.banner, { borderColor: colors.border }]}>
          <Text style={[styles.bannerText, { color: colors.text }]}>
            You&apos;re offline. Showing data from {formatTime(asOf)}.
          </Text>
        </View>
      ) : staleReason === 'failed' ? (
        <View style={[styles.banner, { borderColor: colors.notification }]}>
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Couldn&apos;t refresh, data from {formatTime(asOf)}.
          </Text>
          <Pressable onPress={onRefresh} disabled={refreshing} hitSlop={8}>
            <Text style={{ color: colors.primary }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

type RowProps = {
  balance: Balance;
  /** Amount of a claim on this asset whose outcome is not known yet; it is not subtracted. */
  checkingClaim?: string;
};

export function BalanceRow({ balance, checkingClaim }: RowProps) {
  const { colors } = useTheme();
  const { asset, available, pending, claiming, usdPrice } = balance;
  const empty = isZero(available) && isZero(pending) && isZero(claiming) && !checkingClaim;

  const lines = [
    { label: 'Available', amount: available },
    { label: 'Pending', amount: pending },
    { label: 'Claiming', amount: claiming },
  ];

  return (
    <View style={[styles.row, { opacity: empty ? 0.45 : 1 }]}>
      <View style={styles.rowTitle}>
        <Text style={[styles.asset, { color: colors.text }]}>{asset}</Text>
        <Text style={{ color: colors.primary }}>{checkingClaim ? 'Details ›' : 'Claim ›'}</Text>
      </View>
      {checkingClaim ? (
        <Text style={[styles.notice, { color: colors.text, borderColor: colors.border }]}>
          Checking whether your claim of {formatAssetAmount(checkingClaim, asset)} went through. Balance not
          changed until we know.
        </Text>
      ) : null}
      {lines.map(({ label, amount }) => (
        <View key={label} style={styles.line}>
          <Text style={[styles.lineLabel, { color: colors.text }]}>{label}</Text>
          <View style={styles.values}>
            <Text style={[styles.amount, { color: colors.text }]}>{formatAssetAmount(amount, asset)}</Text>
            <Text style={[styles.usd, { color: colors.text }]}>{formatUsd(usdValue(amount, usdPrice))}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 14, opacity: 0.7 },
  total: { fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'], marginVertical: 4 },
  secondary: { fontSize: 15, opacity: 0.8, fontVariant: ['tabular-nums'] },
  freshness: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  muted: { fontSize: 13, opacity: 0.6 },
  refresh: { minWidth: 64, alignItems: 'flex-end' },
  banner: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerText: { flex: 1, fontSize: 14 },
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  rowTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  asset: { fontSize: 17, fontWeight: '600' },
  notice: { fontSize: 13, borderWidth: 1, borderRadius: 6, padding: 8 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lineLabel: { width: 76, fontSize: 14, opacity: 0.7 },
  values: { flex: 1, alignItems: 'flex-end' },
  amount: { fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'right' },
  usd: { fontSize: 13, opacity: 0.6, fontVariant: ['tabular-nums'] },
});
