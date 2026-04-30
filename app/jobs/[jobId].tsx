// app/jobs/[jobId].tsx
// Job detail screen. Handles both real workflow jobs (polls server) and
// client-side app pseudo-jobs (reads output from local store).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTheme, spacing, radii, fontSize } from '../../src/theme';
import AssistantMarkdown from '../../src/components/AssistantMarkdown';
import JobAttachment from '../../src/components/JobAttachment';
import { useSettings } from '../../src/store/settingsStore';
import { HatzClient } from '../../src/lib/hatzClient';
import { useWorkflowJobs } from '../../src/store/workflowJobsStore';
import {
  isTerminalStatus,
  type StepOutput,
  type WorkflowJob,
} from '../../src/lib/appsTypes';

const POLL_INTERVAL_MS = 3000;
const COPIED_FLASH_MS = 1500;

export default function JobScreen() {
  const theme = useTheme();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const apiKey = useSettings((s) => s.apiKey);

  const hydrate = useWorkflowJobs((s) => s.hydrate);
  const updateJob = useWorkflowJobs((s) => s.updateJob);
  const trackedJob = useWorkflowJobs((s) =>
    jobId ? s.jobs[String(jobId)] ?? null : null,
  );

  const client = useMemo(() => (apiKey ? new HatzClient(apiKey) : null), [apiKey]);

  const [snapshot, setSnapshot] = useState<WorkflowJob | null>(
    trackedJob?.last_snapshot ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(!trackedJob?.last_snapshot);

  const pollingRef = useRef(true);
  const isAppJob = trackedJob ? !trackedJob.is_workflow : false;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const poll = useCallback(async () => {
    if (!client || !jobId || isAppJob) return;
    try {
      const fresh = await client.getJobStatus(String(jobId));
      setSnapshot(fresh);
      setError(null);
      await updateJob(String(jobId), fresh);
      if (isTerminalStatus(fresh.status)) {
        pollingRef.current = false;
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch job status.');
    } finally {
      setInitialLoading(false);
    }
  }, [client, jobId, updateJob, isAppJob]);

  useEffect(() => {
    if (isAppJob) {
      setInitialLoading(false);
      return;
    }
    pollingRef.current = true;
    void poll();
    const timer = setInterval(() => {
      if (pollingRef.current) void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      pollingRef.current = false;
      clearInterval(timer);
    };
  }, [poll, isAppJob]);

  const statusColor = (s: string | undefined) => {
    if (s === 'complete') return theme.colors.success;
    if (s === 'failed') return theme.colors.danger;
    return theme.colors.textMuted;
  };

  const headerTitle = trackedJob?.app_name ?? 'Job';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View
          style={[
            styles.statusCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.statusRow}>
            <Text style={[styles.statusLabel, { color: theme.colors.textMuted }]}>Status</Text>
            <View style={styles.statusRight}>
              {!isTerminalStatus(trackedJob?.status ?? snapshot?.status) ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : null}
              <Text
                style={[
                  styles.statusValue,
                  { color: statusColor(trackedJob?.status ?? snapshot?.status) },
                ]}
              >
                {(trackedJob?.status ?? snapshot?.status ?? 'pending').toString()}
              </Text>
            </View>
          </View>
          <Text style={[styles.jobIdText, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {String(jobId)}
          </Text>
        </View>

        {isAppJob && trackedJob ? (
          <AppOutputBlock job={trackedJob} />
        ) : initialLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : error && !snapshot ? (
          <Text style={{ color: theme.colors.danger, textAlign: 'center' }}>{error}</Text>
        ) : (
          (snapshot?.step_outputs ?? [])
            .slice()
            .sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0))
            .map((step, idx) => (
              <StepCard
                key={step.step_id ?? `${idx}`}
                index={idx}
                step={step}
                jobId={String(jobId)}
                client={client}
              />
            ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------ copy button ----------------------------- */

function CopyButton({
  getText,
  align = 'flex-end',
}: {
  getText: () => string | null | undefined;
  align?: 'flex-start' | 'flex-end' | 'center';
}) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onPress = async () => {
    const text = getText();
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Clipboard failures are non-fatal; no-op.
    }
    if (!mountedRef.current) return;
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (mountedRef.current) setCopied(false);
    }, COPIED_FLASH_MS);
  };

  const color = copied ? theme.colors.success : theme.colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: align }}
    >
      <Ionicons
        name={copied ? 'checkmark' : 'copy-outline'}
        size={14}
        color={color}
      />
      <Text style={{ color, fontSize: fontSize.xs }}>
        {copied ? 'Copied' : 'Copy'}
      </Text>
    </Pressable>
  );
}

/* ------------------------------ app output ----------------------------- */

function AppOutputBlock({
  job,
}: {
  job: { status: string; output_data?: string; error?: string };
}) {
  const theme = useTheme();
  const isRunning = !isTerminalStatus(job.status);
  const failed = job.status === 'failed';
  const text = failed ? job.error ?? 'Run failed.' : job.output_data ?? '';

  if (isRunning) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ color: theme.colors.textMuted, marginTop: spacing.sm }}>Running…</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.stepCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          padding: spacing.md,
        },
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.sm,
        }}
      >
        <Text style={{ color: failed ? theme.colors.danger : theme.colors.text, fontWeight: '700' }}>
          {failed ? 'Error' : 'Output'}
        </Text>
        {text ? <CopyButton getText={() => text} align="flex-end" /> : null}
      </View>
      {failed ? (
        <Text selectable style={{ color: theme.colors.danger, fontSize: fontSize.sm, lineHeight: 22 }}>
          {text || '(no output)'}
        </Text>
      ) : text ? (
        <AssistantMarkdown>{text}</AssistantMarkdown>
      ) : (
        <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.sm }}>(no output)</Text>
      )}
    </View>
  );
}

