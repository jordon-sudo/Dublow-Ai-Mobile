// app/signin.tsx
import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '../src/store/settingsStore';
import { HatzClient } from '../src/lib/hatzClient';
import { useTheme, spacing, radii, fontSize } from '../src/theme';

type Step = 'form' | 'api_failed' | 'user_failed';

export default function SignInScreen() {
  const theme = useTheme();
  const setAuth = useSettings((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [manualHashId, setManualHashId] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string>('');

  const verify = async () => {
    const e = email.trim().toLowerCase();
    const k = apiKey.trim();
    if (!e || !k) {
      setErrorDetail('Email and API key are required.');
      return;
    }
    setBusy(true);
    setErrorDetail('');
    const client = new HatzClient(k);

    // Step 1: API key
    try {
      await client.testConnection();
    } catch (err: any) {
      setErrorDetail(err?.message ?? 'Unknown error');
      setStep('api_failed');
      setBusy(false);
      return;
    }

    // Step 2: user lookup
    try {
      const user = await client.getUserByEmail(e);
      if (!user?.id) {
        setErrorDetail('No user found for that email.');
        setStep('user_failed');
        setBusy(false);
        return;
      }
      await setAuth({ apiKey: k, userEmail: e, userHashId: user.id });
      setBusy(false);
      router.replace('/');
    } catch (err: any) {
      setErrorDetail(err?.message ?? 'Unknown error');
      setStep('user_failed');
      setBusy(false);
    }
  };

  const submitManualHashId = async () => {
    const id = manualHashId.trim();
    if (!id.startsWith('user_')) {
      setErrorDetail('User ID must begin with "user_".');
      return;
    }
    await setAuth({
      apiKey: apiKey.trim(),
      userEmail: email.trim().toLowerCase(),
      userHashId: id,
    });
    router.replace('/');
  };

  const curlCommand = `curl.exe -H "X-API-Key: ${apiKey || 'YOUR_API_KEY'}" "https://ai.hatz.ai/v1/admin/users?email=${email || 'YOUR_EMAIL'}"`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.logo, { backgroundColor: theme.colors.primarySoft }]}>
            <Ionicons name="sparkles" size={32} color={theme.colors.primary} />
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>Sign In</Text>
          <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
            Connect your Hatz account
          </Text>

          {step === 'form' && (
            <View style={{ width: '100%', gap: spacing.md }}>
              <Field
                label="Hatz Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@company.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Hatz API Key"
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="Paste your API key"
                secureTextEntry
                autoCapitalize="none"
              />
              {errorDetail ? (
                <Text style={styles.err}>{errorDetail}</Text>
              ) : null}
              <Pressable
                onPress={verify}
                disabled={busy}
                style={[styles.primaryBtn, { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : 1 }]}
              >
                {busy ? (
                  <ActivityIndicator color={theme.colors.primaryText} />
                ) : (
                  <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>
                    Verify & Continue
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {step === 'api_failed' && (
            <View style={{ width: '100%', gap: spacing.md }}>
              <ErrorCard
                icon="key-outline"
                title="API key rejected"
                body={`We could not authenticate with that API key.\n\nDetails: ${errorDetail}\n\nDouble-check the key in your Hatz admin dashboard and try again. If the issue persists, email help@hatz.ai.`}
              />
              <Pressable
                onPress={() => { setStep('form'); setErrorDetail(''); }}
                style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]}
              >
                <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>Try Again</Text>
              </Pressable>
            </View>
          )}

          {step === 'user_failed' && (
            <View style={{ width: '100%', gap: spacing.md }}>
              <ErrorCard
                icon="person-outline"
                title="Could not retrieve your User ID"
                body={`Your API key worked, but we couldn't look up your User ID automatically.\n\nDetails: ${errorDetail}\n\nYou can find it manually by running this command in a terminal (PowerShell on Windows, Terminal on macOS/Linux), then paste the "id" field from the JSON response below.`}
              />

              <View style={[styles.codeBox, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                <Text selectable style={[styles.codeText, { color: theme.colors.text }]}>
                  {curlCommand}
                </Text>
                <Pressable
                  onPress={() => Clipboard.setStringAsync(curlCommand)}
                  style={[styles.copyBtn, { borderColor: theme.colors.border }]}
                >
                  <Ionicons name="copy-outline" size={14} color={theme.colors.textMuted} />
                  <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs, marginLeft: 4 }}>Copy</Text>
                </Pressable>
              </View>

              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
                The response looks like{' '}
                <Text style={styles.mono}>{`{"id":"user_abc123...", ...}`}</Text>
                {'\n'}Copy the value of "id" and paste it below.
              </Text>

              <Field
                label="User HashID"
                value={manualHashId}
                onChangeText={setManualHashId}
                placeholder="user_..."
                autoCapitalize="none"
              />
              <Pressable
                onPress={submitManualHashId}
                style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]}
              >
                <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>Continue</Text>
              </Pressable>
              <Pressable onPress={() => { setStep('form'); setErrorDetail(''); setManualHashId(''); }}>
                <Text style={{ color: theme.colors.textMuted, textAlign: 'center', fontSize: fontSize.sm }}>
                  ← Back to sign in
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------------- helpers ---------------- */

function Field(props: any) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color: theme.colors.text }]}>{props.label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      />
    </View>
  );
}

function ErrorCard({ icon, title, body }: { icon: any; title: string; body: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.errorCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.errorHeader}>
        <Ionicons name={icon} size={20} color="#e11d48" />
        <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{title}</Text>
      </View>
      <Text style={[styles.errorBody, { color: theme.colors.textMuted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  logo: {
    width: 72, height: 72, borderRadius: radii.pill,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.xxl, fontWeight: '700' },
  sub: { fontSize: fontSize.md, marginBottom: spacing.lg, textAlign: 'center' },

  label: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },

  primaryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: fontSize.md, fontWeight: '600' },

  err: { color: '#e11d48', fontSize: fontSize.sm },

  errorCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorTitle: { fontSize: fontSize.md, fontWeight: '700' },
  errorBody: { fontSize: fontSize.sm, lineHeight: 20 },

  codeBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  codeText: {
    fontSize: fontSize.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },

  helper: { fontSize: fontSize.sm, lineHeight: 20 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});