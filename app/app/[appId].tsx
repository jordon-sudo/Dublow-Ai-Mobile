// app/apps/[appId].tsx
// Runner screen for single-prompt Apps.
// Loads schema, renders AppInputForm, submits via client.runApp, shows result.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme, spacing, radii, fontSize } from '../../src/theme';
import { useSettings } from '../../src/store/settingsStore';
import { HatzClient } from '../../src/lib/hatzClient';
import AppInputForm, { type InputValues } from '../../src/components/AppInputForm';
import type { AppItem, UserInput } from '../../src/lib/appsTypes';
import { isWorkflow } from '../../src/lib/appsTypes';
import * as Crypto from 'expo-crypto';
import { useWorkflowJobs } from '../../src/store/workflowJobsStore';
import { startAppRun } from '../../src/lib/appRunRegistry';
import { track, captureError } from '../../src/lib/telemetry';

export default function AppRunnerScreen() {
  const theme = useTheme();
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const apiKey = useSettings((s) => s.apiKey);

  const [app, setApp] = useState<AppItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [values, setValues] = useState<InputValues>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const client = useMemo(() => (apiKey ? new HatzClient(apiKey) : null), [apiKey]);

  const load = useCallback(async () => {
    if (!client || !appId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await client.getAppRaw(String(appId));
      if (isWorkflow(data)) {
        // Wrong runner for this id; bounce the user to the workflow runner.
        router.replace(`/workflows/${appId}` as any);
        return;
      }
      setApp(data);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load app.');
      track('app_detail_load_failed');
      captureError(e, { where: 'app.load' });
    } finally {
      setLoading(false);
    }
  }, [client, appId]);

  useEffect(() => {
    void load();
  }, [load]);

  const requiredMissing = useMemo(() => {
    if (!app) return false;
    return app.user_inputs.some(
      (i: UserInput) => i.required && !(values[i.variable_name] ?? '').trim(),
    );
  }, [app, values]);

  const run = async () => {
    if (!client || !app) return;
    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      const id = (app as any).id ?? String(appId);
      const localJobId = `app-${Crypto.randomUUID()}`;

      const inputCount = Object.keys(values).length;
      const filledCount = Object.values(values).filter(
        (v) => typeof v === 'string' ? v.trim().length > 0 : v != null,
      ).length;
      track('app_run_started', {
        input_count: inputCount,
        filled_count: filledCount,
      });

      await useWorkflowJobs.getState().trackAppJob({
        job_id: localJobId,
        app_id: id,
        app_name: app.name,
        inputs: values,
      });

      startAppRun({
        localJobId,
        appId: id,
        appName: app.name,
        inputs: values,
        client,
      });

      router.replace(`/jobs/${localJobId}` as any);
    } catch (e: any) {
      setRunError(e?.message ?? 'Run failed.');
      setRunning(false);
      track('app_run_start_failed');
      captureError(e, { where: 'app.run' });
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await Clipboard.setStringAsync(result);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {app?.name ?? 'App'}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : loadError ? (
            <Text style={{ color: theme.colors.danger, textAlign: 'center' }}>{loadError}</Text>
          ) : !app ? null : (
            <>
              {app.description ? (
                <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.sm }}>
                  {app.description}
                </Text>
              ) : null}

              <AppInputForm
                inputs={app.user_inputs}
                values={values}
                onChange={setValues}
                scopeAppId={(app as any).id ?? String(appId)}
              />

              <Pressable
                onPress={run}
                disabled={running || requiredMissing}
                style={[
                  styles.runBtn,
                  {
                    backgroundColor:
                      running || requiredMissing ? theme.colors.surfaceAlt : theme.colors.primary,
                  },
                ]}
              >
                {running ? (
                  <ActivityIndicator color={theme.colors.primaryText} />
                ) : (
                  <Text style={[styles.runText, { color: theme.colors.primaryText }]}>Run</Text>
                )}
              </Pressable>

              {runError ? (
                <Text style={{ color: theme.colors.danger }}>{runError}</Text>
              ) : null}

              {result ? (
                <View
                  style={[
                    styles.resultBox,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  ]}
                >
                  <View style={styles.resultHeader}>
                    <Text style={[styles.resultLabel, { color: theme.colors.textMuted }]}>
                      Result
                    </Text>
                    <Pressable onPress={copyResult} hitSlop={8} style={styles.copyBtn}>
                      <Ionicons name="copy-outline" size={16} color={theme.colors.textMuted} />
                      <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs }}>
                        Copy
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: theme.colors.text, fontSize: fontSize.md }} selectable>
                    {result}
                  </Text>
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
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  title: { flex: 1, textAlign: 'center', fontSize: fontSize.lg, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  runBtn: {
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  runText: { fontSize: fontSize.md, fontWeight: '700' },
  resultBox: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: fontSize.xs, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});