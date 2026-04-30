// app/prompt-edit.tsx
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePrompts, PERSONAL_FOLDER_ID, Prompt } from '../src/store/promptsStore';
import { extractPlaceholders, humanizePlaceholder } from '../src/lib/promptTemplate';
import { useTheme, spacing, radii, fontSize } from '../src/theme';

export default function PromptEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; folderId?: string }>();

  const folders = usePrompts((s) => s.folders);
  const prompts = usePrompts((s) => s.prompts);
  const createPrompt = usePrompts((s) => s.createPrompt);
  const updatePrompt = usePrompts((s) => s.updatePrompt);
  const deletePrompt = usePrompts((s) => s.deletePrompt);

  const existing: Prompt | undefined = useMemo(
    () => (params.id ? prompts.find((p) => p.id === params.id) : undefined),
    [params.id, prompts],
  );
  const isEdit = !!existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [folderId, setFolderId] = useState<string>(
    existing?.folderId ?? (typeof params.folderId === 'string' ? params.folderId : PERSONAL_FOLDER_ID),
  );
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => {
    // If someone navigates with an id that no longer exists (e.g. deleted elsewhere), bounce.
    if (params.id && !existing) {
      router.back();
    }
  }, [params.id, existing, router]);

  const placeholders = useMemo(() => extractPlaceholders(body), [body]);

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) { setTagDraft(''); return; }
    setTags([...tags, t]);
    setTagDraft('');
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const save = () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      Alert.alert('Title required', 'Please give this prompt a title.');
      return;
    }
    if (!trimmedBody) {
      Alert.alert('Body required', 'The prompt body cannot be empty.');
      return;
    }
    if (isEdit && existing) {
      updatePrompt(existing.id, { title: trimmedTitle, body: trimmedBody, folderId, tags });
    } else {
      createPrompt({ title: trimmedTitle, body: trimmedBody, folderId, tags });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert('Delete prompt?', `"${existing.title}" will be removed permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deletePrompt(existing.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {isEdit ? 'Edit Prompt' : 'New Prompt'}
        </Text>
        <Pressable onPress={save} style={styles.iconBtn} hitSlop={8}>
          <Text style={[styles.saveText, { color: theme.colors.primary }]}>Save</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Short, descriptive name"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          />

          {/* Folder */}
          <Text style={[styles.label, { color: theme.colors.textMuted, marginTop: spacing.md }]}>Folder</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}
          >
            {folders.map((f) => {
              const active = f.id === folderId;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFolderId(f.id)}
                  style={[styles.chip, {
                    backgroundColor: active ? theme.colors.primarySoft : 'transparent',
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  }]}
                >
                  <Ionicons
                    name="folder-outline"
                    size={12}
                    color={active ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <Text style={{
                    color: active ? theme.colors.primary : theme.colors.text,
                    fontSize: fontSize.sm,
                    fontWeight: active ? '700' : '600',
                  }}>
                    {f.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Body */}
          <Text style={[styles.label, { color: theme.colors.textMuted, marginTop: spacing.md }]}>
            Body
          </Text>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            Use {'{{variable_name}}'} for fillable placeholders.
          </Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Write your prompt here..."
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.textarea, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            multiline
            textAlignVertical="top"
          />

          {/* Placeholder preview */}
          {placeholders.length > 0 ? (
            <View style={[styles.placeholderBox, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <Text style={[styles.placeholderTitle, { color: theme.colors.textMuted }]}>
                {placeholders.length} variable{placeholders.length === 1 ? '' : 's'} detected
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {placeholders.map((p) => (
                  <View key={p} style={[styles.varChip, { borderColor: theme.colors.border }]}>
                    <Ionicons name="code-slash-outline" size={11} color={theme.colors.textMuted} />
                    <Text style={{ color: theme.colors.text, fontSize: fontSize.xs, fontWeight: '600' }}>
                      {humanizePlaceholder(p)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Tags */}
          <Text style={[styles.label, { color: theme.colors.textMuted, marginTop: spacing.md }]}>Tags</Text>
          <View style={[styles.tagInputRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <TextInput
              value={tagDraft}
              onChangeText={setTagDraft}
              onSubmitEditing={addTag}
              placeholder="Add a tag and press return"
              placeholderTextColor={theme.colors.textMuted}
              style={{ flex: 1, color: theme.colors.text, fontSize: fontSize.sm, paddingVertical: 6 }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />
            {tagDraft.trim().length > 0 ? (
              <Pressable onPress={addTag} hitSlop={8}>
                <Ionicons name="add-circle" size={22} color={theme.colors.primary} />
              </Pressable>
            ) : null}
          </View>
          {tags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm }}>
              {tags.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => removeTag(t)}
                  style={[styles.tagChip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                >
                  <Text style={{ color: theme.colors.text, fontSize: fontSize.xs, fontWeight: '600' }}>
                    #{t}
                  </Text>
                  <Ionicons name="close" size={12} color={theme.colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Delete (edit only) */}
          {isEdit ? (
            <Pressable
              onPress={confirmDelete}
              style={[styles.deleteBtn, { borderColor: theme.colors.border }]}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={{ color: '#ef4444', fontSize: fontSize.sm, fontWeight: '600' }}>
                Delete Prompt
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
  iconBtn: { padding: spacing.sm, minWidth: 44, alignItems: 'center' },
  saveText: { fontSize: fontSize.md, fontWeight: '700' },

  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
    fontStyle: 'italic',
  },

  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
  },
  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    minHeight: 180,
    lineHeight: 22,
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },

  placeholderBox: {
    marginTop: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  placeholderTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  varChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },

  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },

  deleteBtn: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});