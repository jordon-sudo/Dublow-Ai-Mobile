// app/jobs/index.tsx
// List of all tracked workflow jobs. Tap to open the detail screen.
import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radii, fontSize } from '../../src/theme';
import { useWorkflowJobs } from '../../src/store/workflowJobsStore';
import { isTerminalStatus } from '../../src/lib/appsTypes';

export default function JobsListScreen() {
  const theme = useTheme();
  const hydrate = useWorkflowJobs((s) => s.hydrate);
  const hydrated = useWorkflowJobs((s) => s.hydrated);
  const order = useWorkflowJobs((s) => s.order);
  const jobs = useWorkflowJobs((s) => s.jobs);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const data = useMemo(
    () => order.map((id) => jobs[id]).filter(Boolean),
    [order, jobs],
  );

  const statusColor = (s: string) =>
    s === 'complete' ? theme.colors.success
    : s === 'failed' ? theme.colors.danger
    : theme.colors.textMuted;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]}>Jobs</Text>
        <View style={{ width: 32 }} />
      </View>

      {!hydrated ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: theme.colors.textMuted }}>No workflow runs yet.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(j) => j.job_id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/jobs/${item.job_id}` as any)}
              style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {item.app_name}
                </Text>
                <Text style={[styles.cardMeta, { color: statusColor(String(item.status)) }]}>
                  {String(item.status)}
                  {!isTerminalStatus(item.status) ? ' · running' : ''}
                </Text>
                <Text style={[styles.cardMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  title: { flex: 1, textAlign: 'center', fontSize: fontSize.lg, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth, gap: spacing.sm,
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600' },
  cardMeta: { fontSize: fontSize.xs, marginTop: 2, textTransform: 'capitalize' },
});