import { onlineManager } from '@tanstack/react-query';
import { useTheme } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { checkAgain, ClaimNotSavedError, submitClaim } from '@/lib/claim-sender';
import type { ClaimRecord } from '@/lib/claim-store';
import type { ClaimOptions } from '@/lib/claims';
import { formatAssetAmount, parseAmountInput, receiveAmount, validateClaimAmount } from '@/lib/money';

function useOnline() {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
}

type FormProps = {
  asset: string;
  decimals: number;
  available: string;
  options: ClaimOptions;
  /** Server-side rejection of the previous attempt, shown inline. */
  rejection?: { message: string; field?: string };
  onSubmitted: (key: string) => void;
};

export function ClaimForm({ asset, decimals, available, options, rejection, onSubmitted }: FormProps) {
  const { colors } = useTheme();
  const online = useOnline();
  const [amountText, setAmountText] = useState('');
  const [touched, setTouched] = useState(false);
  const [destinationId, setDestinationId] = useState(options.destinations[0]?.id);
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [saveError, setSaveError] = useState<string | null>(null);

  const parsed = parseAmountInput(amountText);
  const amountError = parsed.ok
    ? validateClaimAmount(parsed.value, { asset, decimals, available, minAmount: options.minAmount, fee: options.fee })
    : parsed.error;
  const destination = options.destinations.find((d) => d.id === destinationId);
  const canContinue = parsed.ok && !amountError && destination !== undefined;
  // The server's own message about the amount, until the user edits it.
  const serverAmountError = !touched && rejection?.field === 'amount' ? rejection.message : null;

  if (options.destinations.length === 0) {
    return <Text style={[styles.message, { color: colors.text }]}>No destination is set up for {asset}.</Text>;
  }

  if (step === 'confirm' && parsed.ok && destination) {
    const amount = parsed.value;
    const receive = receiveAmount(amount, options.fee);
    return (
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>Confirm claim</Text>
        <Row label="Amount" value={formatAssetAmount(amount, asset)} />
        <Row label="Fee" value={formatAssetAmount(options.fee, asset)} />
        <Row label="You receive" value={formatAssetAmount(receive, asset)} strong />
        <Row label="To" value={destination.label} />
        {!online ? <Text style={{ color: colors.notification }}>You&apos;re offline. Connect to submit.</Text> : null}
        {saveError ? <Text style={{ color: colors.notification }}>{saveError}</Text> : null}
        <PrimaryButton
          label="Confirm claim"
          disabled={!online}
          onPress={() => {
            try {
              onSubmitted(
                submitClaim({
                  asset,
                  amount,
                  destinationId: destination.id,
                  destinationLabel: destination.label,
                  fee: options.fee,
                  receiveAmount: receive,
                }),
              );
            } catch (e) {
              if (!(e instanceof ClaimNotSavedError)) throw e;
              setSaveError(
                "Couldn't save the claim on this device, so it was not sent. Check that site storage is allowed and try again.",
              );
            }
          }}
        />
        <Pressable onPress={() => setStep('edit')} style={styles.secondaryButton}>
          <Text style={{ color: colors.primary }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const shownError = serverAmountError ?? (touched && amountText !== '' ? amountError : null);

  return (
    <View style={styles.body}>
      <Text style={[styles.muted, { color: colors.text }]}>Available: {formatAssetAmount(available, asset)}</Text>
      <View style={styles.amountRow}>
        <TextInput
          value={amountText}
          onChangeText={(text) => {
            setAmountText(text);
            setTouched(true);
          }}
          placeholder={`Amount in ${asset}`}
          placeholderTextColor={colors.border}
          inputMode="decimal"
          autoCorrect={false}
          style={[
            styles.input,
            { color: colors.text, borderColor: shownError ? colors.notification : colors.border },
          ]}
        />
        <Pressable
          onPress={() => {
            setAmountText(available);
            setTouched(true);
          }}
          style={[styles.maxButton, { borderColor: colors.primary }]}
        >
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Max</Text>
        </Pressable>
      </View>
      {shownError ? <Text style={{ color: colors.notification }}>{shownError}</Text> : null}
      {rejection && rejection.field !== 'amount' && !touched ? (
        <Text style={{ color: colors.notification }}>{rejection.message}</Text>
      ) : null}

      <Text style={[styles.muted, { color: colors.text }]}>
        Fee {formatAssetAmount(options.fee, asset)} · minimum {formatAssetAmount(options.minAmount, asset)}
      </Text>
      {canContinue && parsed.ok ? (
        <Text style={[styles.receive, { color: colors.text }]}>
          You receive {formatAssetAmount(receiveAmount(parsed.value, options.fee), asset)}
        </Text>
      ) : null}

      {options.destinations.length > 1 ? (
        <View style={styles.destinations}>
          <Text style={[styles.muted, { color: colors.text }]}>Send to</Text>
          {options.destinations.map((d) => (
            <Pressable
              key={d.id}
              onPress={() => setDestinationId(d.id)}
              style={[
                styles.destination,
                { borderColor: d.id === destinationId ? colors.primary : colors.border },
              ]}
            >
              <Text style={{ color: colors.text }}>{d.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.muted, { color: colors.text }]}>To {destination?.label}</Text>
      )}

      <PrimaryButton
        label="Continue"
        disabled={!canContinue}
        onPress={() => {
          setSaveError(null);
          setStep('confirm');
        }}
      />
    </View>
  );
}

/** A claim whose outcome is not known yet: amount locked, retried with the same key. */
export function ClaimChecking({ record }: { record: ClaimRecord }) {
  const { colors } = useTheme();
  const [checking, setChecking] = useState(false);
  const stalled = record.state === 'stalled';

  return (
    <View style={styles.body}>
      <Text style={[styles.title, { color: colors.text }]}>
        {stalled ? "Couldn't confirm yet" : record.uncertain ? 'Checking your claim' : 'Sending your claim'}
      </Text>
      <Text style={[styles.message, { color: colors.text }]}>
        {stalled
          ? "Couldn't confirm yet. Check again or look at Activity later. It won't be sent twice."
          : record.uncertain
            ? "We're checking whether your claim went through. It won't be sent twice."
            : 'Sending…'}
      </Text>
      <Row label="Amount" value={formatAssetAmount(record.amount, record.asset)} />
      <Row label="Fee" value={formatAssetAmount(record.fee, record.asset)} />
      <Row label="You receive" value={formatAssetAmount(record.receiveAmount, record.asset)} strong />
      <Row label="To" value={record.destinationLabel} />
      {!stalled ? <ActivityIndicator style={styles.spinner} /> : null}
      {record.uncertain || stalled ? (
        <PrimaryButton
          label={checking ? 'Checking…' : 'Check again'}
          disabled={checking}
          onPress={() => {
            setChecking(true);
            void checkAgain(record.key).finally(() => setChecking(false));
          }}
        />
      ) : null}
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function PrimaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, { backgroundColor: colors.primary, opacity: disabled ? 0.4 : 1 }]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 21 },
  muted: { fontSize: 14, opacity: 0.7 },
  amountRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 18 },
  maxButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  receive: { fontSize: 16, fontWeight: '600' },
  destinations: { gap: 8 },
  destination: { borderWidth: 1, borderRadius: 8, padding: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 15, opacity: 0.7 },
  rowValue: { flex: 1, fontSize: 15, textAlign: 'right', fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '700' },
  spinner: { marginTop: 8 },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { alignItems: 'center', padding: 8 },
});
