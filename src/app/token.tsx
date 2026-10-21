import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useTheme } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { Screen } from '@/components/screen';
import { apiGet, isUnauthorized } from '@/lib/api';
import { setToken, useToken } from '@/lib/token';

const CHECK_TIMEOUT_MS = 10_000;

export default function TokenScreen() {
  const { colors } = useTheme();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const queryClient = useQueryClient();
  const hasToken = useToken() !== null;
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function save() {
    const token = value.trim();
    if (!token) {
      setError('Enter your API token.');
      return;
    }
    setError(null);
    setChecking(true);
    try {
      await apiGet('/v1/balances', z.unknown(), { token, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    } catch (e) {
      if (isUnauthorized(e)) {
        setError('This token was rejected. It may be invalid or expired.');
        setChecking(false);
        return;
      }
      // Any other failure (5xx, timeout, offline) says nothing about the token,
      // so save it anyway: a flaky server must not block entry.
    }
    // Data belongs to a token: drop everything cached for the previous one.
    queryClient.clear();
    setToken(token);
    setChecking(false);
    router.replace('/');
  }

  const notice =
    reason === 'unauthorized'
      ? 'Your token was rejected. It may have expired. Enter a valid token to continue.'
      : hasToken
        ? 'A token is saved. Enter a new one to replace it.'
        : 'Enter the API token from your task email. It is kept only in this browser.';

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.notice, { color: colors.text }]}>{notice}</Text>
        <TextInput
          value={value}
          onChangeText={(text) => {
            setValue(text);
            setError(null);
          }}
          onSubmitEditing={() => void save()}
          placeholder="Paste your token"
          placeholderTextColor={colors.border}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!checking}
          style={[styles.input, { color: colors.text, borderColor: error ? colors.notification : colors.border }]}
        />
        {error ? <Text style={{ color: colors.notification }}>{error}</Text> : null}
        <Pressable
          onPress={() => void save()}
          disabled={checking}
          style={StyleSheet.flatten([styles.button, { backgroundColor: colors.primary, opacity: checking ? 0.6 : 1 }])}
        >
          {checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save token</Text>}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  notice: { fontSize: 15, lineHeight: 21 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
