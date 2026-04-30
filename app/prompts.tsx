// app/prompts.tsx
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable, StyleSheet, Alert, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePrompts, PERSONAL_FOLDER_ID, DUBLOW_FOLDER_ID, Prompt } from '../src/store/promptsStore';
import { hasPlaceholders } from '../src/lib/promptTemplate';
import { track, captureError } from '../src/lib/telemetry';
import { useTheme, spacing, radii, fontSize } from '../src/theme';

const FOLDER_ALL = '__all__';

export default function PromptsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const folders = usePrompts((s) => s.folders);
  const prompts = usePrompts((s) => s.prompts);
  const recordUsage = usePrompts((s) => s.recordUsage);
  const deleteFolder = usePrompts((s) => s.deleteFolder);
  const createFolder = usePrompts((s) => s.createFolder);
  const seedDublowIfNeeded = usePrompts((s) => s.seedDublowIfNeeded);

  const [activeFolderId, setActiveFolderId] = useState<string>(FOLDER_ALL);
  const [search, setSearch] = useState('');

  useEffect(() => { seedDublowIfNeeded(); }, [seedDublowIfNeeded]);

  const visiblePrompts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scoped = activeFolderId === FOLDER_ALL
      ? prompts
      : prompts.filter((p) => p.folderId === activeFolderId);
    const filtered = q
      ? scoped.filter((p) =>
          p.title.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q) ||
          p.tags.some((t) => t.includes(q)))
      : scoped;
    return [...filtered].sort((a, b) => {
      // Recently used first, then recently updated.
      const aUsed = a.lastUsedAt ?? 0;
      const bUsed = b.lastUsedAt ?? 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      return b.updatedAt - a.updatedAt;
    });
  }, [prompts, activeFolderId, search]);

  const usePrompt = (p: Prompt) => {
    Haptics.selectionAsync().catch(() => {});
    recordUsage(p.id);
    track('prompt_used', {
      has_placeholders: hasPlaceholders(p.body),
      folder_kind:
        p.folderId === DUBLOW_FOLDER_ID ? 'dublow'
        : p.folderId === PERSONAL_FOLDER_ID ? 'personal'
        : 'custom',
    });
    if (hasPlaceholders(p.body)) {
      router.push({ pathname: '/prompt-fill', params: { id: p.id } });
    } else {
      router.push({ pathname: '/', params: { prefill: p.body } });
    }
  };

  const openEdit = (p: Prompt) => {
    router.push({ pathname: '/prompt-edit', params: { id: p.id } });
  };

  const openCreate = () => {
    const folderId = activeFolderId === FOLDER_ALL ? PERSONAL_FOLDER_ID : activeFolderId;
    router.push({ pathname: '/prompt-edit', params: { folderId } });
  };

  const confirmDeleteFolder = (folderId: string, name: string) => {
    if (folderId === PERSONAL_FOLDER_ID) {
      Alert.alert('Cannot delete', 'The Personal folder cannot be deleted.');
      return;
    }
    const count = prompts.filter((p) => p.folderId === folderId).length;
    Alert.alert(
      `Delete "${name}"?`,
      count > 0
        ? `${count} prompt${count === 1 ? '' : 's'} will be moved to Personal.`
        : 'This folder is empty.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteFolder(folderId);
            track('prompt_folder_deleted');
            if (activeFolderId === folderId) setActiveFolderId(FOLDER_ALL);
          },
        },
      ],
    );
  };

  const promptForNewFolder = () => {
    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      Alert.prompt(
        'New Folder',
        'Name this folder',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Create',
            onPress: (name?: string) => {
              const n = (name || '').trim();
              if (!n) return;
              const id = createFolder(n);
              if (id) {
                setActiveFolderId(id);
                track('prompt_folder_created');
              }
            },
          },
        ],
        'plain-text',
      );
      return;
    }
    // Android / web fallback: route to the edit screen in "new folder" mode
    // would be ideal; for now, show an informative alert.
    Alert.alert(
      'New Folder',
      'Folder creation from this screen requires iOS. On Android, create a prompt first and assign it to a new folder via a future update.',
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Prompt Library</Text>
        <Pressable onPress={promptForNewFolder} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="folder-open-outline" size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Ionicons name="search" size={16} color={theme.colors.textMuted} />
        <TextInput
          placeholder="Search prompts"
          placeholderTextColor={theme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
          style={[styles.searchInput, { color: theme.colors.text }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Folder tabs */}
      <View style={styles.tabsWrap}>
        <FlatList
          horizontal
          data={[{ id: FOLDER_ALL, name: 'All', createdAt: 0 }, ...folders]}
          keyExtractor={(f) => f.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}
          renderItem={({ item }: { item: { id: string; name: string; createdAt: number } }) => {
            const active = item.id === activeFolderId;
            const count = item.id === FOLDER_ALL
              ? prompts.length
              : prompts.filter((p) => p.folderId === item.id).length;
            return (
              <Pressable
                onPress={() => setActiveFolderId(item.id)}
                onLongPress={() => item.id !== FOLDER_ALL && confirmDeleteFolder(item.id, item.name)}
                style={[styles.tab, {
                  backgroundColor: active ? theme.colors.primarySoft : 'transparent',
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                }]}
              >
                <Text style={{
                  color: active ? theme.colors.primary : theme.colors.text,
                  fontWeight: active ? '700' : '600',
                  fontSize: fontSize.sm,
                }}>
                  {item.name}
                </Text>
                <Text style={{
                  color: active ? theme.colors.primary : theme.colors.textMuted,
                  fontSize: fontSize.xs,
                  marginLeft: 6,
                }}>
                  {count}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* List */}
      <FlatList
        data={visiblePrompts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 96 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="bookmarks-outline" size={40} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No prompts here yet</Text>
            <Text style={[styles.emptySub, { color: theme.colors.textMuted }]}>
              Tap the plus button to add one.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const folder = folders.find((f) => f.id === item.folderId);
          const hasVars = hasPlaceholders(item.body);
          return (
            <Pressable
              onPress={() => usePrompt(item)}
              onLongPress={() => openEdit(item)}
              style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Pressable onPress={() => openEdit(item)} hitSlop={8} style={styles.editBtn}>
                  <Ionicons name="create-outline" size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>
              <Text style={[styles.cardBody, { color: theme.colors.textMuted }]} numberOfLines={2}>
                {item.body}
              </Text>
              <View style={styles.cardMeta}>
                {folder ? (
                  <View style={[styles.metaChip, { borderColor: theme.colors.border }]}>
                    <Ionicons name="folder-outline" size={11} color={theme.colors.textMuted} />
                    <Text style={[styles.metaChipText, { color: theme.colors.textMuted }]}>{folder.name}</Text>
                  </View>
                ) : null}
                {hasVars ? (
                  <View style={[styles.metaChip, { borderColor: theme.colors.border }]}>
                    <Ionicons name="code-slash-outline" size={11} color={theme.colors.textMuted} />
                    <Text style={[styles.metaChipText, { color: theme.colors.textMuted }]}>variables</Text>
                  </View>
                ) : null}
                {item.tags.slice(0, 3).map((t) => (
                  <View key={t} style={[styles.metaChip, { borderColor: theme.colors.border }]}>
                    <Text style={[styles.metaChipText, { color: theme.colors.textMuted }]}>#{t}</Text>
                  </View>
                ))}
                {item.tags.length > 3 ? (
                  <Text style={[styles.metaChipText, { color: theme.colors.textMuted, marginLeft: 2 }]}>
                    +{item.tags.length - 3}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Floating Action Button — create new prompt */}
      <Pressable
        onPress={openCreate}
        style={[styles.fab, {
          backgroundColor: theme.colors.primary,
          bottom: Math.max(insets.bottom, spacing.md) + spacing.md,
        }]}
        hitSlop={8}
      >
        <Ionicons name="add" size={26} color={theme.colors.primaryText} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  iconBtn: { padding: spacing.sm },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    paddingVertical: 2,
  },

  tabsWrap: { paddingVertical: spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },

  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  editBtn: { padding: 2, marginLeft: spacing.sm },
  cardBody: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaChipText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '700' },
  emptySub: { fontSize: fontSize.sm, textAlign: 'center' },

  fab: {
    position: 'absolute',
    right: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
});