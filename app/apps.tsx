// app/apps.tsx
import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../src/store/settingsStore';
import { useTheme, spacing, radii, fontSize } from '../src/theme';
import type { AppInfo } from '../src/lib/hatzClient';

export default function AppsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { apiKey, apps, getClient } = useSettings();
  const [loading, setLoading] = useState(false);
  const [localApps, setLocalApps] = useState<AppInfo[]>(apps);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = await client.listApps();
      setLocalApps(fresh);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load apps');
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => { load(); }, [load]);

  if (!apiKey) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
        <Stack.Screen options={{ title: 'Apps' }} />
        <View style={styles.empty}>
          <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.md }}>
            Add your API key in Settings to view apps.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Apps',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTitleStyle: { color: theme.colors.text },
          headerTintColor: theme.colors.text,
        }}
      />
      <FlatList
        data={localApps}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.text} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <>
                <Ionicons name="apps-outline" size={36} color={theme.colors.textMuted} />
                <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.md, marginTop: spacing.md }}>
                  {error ?? 'No apps available.'}
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/app/${item.id}` as any)}
            style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <View style={[styles.appIcon, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons name="sparkles" size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }} numberOfLines={1}>
                {item.name}
              </Text>
              {item.description ? (
                <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing.sm,
  },
  appIcon: {
    width: 40, height: 40, borderRadius: radii.pill,
    alignItems: 'center', justifyContent: 'center',
  },
});