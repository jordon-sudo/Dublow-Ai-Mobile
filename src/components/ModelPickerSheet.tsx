// src/components/ModelPickerSheet.tsx
// Reusable bottom-sheet modal for picking an AI model (or agent).
// Reads the grouped model/agent catalog from useSettings so the list
// always matches the chat header's selector.
//
// Usage:
//   <ModelPickerSheet
//     visible={show}
//     initialSelectedId={conv.modelId ?? settings.selectedModel}
//     title="Regenerate with model"
//     onClose={() => setShow(false)}
//     onConfirm={(modelId) => { setShow(false); regenerate(modelId); }}
//   />
import { useMemo, useState } from 'react';
import { Modal, Pressable, View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings, TargetGroup, PickTarget } from '../store/settingsStore';
import { useTheme, spacing, radii, fontSize } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /**
   * Model ID that should be highlighted as the current selection when
   * the sheet opens. Usually the active conversation's modelId, falling
   * back to the app's default selectedModel.
   */
  initialSelectedId?: string | null;
  /**
   * Called with the chosen model ID when the user taps Confirm. The
   * parent is responsible for closing the sheet (typically it will
   * have already set its own state to hide it).
   */
  onConfirm: (modelId: string) => void;
  /**
   * Optional sheet title. Defaults to "Select Model".
   */
  title?: string;
  /**
   * Optional helper text under the title. Good place to explain what
   * the selection will be used for (e.g. "This response will be
   * regenerated with the chosen model").
   */
  caption?: string;
  /**
   * When true, agents are shown alongside models. Defaults to true.
   * Set false for flows where agents would not make sense (none today,
   * but useful for future use).
   */
  includeAgents?: boolean;
}

export default function ModelPickerSheet({
  visible,
  onClose,
  initialSelectedId,
  onConfirm,
  title = 'Select Model',
  caption,
  includeAgents = true,
}: Props) {
  const theme = useTheme();
  const getGroupedTargets = useSettings((s) => s.getGroupedTargets);
  const settingsSelectedModel = useSettings((s) => s.selectedModel);

  // Snapshot the selected id on open. Held as local state so the user
  // can tap around to preview choices before committing via Confirm.
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? settingsSelectedModel ?? null,
  );

  // If the caller passes a new initialSelectedId while the sheet is
  // closed, pick it up the next time it opens. Using useMemo off
  // `visible` gives us that "on open" reset cleanly.
  useMemo(() => {
    if (visible) {
      setSelectedId(initialSelectedId ?? settingsSelectedModel ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const groups: TargetGroup[] = useMemo(() => {
    const all = getGroupedTargets();
    return includeAgents ? all : all.filter((g) => g.kind !== 'agent');
  }, [getGroupedTargets, includeAgents]);

  const handleConfirm = () => {
    if (!selectedId) return;
    onConfirm(selectedId);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
              {caption ? (
                <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
                  {caption}
                </Text>
              ) : null}
            </View>

            {/* Grouped list */}
            <ScrollView style={{ maxHeight: 520 }}>
              {groups.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="cloud-offline-outline" size={28} color={theme.colors.textMuted} />
                  <Text style={{ color: theme.colors.textMuted, marginTop: spacing.sm, fontSize: fontSize.sm }}>
                    No models available. Check your API key and connection.
                  </Text>
                </View>
              ) : (
                groups.map((group) => (
                  <View key={`${group.kind}:${group.title}`} style={{ marginBottom: spacing.md }}>
                    <Text style={[styles.groupHeader, { color: theme.colors.textMuted }]}>
                      {group.title}
                    </Text>
                    {group.items.map((item: PickTarget) => {
                      const isSelected = item.id === selectedId;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => setSelectedId(item.id)}
                          style={[
                            styles.row,
                            {
                              backgroundColor: isSelected ? theme.colors.primarySoft : 'transparent',
                              borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={group.kind === 'agent' ? 'sparkles-outline' : 'cube-outline'}
                            size={18}
                            color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                            style={{ marginRight: spacing.sm }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={{
                              color: theme.colors.text,
                              fontSize: fontSize.md,
                              fontWeight: isSelected ? '700' : '600',
                            }}>
                              {item.label}
                            </Text>
                            {item.provider && group.kind !== 'agent' ? (
                              <Text style={{
                                color: theme.colors.textMuted,
                                fontSize: fontSize.xs,
                                marginTop: 2,
                              }}>
                                {item.provider}
                              </Text>
                            ) : null}
                          </View>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              )}
            </ScrollView>

            {/* Footer actions */}
            <View style={styles.footer}>
              <Pressable
                onPress={onClose}
                style={[styles.secondaryBtn, { borderColor: theme.colors.border }]}
              >
                <Text style={{ color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={!selectedId}
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: theme.colors.primary,
                    opacity: selectedId ? 1 : 0.5,
                  },
                ]}
              >
                <Ionicons name="checkmark" size={16} color={theme.colors.primaryText} />
                <Text style={{ color: theme.colors.primaryText, fontSize: fontSize.md, fontWeight: '700' }}>
                  Confirm
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  header: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  caption: {
    fontSize: fontSize.xs,
    marginTop: 4,
    lineHeight: 16,
  },
  groupHeader: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});