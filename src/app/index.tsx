import { useTheme } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/screen';

// Placeholder until the Balances slice.
export default function BalancesScreen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <Text style={[styles.text, { color: colors.text }]}>Balances coming in the next slice.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { textAlign: 'center', marginTop: 32 },
});
