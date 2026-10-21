import { Link, Stack, useLocalSearchParams, useTheme } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { syncClaim } from '@/lib/claim-store';
import { useClaim } from '@/lib/claims';
import { formatAssetAmount } from '@/lib/money';
import { formatTime } from '@/lib/time';

const STATUS_TEXT = {
  pending: 'In progress. Claims usually settle within about 20 seconds.',
  completed: 'Completed. The amount is on its way to your destination.',
  failed: 'Failed. The amount has returned to your available balance.',
} as const;

export default function ClaimTrackingScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: claim, isPending, isError, error, refetch, isRefetching } = useClaim(id);

  // Feed the latest status to the balance adjustment (a failed claim stops being subtracted).
  useEffect(() => {
    if (claim) syncClaim(claim);
  }, [claim]);

  let content;
  if (isPending) {
    content = <ActivityIndicator style={styles.center} />;
  } else if (isError && !claim) {
    content = (
      <View style={styles.center}>
        <Text style={{ color: colors.text }}>{error.message}</Text>
        <Pressable onPress={() => void refetch()} style={styles.retry}>
          {isRefetching ? <ActivityIndicator /> : <Text style={{ color: colors.primary }}>Retry</Text>}
        </Pressable>
      </View>
    );
  } else {
    const color =
      claim.status === 'failed' ? colors.notification : claim.status === 'completed' ? colors.primary : colors.text;
    content = (
      <View style={styles.body}>
        <View style={styles.statusRow}>
          {claim.status === 'pending' ? <ActivityIndicator /> : null}
          <Text style={[styles.status, { color }]}>{claim.status.toUpperCase()}</Text>
        </View>
        <Text style={[styles.message, { color: colors.text }]}>{STATUS_TEXT[claim.status]}</Text>
        {claim.failureReason ? (
          <Text style={[styles.message, { color: colors.notification }]}>Reason: {claim.failureReason}</Text>
        ) : null}
        <Row label="Amount" value={formatAssetAmount(claim.amount, claim.asset)} />
        <Row label="Fee" value={formatAssetAmount(claim.fee, claim.asset)} />
        <Row label="You receive" value={formatAssetAmount(claim.receiveAmount, claim.asset)} />
        <Row label="Created" value={formatTime(claim.createdAt)} />
        <Row label="Updated" value={formatTime(claim.updatedAt)} />
        <Link href="/" replace style={[styles.home, { color: colors.primary }]}>
          Back to balances
        </Link>
      </View>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Claim' }} />
      {content}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  retry: { padding: 8 },
  body: { padding: 16, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 22, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 15, opacity: 0.7 },
  rowValue: { flex: 1, fontSize: 15, textAlign: 'right', fontVariant: ['tabular-nums'] },
  home: { textAlign: 'center', marginTop: 16, fontSize: 16 },
});
