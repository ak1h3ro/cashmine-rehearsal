import { Link, useTheme } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useUsers } from '@/lib/users';

export default function UsersScreen() {
  const { colors } = useTheme();
  const { data, isPending, isError, error, refetch, isRefetching } = useUsers();

  if (isPending) {
    return (
      <Screen>
        <ActivityIndicator style={styles.center} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={{ color: colors.text }}>{error.message}</Text>
          <Pressable onPress={() => refetch()} style={styles.retry}>
            <Text style={{ color: colors.primary }}>Retry</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={data}
        keyExtractor={(user) => String(user.id)}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.text }]}>No users yet.</Text>}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/users/[id]', params: { id: item.id } }} asChild>
            {/* Link asChild throws on style arrays in SDK 58, so flatten. */}
            <Pressable style={StyleSheet.flatten([styles.row, { borderColor: colors.border }])}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <Text style={{ color: colors.text, opacity: 0.6 }}>{item.company.name}</Text>
            </Pressable>
          </Link>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  retry: { padding: 8 },
  empty: { textAlign: 'center', marginTop: 32 },
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
});
