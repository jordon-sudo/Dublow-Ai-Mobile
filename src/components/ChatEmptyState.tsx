// src/components/ChatEmptyState.tsx
// Landing UI shown when the active conversation has no messages yet.
// Design:
//   - Greeting
//   - Big tappable model name (opens the model picker)
//   - Row of quick-action buttons: Choose Prompt, Image Generation
//
// All interaction is plumbed back through props so the parent
// (ChatScreen) owns the state (picker visibility, model switching,
// navigation). This component is purely presentational + callbacks.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radii, fontSize } from '../theme';

interface Props {
  modelLabel: string;
  onPickModel: () => void;
  onChoosePrompt: () => void;
  onImageGeneration: () => void;
}

export default function ChatEmptyState({
  modelLabel,
  onPickModel,
  onChoosePrompt,
  onImageGeneration,
}: Props) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.greeting, { color: theme.colors.textMuted }]}>
        What can I help with?
      </Text>

      {/* Big tappable model name — the focal point of the screen. */}
      <Pressable
        onPress={onPickModel}
        style={({ pressed }) => [
          styles.modelTile,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.modelLabel, { color: theme.colors.textMuted }]}>
          Current model
        </Text>
        <Text
          style={[styles.modelName, { color: theme.colors.text }]}
          numberOfLines={2}
        >
          {modelLabel || 'Select a model'}
        </Text>
        <View style={styles.modelFooter}>
          <Ionicons
            name="swap-horizontal"
            size={14}
            color={theme.colors.textMuted}
          />
          <Text style={[styles.modelHint, { color: theme.colors.textMuted }]}>
            Tap to change
          </Text>
        </View>
      </Pressable>

      {/* Quick actions */}
      <View style={styles.actionsRow}>
        <ActionButton
          icon="bookmarks-outline"
          label="Choose Prompt"
          onPress={onChoosePrompt}
          theme={theme}
        />
        <ActionButton
          icon="image-outline"
          label="Image Generation"
          onPress={onImageGeneration}
          theme={theme}
        />
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <Text style={[styles.actionLabel, { color: theme.colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  greeting: {
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  modelTile: {
    width: '100%',
    maxWidth: 420,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: spacing.sm,
  },
  modelLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  modelName: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 36,
  },
  modelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  modelHint: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
    maxWidth: 420,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
});