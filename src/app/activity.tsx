import { Link, useTheme } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { type ActivityItem, useActivity } from '@/lib/activity';
import { formatAssetAmount } from '@/lib/money';

const TYPE_LABEL = { accrual: 'Payback', reversal: 'Reversal', claim: 'Claim' } as const;

export default function ActivityScreen() {
  const { colors } = useTheme();
  const { data, isPending, isError, error, refetch, isRefetching, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError } =
    useActivity();

  if (isPending) {
    return (
      <Screen>
        <ActivityIndicator style={styles.center} />
      </Screen>
    );
  }

  if (isError && !data) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={{ color: colors.text }}>{error.message}</Text>
          <Pressable onPress={() => void refetch()} disabled={isRefetching} style={styles.button}>
            {isRefetching ? <ActivityIndicator /> : <Text style={{ color: colors.primary }}>Retry</Text>}
          </Pressable>
        </View>
      </Screen>
    );
  }

  // De-duplicate by id in case a page boundary shifts between requests.
  const seen = new Set<string>();
  const items = data.pages.flatMap((page) => page.items).filter((item) => !seen.has(item.id) && !!seen.add(item.id));

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.text }]}>No activity yet.</Text>}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
        renderItem={({ item }) =>
          item.type === 'claim' && item.relatedId ? (
            <Link href={{ pathname: '/claims/[id]', params: { id: item.relatedId } }} asChild>
              <Pressable>
                <ActivityRow item={item} linked />
              </Pressable>
            </Link>
          ) : (
            <ActivityRow item={item} />
          )
        }
        ListFooterComponent={
          hasNextPage ? (
            <View style={styles.footer}>
              {isFetchNextPageError ? (
                <Text style={{ color: colors.notification }}>Couldn&apos;t load more.</Text>
              ) : null}
              <Pressable onPress={() => void fetchNextPage()} disabled={isFetchingNextPage} style={styles.button}>
                {isFetchingNextPage ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ color: colors.primary }}>{isFetchNextPageError ? 'Retry' : 'Load more'}</Text>
                )}
              </Pressable>
            </View>
          ) : undefined
        }
      />
    </Screen>
  );
}

function ActivityRow({ item, linked }: { item: ActivityItem; linked?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.line}>
        <Text style={[styles.type, { color: colors.text }]}>
          {TYPE_LABEL[item.type]}
          {item.exchange ? ` · ${item.exchange}` : ''}
        </Text>
        <Text style={[styles.amount, { color: colors.text }]}>{formatAssetAmount(item.amount, item.asset)}</Text>
      </View>
      <View style={styles.line}>
        <Text style={[styles.muted, { color: colors.text }]}>{new Date(item.createdAt).toLocaleString()}</Text>
        <Text style={[styles.muted, { color: item.status === 'failed' ? colors.notification : colors.text }]}>
          {item.status}
          {linked ? ' ›' : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  button: { padding: 12, alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 32 },
  separator: { height: StyleSheet.hairlineWidth },
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  type: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  amount: { fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'right' },
  muted: { fontSize: 13, opacity: 0.6 },
  footer: { alignItems: 'center', paddingVertical: 8 },
});
