// src/components/AttachmentActionSheet.tsx
// Bottom-sheet action menu for an assistant-generated attachment.
// Shown on long-press. Four actions: Save to Photos (images only),
// Save to Files, Share, Copy Link.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, spacing, radii, fontSize } from '../theme';

export type AttachmentAction =
  | 'saveToPhotos'
  | 'saveToFiles'
  | 'share'
  | 'copyLink';

interface Props {
  visible: boolean;
  isImage: boolean;
  onSelect: (action: AttachmentAction) => void;
  onClose: () => void;
}

export default function AttachmentActionSheet({
  visible,
  isImage,
  onSelect,
  onClose,
}: Props) {
  const theme = useTheme();

  const rows: Array<{
    id: AttachmentAction;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    show: boolean;
  }> = [
    { id: 'saveToPhotos', icon: 'image-outline', label: 'Save to Photos', show: isImage },
    { id: 'saveToFiles', icon: 'folder-outline', label: 'Save to Files', show: true },
    { id: 'share', icon: 'share-outline', label: 'Share', show: true },
    { id: 'copyLink', icon: 'link-outline', label: 'Copy Link', show: true },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <SafeAreaView edges={['bottom']} style={styles.safe}>
          <Pressable>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              {rows
                .filter((r) => r.show)
                .map((r, idx, arr) => (
                  <Pressable
                    key={r.id}
                    onPress={() => onSelect(r.id)}
                    style={({ pressed }) => [
                      styles.row,
                      idx < arr.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.colors.border,
                      },
                      pressed && { backgroundColor: theme.colors.surfaceAlt },
                    ]}
                  >
                    <Ionicons name={r.icon} size={20} color={theme.colors.text} />
                    <Text style={[styles.rowLabel, { color: theme.colors.text }]}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
            </View>
            <Pressable
              onPress={onClose}
              style={[
                styles.cancel,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.cancelLabel, { color: theme.colors.text }]}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  safe: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  sheet: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLabel: { fontSize: fontSize.md, fontWeight: '500' },
  cancel: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelLabel: { fontSize: fontSize.md, fontWeight: '600' },
});