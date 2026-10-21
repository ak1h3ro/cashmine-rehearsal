import { Stack, useLocalSearchParams, useTheme } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/screen';

// Stub until the Claim slice.
export default function ClaimScreen() {
  const { colors } = useTheme();
  const { asset } = useLocalSearchParams<{ asset: string }>();
  return (
    <Screen>
      <Stack.Screen options={{ title: `Claim ${asset}` }} />
      <Text style={[styles.text, { color: colors.text }]}>Claiming {asset} comes in the next slice.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { textAlign: 'center', marginTop: 32 },
});
