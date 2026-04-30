// app/prompt-fill.tsx
import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePrompts } from '../src/store/promptsStore';
import {
  extractPlaceholders,
  substitutePlaceholders,
  humanizePlaceholder,
} from '../src/lib/promptTemplate';
import { useTheme, spacing, radii, fontSize } from '../src/theme';
import { track } from '../src/lib/telemetry';

export default function PromptFillScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();

  const prompts = usePrompts((s) => s.prompts);
  const recordUsage = usePrompts((s) => s.recordUsage);

  const prompt = useMemo(
    () => (params.id ? prompts.find((p) => p.id === params.id) : undefined),
    [params.id, prompts],
  );

  const placeholders = useMemo(
    () => (prompt ? extractPlaceholders(prompt.body) : []),
    [prompt],
  );

  // One state slot per placeholder. Keyed by variable name.
  const [values, setValues] = useState<Record<string, string>>({});

  // Graceful fallback if the prompt was deleted mid-navigation.
  if (!prompt) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={theme.colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Prompt not found</Text>
          <Pressable
            onPress={() => router.back()}
            style={[styles.primaryBtn, { backgroundColor: theme.colors.primary, marginTop: spacing.lg }]}
          >
            <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // If somehow this screen was opened for a prompt with no placeholders, just forward it on.
  if (placeholders.length === 0) {
    recordUsage(prompt.id);
    router.replace({ pathname: '/', params: { prefill: prompt.body } });
    return null;
  }

  const setValue = (name: string, v: string) =>
    setValues((prev) => ({ ...prev, [name]: v }));

  const allFilled = placeholders.every((p) => (values[p] ?? '').trim().length > 0);

  const submit = () => {
    if (!allFilled) {
      Alert.alert(
        'Missing fields',
        'Please fill every variable before running this prompt. Empty fields will leave raw {{placeholders}} in the message.',
      );
      return;
    }
    const resolved = substitutePlaceholders(prompt.body, values);
    recordUsage(prompt.id);
    track('prompt_filled_submitted', {
      mode: 'complete',
      placeholder_count: placeholders.length,
      filled_count: placeholders.filter((p) => (values[p] ?? '').trim().length > 0).length,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace({ pathname: '/', params: { prefill: resolved } });
  };

  const submitAnyway = () => {
    // Allow sending with partial fills - unknown placeholders are preserved by substitutePlaceholders.
    const resolved = substitutePlaceholders(prompt.body, values);
    recordUsage(prompt.id);
    track('prompt_filled_submitted', {
      mode: 'as_is',
      placeholder_count: placeholders.length,
      filled_count: placeholders.filter((p) => (values[p] ?? '').trim().length > 0).length,
    });
    Haptics.selectionAsync().catch(() => {});
    router.replace({ pathname: '/', params: { prefill: resolved } });
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {prompt.title}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 140 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Prompt preview */}
          <View style={[styles.previewBox, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Prompt</Text>
            <Text style={{ color: theme.colors.text, fontSize: fontSize.sm, lineHeight: 20 }}>
              {prompt.body}
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: spacing.lg }]}>
            Fill in the variables
          </Text>

          {placeholders.map((name) => (
            <View key={name} style={{ marginBottom: spacing.md }}>
              <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
                {humanizePlaceholder(name)}
              </Text>
              <Text style={[styles.fieldHint, { color: theme.colors.textMuted }]}>
                {'{{' + name + '}}'}
              </Text>
              <TextInput
                value={values[name] ?? ''}
                onChangeText={(v) => setValue(name, v)}
                placeholder={`Enter ${humanizePlaceholder(name).toLowerCase()}`}
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.fieldInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
                multiline
                textAlignVertical="top"
              />
            </View>
          ))}
        </ScrollView>

        {/* Footer actions */}
        <View style={[
          styles.footer,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
          },
        ]}>
          <Pressable
            onPress={submitAnyway}
            style={[styles.secondaryBtn, { borderColor: theme.colors.border }]}
          >
            <Text style={{ color: theme.colors.text, fontSize: fontSize.sm, fontWeight: '600' }}>
              Use as-is
            </Text>
          </Pressable>
          <Pressable
            onPress={submit}
            disabled={!allFilled}
            style={[styles.primaryBtn, {
              backgroundColor: theme.colors.primary,
              opacity: allFilled ? 1 : 0.5,
              flex: 1,
            }]}
          >
            <Ionicons name="send" size={16} color={theme.colors.primaryText} />
            <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>
              Send to chat
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '700', marginTop: spacing.md },

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

  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },

  previewBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
  },

  fieldLabel: { fontSize: fontSize.md, fontWeight: '700', marginBottom: 2 },
  fieldHint: { fontSize: fontSize.xs, fontStyle: 'italic', marginBottom: spacing.xs },
  fieldInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    minHeight: 60,
    lineHeight: 22,
  },

  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  primaryBtnText: { fontSize: fontSize.md, fontWeight: '700' },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});