/* ------------------------------- step card ------------------------------ */

function StepCard({
  index,
  step,
  jobId,
  client,
}: {
  index: number;
  step: StepOutput;
  jobId: string;
  client: HatzClient | null;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const statusColor =
    step.status === 'complete'
      ? theme.colors.success
      : step.status === 'failed'
        ? theme.colors.danger
        : theme.colors.textMuted;

  const isFileOutput =
    step.output_type === 'file' ||
    step.output_type === 'document' ||
    step.output_type === 'image';

  const textOutput =
    typeof step.output_data === 'string'
      ? step.output_data
      : step.output_data != null
        ? JSON.stringify(step.output_data, null, 2)
        : null;

  // Structured JSON (stringified) is not markdown; keep as monospace.
  const textIsMarkdown =
    typeof step.output_data === 'string' && step.output_type !== 'json';

  

  return (
    <View
      style={[
        styles.stepCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Pressable onPress={() => setExpanded((x) => !x)} style={styles.stepHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Step {index + 1}
            {step.step_type ? ` · ${step.step_type}` : ''}
          </Text>
          <Text style={[styles.stepStatus, { color: statusColor }]}>{step.status}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.textMuted}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.stepBody}>
          {isFileOutput && step.status === 'complete' ? (
            <JobAttachment
              jobId={jobId}
              stepId={step.step_id}
              outputType={step.output_type}
              client={client}
            />
          ) : isFileOutput ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.sm }}>
              Attachment will appear here when the step completes.
            </Text>
          ) : null}

          {textOutput ? (
            <View style={styles.outputBlock}>
              <CopyButton getText={() => textOutput} align="flex-end" />
              {textIsMarkdown ? (
                <AssistantMarkdown>{textOutput}</AssistantMarkdown>
              ) : (
                <Text
                  selectable
                  style={{
                    color: theme.colors.text,
                    fontSize: fontSize.sm,
                    fontFamily: 'Courier',
                  }}
                >
                  {textOutput}
                </Text>
              )}
            </View>
          ) : null}

          {!textOutput && !isFileOutput ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.sm }}>
              No output yet.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* -------------------------------- styles ------------------------------- */

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
  center: { alignItems: 'center', paddingVertical: spacing.xxl },

  statusCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusValue: { fontSize: fontSize.md, fontWeight: '700', textTransform: 'capitalize' },
  jobIdText: { fontSize: fontSize.xs },

  stepCard: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  stepTitle: { fontSize: fontSize.md, fontWeight: '600' },
  stepStatus: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  stepBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  actionText: { fontSize: fontSize.md, fontWeight: '700' },

  outputBlock: { gap: spacing.xs },
});