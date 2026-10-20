import { Stack, useLocalSearchParams, useTheme } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { formatAmount } from '@/lib/money';
import { useUser } from '@/lib/users';

export default function UserScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, isError, error } = useUser(Number(id));

  return (
    <Screen>
      <Stack.Screen options={{ title: data?.name ?? 'User' }} />
      {isPending ? (
        <ActivityIndicator style={styles.center} />
      ) : isError ? (
        <Text style={[styles.center, { color: colors.text }]}>{error.message}</Text>
      ) : (
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.text }]}>{data.name}</Text>
          <Text style={{ color: colors.text }}>{data.email}</Text>
          <Text style={{ color: colors.text }}>{data.company.name}</Text>
          {/* Fake figure, only to exercise decimal-safe formatting on web. */}
          <Text style={[styles.amount, { color: colors.text }]}>
            Payback: {formatAmount(`${data.id}234.5678`, 'USDT', 2)}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, textAlign: 'center', marginTop: 32 },
  body: { padding: 16, gap: 6 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  amount: { marginTop: 12, fontSize: 18, fontVariant: ['tabular-nums'] },
});
