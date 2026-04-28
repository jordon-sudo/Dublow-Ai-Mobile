// app/apps.tsx
// Tabbed Apps/Workflows launcher with shared search.
// Left tab = single-prompt Apps. Right tab = multi-step Workflows.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { TabView, TabBar } from 'react-native-tab-view';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radii, fontSize } from '../src/theme';
import { useSettings } from '../src/store/settingsStore';
import { HatzClient } from '../src/lib/hatzClient';
import { isWorkflow, type AppItem } from '../src/lib/appsTypes';

type Route = { key: 'apps' | 'workflows'; title: string };

export default function AppsScreen() {
  const theme = useTheme();
  const layout = useWindowDimensions();
  const apiKey = useSettings((s) => s.apiKey);

  const [index, setIndex] = useState(0);
  const [routes] = useState<Route[]>([
    { key: 'apps', title: 'Apps' },
    { key: 'workflows', title: 'Workflows' },
  ]);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search input (server-side filter via ?name=).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!apiKey) {
        setItems([]);
        setLoading(false);
        setError('No API key configured. Add one in Settings.');
        return;
      }
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const client = new HatzClient(apiKey);
        const data = await client.listAppsRaw({
          name: debounced || undefined,
          limit: 200,
        });
        setItems(data);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load apps.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiKey, debounced],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const { apps, workflows } = useMemo(() => {
    const a: AppItem[] = [];
    const w: AppItem[] = [];
    for (const item of items) {
      if (isWorkflow(item)) w.push(item);
      else a.push(item);
    }
    return { apps: a, workflows: w };
  }, [items]);

  const onItemPress = (item: AppItem) => {
    const id = (item as any).id;
    if (!id) return;
    if (isWorkflow(item)) router.push(`/workflows/${id}` as any);
    else router.push(`/apps/${id}` as any);
  };

  const renderScene = ({ route }: { route: Route }) => {
    const data = route.key === 'apps' ? apps : workflows;
    return (
      <AppList
        data={data}
        loading={loading}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load({ silent: true });
        }}
        onPress={onItemPress}
        emptyLabel={
          route.key === 'apps'
            ? debounced
              ? 'No apps match your search.'
              : 'No apps available on this account.'
            : debounced
              ? 'No workflows match your search.'
              : 'No workflows available on this account.'
        }
        error={error}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]}>Apps & Workflows</Text>
        <Pressable onPress={() => router.push('/jobs' as any)} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="time-outline" size={22} color={theme.colors.text} />
          </Pressable>
      </View>

      <View
        style={[
          styles.searchRow,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Ionicons name="search" size={16} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search apps and workflows"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, { color: theme.colors.text }]}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <TabView
        navigationState={{ index, routes }}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
        renderScene={renderScene}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            style={{ backgroundColor: theme.colors.bg }}
            indicatorStyle={{ backgroundColor: theme.colors.primary, height: 2 }}
            activeColor={theme.colors.text}
            inactiveColor={theme.colors.textMuted}
            pressColor={theme.colors.surfaceAlt}
          />
        )}
      />
    </SafeAreaView>
  );
}

/* ---------------------------- inner list ---------------------------- */

function AppList({
  data,
  loading,
  refreshing,
  onRefresh,
  onPress,
  emptyLabel,
  error,
}: {
  data: AppItem[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onPress: (item: AppItem) => void;
  emptyLabel: string;
  error: string | null;
}) {
  const theme = useTheme();

  if (loading && data.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.colors.danger, textAlign: 'center', paddingHorizontal: spacing.lg }}>
          {error}
        </Text>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.colors.textMuted }}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item, i) => (item as any).id ?? `${item.name}-${i}`}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onPress(item)}
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.description ? (
              <Text style={[styles.cardDesc, { color: theme.colors.textMuted }]} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>
      )}
    />
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, paddingVertical: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600' },
  cardDesc: { fontSize: fontSize.sm, marginTop: 2 },
});