import { Link, useTheme } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

/** Balances header: Activity, and Token to replace the stored token. */
export function ChangeTokenLink() {
  const { colors } = useTheme();
  return (
    <View style={styles.links}>
      <Link href="/activity" style={styles.link}>
        <Text style={{ color: colors.primary }}>Activity</Text>
      </Link>
      <Link href="/token" style={styles.link}>
        <Text style={{ color: colors.primary }}>Token</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row' },
  link: { paddingHorizontal: 10, paddingVertical: 8 },
});
