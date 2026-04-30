// src/components/MessageActionSheet.tsx
// Bottom-sheet modal that renders message-level actions on long-press.
// Presentation-only: emits an action string; the parent screen handles
// the side effects (copy, share, navigate, mutate the store, etc).
import { Modal, Pressable, View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radii, fontSize } from '../theme';
import type { ChatMsg } from '../store/conversationsStore';

/**
 * Discriminated action identifier. The chat screen switches on this value
 * to decide what to do. Keeping it as a plain string union (rather than an
 * enum) keeps the import surface narrow and plays nicely with exhaustive
 * switch statements.
 */
export type MessageAction =
  | 'copy'
  | 'share'
  | 'regenerate'
  | 'edit_resend'
  | 'quote_new_chat'
  | 'save_as_prompt';

interface Props {
  visible: boolean;
  onClose: () => void;
  /**
   * The message the user long-pressed. Used to compute availability
   * (regenerate only on last assistant, edit_resend only on user, etc).
   * Null when the sheet is dismissed before a message context is known.
   */
  message: ChatMsg | null;
  /**
   * Index of `message` within the active conversation's messages array.
   * Used by the parent to compute "is this the last assistant message"
   * and to call truncateActiveAt on Edit & Resend. -1 when unknown.
   */
  messageIndex: number;
  /**
   * Total number of messages in the active conversation. Used to derive
   * whether the message is the final one, which gates Regenerate.
   */
  totalMessages: number;
  /**
   * True while an assistant response is actively streaming. Disables
   * every action — interacting with an in-flight stream is a recipe for
   * race conditions we don't want to debug.
   */
  isStreaming: boolean;
  /**
   * Emitted when the user taps one of the action rows. The parent is
   * expected to close the sheet itself after handling; this component
   * will have already dismissed visually via onClose before the callback
   * fires, so the parent can navigate without stacking modals.
   */
  onAction: (action: MessageAction) => void;
}

interface ActionDef {
  id: MessageAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  /**
   * Optional description shown under the label. Helps users who don't
   * immediately know what "Quote in new chat" will do.
   */
  hint?: string;
}

const ALL_ACTIONS: ActionDef[] = [
  { id: 'copy', label: 'Copy', icon: 'copy-outline', hint: 'Copy text to the clipboard' },
  { id: 'share', label: 'Share', icon: 'share-outline', hint: 'Open the system share sheet' },
  { id: 'regenerate', label: 'Regenerate', icon: 'refresh-outline', hint: 'Re-run with a chosen model' },
  { id: 'edit_resend', label: 'Edit & Resend', icon: 'create-outline', hint: 'Edit this message and resend', destructive: true },
  { id: 'quote_new_chat', label: 'Quote in New Chat', icon: 'chatbubbles-outline', hint: 'Start a fresh chat with this quoted' },
  { id: 'save_as_prompt', label: 'Save as Prompt', icon: 'bookmark-outline', hint: 'Add to your prompt library' },
];

/**
 * Availability matrix. Returns true when the action should be enabled
 * for the given message context. Mirrors the table we agreed on:
 *
 *   | Action          | User | Assistant | Streaming |
 *   | Copy            |  ✓   |    ✓     |     ✗     |
 *   | Share           |  ✓   |    ✓     |     ✗     |
 *   | Regenerate      |  —   |  last✓   |     ✗     |
 *   | Edit & resend   |  ✓   |    —     |     ✗     |
 *   | Quote           |  ✓   |    ✓     |     ✗     |
 *   | Save as prompt  |  ✓   |    ✓     |     ✗     |
 */
function isAvailable(
  action: MessageAction,
  message: ChatMsg | null,
  isLast: boolean,
  isStreaming: boolean,
): boolean {
  if (!message) return false;
  if (isStreaming) return false;
  const role = message.role;
  switch (action) {
    case 'copy':
    case 'share':
    case 'quote_new_chat':
    case 'save_as_prompt':
      return role === 'user' || role === 'assistant';
    case 'regenerate':
      return role === 'assistant' && isLast;
    case 'edit_resend':
      return role === 'user';
    default:
      return false;
  }
}

export default function MessageActionSheet({
  visible,
  onClose,
  message,
  messageIndex,
  totalMessages,
  isStreaming,
  onAction,
}: Props) {
  const theme = useTheme();

  // "Last message" means the final element in the messages array. For
  // Regenerate this is the only valid target — mid-conversation regen
  // breaks linearity in ways users don't expect.
  const isLast = messageIndex >= 0 && messageIndex === totalMessages - 1;

  const handlePress = (action: MessageAction) => {
    // Close before firing so any navigation the parent triggers does
    // not stack on top of this modal (iOS in particular hates that).
    onClose();
    // Defer to the next tick so the modal dismissal animation can start
    // cleanly before the parent's side-effect (possibly routing) runs.
    setTimeout(() => onAction(action), 0);
  };

  // Preview snippet shown at the top of the sheet so the user can
  // confirm which message they long-pressed. Truncated to one line.
  const previewText = (message?.content ?? '').trim();
  const preview = previewText.length > 120 ? previewText.slice(0, 117) + '…' : previewText;

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
          // Swallow taps inside the sheet so they don't dismiss the modal.
          onPress={(e) => e.stopPropagation()}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />

            {/* Header — preview of the message being acted on */}
            <View style={styles.header}>
              <Text style={[styles.headerLabel, { color: theme.colors.textMuted }]}>
                {message?.role === 'user' ? 'Your message' : message?.role === 'assistant' ? 'Assistant message' : 'Message'}
              </Text>
              {preview ? (
                <Text style={[styles.headerPreview, { color: theme.colors.text }]} numberOfLines={2}>
                  {preview}
                </Text>
              ) : null}
              {isStreaming ? (
                <Text style={[styles.streamingHint, { color: theme.colors.textMuted }]}>
                  Actions unavailable while the assistant is replying.
                </Text>
              ) : null}
            </View>

            {/* Action list */}
            <ScrollView style={{ maxHeight: 480 }}>
              {ALL_ACTIONS.map((def) => {
                const enabled = isAvailable(def.id, message, isLast, isStreaming);
                const color = !enabled
                  ? theme.colors.textMuted
                  : def.destructive
                    ? '#ef4444'
                    : theme.colors.text;
                return (
                  <Pressable
                    key={def.id}
                    onPress={() => enabled && handlePress(def.id)}
                    disabled={!enabled}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        borderColor: theme.colors.border,
                        opacity: !enabled ? 0.4 : pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name={def.icon}
                      size={20}
                      color={color}
                      style={{ marginRight: spacing.md }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color }]}>
                        {def.label}
                      </Text>
                      {def.hint ? (
                        <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>
                          {def.hint}
                        </Text>
                      ) : null}
                    </View>
                    {!enabled ? (
                      <Ionicons name="lock-closed-outline" size={14} color={theme.colors.textMuted} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Cancel */}
            <Pressable
              onPress={onClose}
              style={[styles.cancelBtn, { borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.text, fontSize: fontSize.md, fontWeight: '700' }}>
                Cancel
              </Text>
            </Pressable>
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
    paddingBottom: spacing.sm,
  },
  headerLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerPreview: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  streamingHint: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  rowHint: {
    fontSize: fontSize.xs,
    lineHeight: 16,
  },

  cancelBtn: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});