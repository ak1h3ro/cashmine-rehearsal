import { router, Stack, useLocalSearchParams, useTheme } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ClaimChecking, ClaimForm } from '@/components/claim';
import { Screen } from '@/components/screen';
import { useBalances } from '@/lib/balances';
import { currentBucket, isUnresolved, removeRecord, useClaimRecords } from '@/lib/claim-store';
import { useClaimOptions } from '@/lib/claims';

export default function ClaimScreen() {
  const { colors } = useTheme();
  const { asset } = useLocalSearchParams<{ asset: string }>();
  const balances = useBalances();
  const options = useClaimOptions(asset);
  const records = useClaimRecords();
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);

  const unresolved = records.find((r) => r.asset === asset && isUnresolved(r));
  const rejected = records.find((r) => r.asset === asset && r.state === 'rejected');
  const submitted = records.find((r) => r.key === submittedKey);

  // Once the claim we just sent is known to exist, follow it on its own route.
  const createdId = submitted?.state === 'created' ? submitted.claim?.id : undefined;
  useEffect(() => {
    if (createdId) router.replace({ pathname: '/claims/[id]', params: { id: createdId } });
  }, [createdId]);

  const balance = balances.data?.items.find((b) => b.asset === asset);

  let content;
  if (unresolved) {
    content = <ClaimChecking record={unresolved} />;
  } else if (submitted?.state === 'created') {
    content = <ActivityIndicator style={styles.center} />;
  } else if (balances.isPending || options.isPending) {
    content = <ActivityIndicator style={styles.center} />;
  } else if (options.isError || (balances.isError && !balances.data)) {
    const error = options.error ?? balances.error;
    content = (
      <View style={styles.center}>
        <Text style={{ color: colors.text }}>{error?.message}</Text>
        <Pressable
          onPress={() => {
            void options.refetch();
            void balances.refetch();
          }}
          style={styles.retry}
        >
          <Text style={{ color: colors.primary }}>Retry</Text>
        </Pressable>
      </View>
    );
  } else if (!balance) {
    content = <Text style={[styles.message, { color: colors.text }]}>You have no {asset} balance.</Text>;
  } else {
    content = (
      <ClaimForm
        asset={asset}
        decimals={balance.decimals}
        available={balance.available}
        options={options.data}
        rejection={rejected ? { message: rejected.error ?? 'The claim was refused.', field: rejected.errorField } : undefined}
        onSubmitted={(key) => {
          // A new claim replaces the previous refusal message.
          const bucket = currentBucket();
          if (bucket && rejected) removeRecord(bucket, rejected.key);
          setSubmittedKey(key);
        }}
      />
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: `Claim ${asset}` }} />
      <ScrollView keyboardShouldPersistTaps="handled">{content}</ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  retry: { padding: 8 },
  message: { textAlign: 'center', marginTop: 32, padding: 16 },
});
