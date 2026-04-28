// app/workflows/[appId].tsx
// Runner screen for multi-step Workflows.
// Loads schema → renders AppInputForm → POST /v1/workflows/run →
// tracks the job in workflowJobsStore → navigates to the Jobs screen.
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
import { useTheme, spacing, radii, fontSize } from '../../src/theme';
import { useSettings } from '../../src/store/settingsStore';
import { HatzClient } from '../../src/lib/hatzClient';
import AppInputForm, { type InputValues } from '../../src/components/AppInputForm';
import type { AppItem, UserInput } from '../../src/lib/appsTypes';
import { isWorkflow } from '../../src/lib/appsTypes';
import { useWorkflowJobs } from '../../src/store/workflowJobsStore';

export default function WorkflowRunnerScreen() {
  const theme = useTheme();
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const apiKey = useSettings((s) => s.apiKey);
  const trackJob = useWorkflowJobs((s) => s.trackJob);
  const hydrate = useWorkflowJobs((s) => s.hydrate);

  const [app, setApp] = useState<AppItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [values, setValues] = useState<InputValues>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const client = useMemo(() => (apiKey ? new HatzClient(apiKey) : null), [apiKey]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const load = useCallback(async () => {
    if (!client || !appId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await client.getAppRaw(String(appId));
      if (!isWorkflow(data)) {
        // Wrong runner for this id; bounce to the app runner.
        router.replace(`/apps/${appId}` as any);
        return;
      }
      setApp(data);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load workflow.');
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
    try {
      const id = (app as any).id ?? String(appId);
      const { job_id } = await client.runWorkflow(id, values);
      await trackJob({
        job_id,
        app_id: id,
        app_name: app.name,
        inputs: values,
      });
      router.replace(`/jobs/${job_id}` as any);
    } catch (e: any) {
      setRunError(e?.message ?? 'Run failed.');
      setRunning(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {app?.name ?? 'Workflow'}
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

              <View
                style={[
                  styles.infoChip,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <Ionicons name="git-branch-outline" size={14} color={theme.colors.textMuted} />
                <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs }}>
                  {app.steps?.length ?? 0} step{(app.steps?.length ?? 0) === 1 ? '' : 's'}
                </Text>
              </View>

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
                  <Text style={[styles.runText, { color: theme.colors.primaryText }]}>
                    Run workflow
                  </Text>
                )}
              </Pressable>

              {runError ? (
                <Text style={{ color: theme.colors.danger }}>{runError}</Text>
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
  infoChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  runBtn: {
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  runText: { fontSize: fontSize.md, fontWeight: '700' },
});