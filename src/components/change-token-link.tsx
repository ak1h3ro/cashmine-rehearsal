import { Link, useTheme } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

/** Header entry that opens the token screen to replace the stored token. */
export function ChangeTokenLink() {
  const { colors } = useTheme();
  return (
    <Link href="/token" style={styles.link}>
      <Text style={{ color: colors.primary }}>Token</Text>
    </Link>
  );
}

const styles = StyleSheet.create({
  link: { paddingHorizontal: 16, paddingVertical: 8 },
});
