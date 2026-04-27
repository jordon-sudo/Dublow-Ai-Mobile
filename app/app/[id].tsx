// app/app/[id].tsx
import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { useSettings } from '../../src/store/settingsStore';
import { useTheme, spacing, radii, fontSize } from '../../src/theme';
import type { AppInfo, AppInput } from '../../src/lib/hatzClient';

export default function AppDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apps, selectedModel, getClient } = useSettings();

  const [app, setApp] = useState<AppInfo | null>(() => apps.find((a) => a.id === id) ?? null);
  const [loading, setLoading] = useState(!app);
  const [values, setValues] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Try to enrich app with schema from GET /v1/app/{id} if available.
  useEffect(() => {
    const client = getClient();
    if (!client || !id) return;
    (async () => {
      try {
        const detailed = await client.getApp(id);
        if (detailed) setApp(detailed);
      } catch {
        // fall back to list-sourced app
      } finally {
        setLoading(false);
      }
    })();
  }, [id, getClient]);

  const setField = (name: string, v: string) => setValues((prev) => ({ ...prev, [name]: v }));

  const run = async () => {
    const client = getClient();
    if (!client || !app) return;

    // Validate required fields.
    const missing = (app.inputs ?? [])
      .filter((i) => i.required && !String(values[i.name] ?? '').trim())
      .map((i) => i.label ?? i.name);
    if (missing.length) {
      Alert.alert('Missing fields', missing.join(', '));
      return;
    }

    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const result = await client.runApp({
        appId: app.id,
        inputs: values,
      });
      setOutput(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to run app');
    } finally {
      setRunning(false);
    }
  };

  const renderField = (input: AppInput) => {
    const type = (input.type ?? 'text').toLowerCase();
    const multiline = type === 'paragraph' || type === 'textarea' || type === 'long_answer';
    return (
      <View key={input.name} style={{ marginBottom: spacing.md }}>
        <Text style={[styles.label, { color: theme.colors.text }]}>
          {input.label ?? input.name}
          {input.required ? <Text style={{ color: theme.colors.primary }}> *</Text> : null}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
              minHeight: multiline ? 100 : 44,
              textAlignVertical: multiline ? 'top' : 'center',
            },
          ]}
          placeholder={input.placeholder ?? ''}
          placeholderTextColor={theme.colors.textMuted}
          value={values[input.name] ?? ''}
          onChangeText={(v) => setField(input.name, v)}
          multiline={multiline}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: app?.name ?? 'App',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTitleStyle: { color: theme.colors.text },
          headerTintColor: theme.colors.text,
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
          {loading && !app ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : !app ? (
            <Text style={{ color: theme.colors.textMuted }}>App not found.</Text>
          ) : (
            <>
              {app.description ? (
                <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.md, marginBottom: spacing.lg }}>
                  {app.description}
                </Text>
              ) : null}

              {(app.inputs && app.inputs.length > 0) ? (
                app.inputs.map(renderField)
              ) : (
                <Text style={{ color: theme.colors.textMuted, marginBottom: spacing.lg }}>
                  This app requires no inputs.
                </Text>
              )}

              <Pressable
                onPress={run}
                disabled={running}
                style={[styles.runBtn, { backgroundColor: running ? theme.colors.surfaceAlt : theme.colors.primary }]}
              >
                {running ? (
                  <ActivityIndicator color={theme.colors.primaryText} />
                ) : (
                  <>
                    <Ionicons name="play" size={16} color={theme.colors.primaryText} />
                    <Text style={[styles.runBtnText, { color: theme.colors.primaryText }]}>Run App</Text>
                  </>
                )}
              </Pressable>

              {error ? (
                <View style={[styles.errorBox, { borderColor: theme.colors.border }]}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '600', marginBottom: 4 }}>Error</Text>
                  <Text style={{ color: theme.colors.text }}>{error}</Text>
                </View>
              ) : null}

              {output ? (
                <View style={[styles.outputBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Text style={[styles.outputLabel, { color: theme.colors.textMuted }]}>Output</Text>
                  <Markdown
                    style={{
                      body: { color: theme.colors.text, fontSize: fontSize.md, lineHeight: 24 },
                      code_inline: { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, paddingHorizontal: 4, borderRadius: 4 },
                      fence: { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, padding: spacing.md, borderRadius: radii.md },
                      link: { color: theme.colors.primary },
                    }}
                  >
                    {output}
                  </Markdown>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  label: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
  runBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    marginTop: spacing.sm,
  },
  runBtnText: { fontSize: fontSize.md, fontWeight: '700' },
  errorBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  outputBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  outputLabel: {
    fontSize: fontSize.xs, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: spacing.sm,
  },
});