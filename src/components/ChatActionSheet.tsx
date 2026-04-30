// src/components/ChatActionSheet.tsx
// Bottom-sheet menu for a conversation row in the drawer. Actions:
//   - Pin / Unpin
//   - Rename
//   - Export as Markdown
//   - Export as PDF
//   - Delete (destructive, confirmed)
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export type ChatAction =
  | 'togglePin'
  | 'rename'
  | 'exportMarkdown'
  | 'exportPdf'
  | 'delete';

interface Props {
  visible: boolean;
  pinned: boolean;
  onSelect: (action: ChatAction) => void;
  onClose: () => void;
}

export default function ChatActionSheet({
  visible,
  pinned,
  onSelect,
  onClose,
}: Props) {
  const rows: Array<{
    id: ChatAction;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    destructive?: boolean;
  }> = [
    { id: 'togglePin', icon: pinned ? 'pin' : 'pin-outline', label: pinned ? 'Unpin' : 'Pin to top' },
    { id: 'rename', icon: 'create-outline', label: 'Rename' },
    { id: 'exportMarkdown', icon: 'document-text-outline', label: 'Export as Markdown' },
    { id: 'exportPdf', icon: 'document-outline', label: 'Export as PDF' },
    { id: 'delete', icon: 'trash-outline', label: 'Delete', destructive: true },
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
            <View style={styles.sheet}>
              <Text style={styles.header}>Chat options</Text>
              {rows.map((r, idx) => (
                <Pressable
                  key={r.id}
                  onPress={() => onSelect(r.id)}
                  style={({ pressed }) => [
                    styles.row,
                    idx < rows.length - 1 && styles.rowDivider,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Ionicons
                    name={r.icon}
                    size={20}
                    color={r.destructive ? '#ff453a' : '#f2f2f7'}
                  />
                  <Text
                    style={[
                      styles.rowLabel,
                      r.destructive && { color: '#ff453a' },
                    ]}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={onClose} style={styles.cancel}>
              <Text style={styles.cancelLabel}>Cancel</Text>
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
  safe: { paddingHorizontal: 12, paddingBottom: 8 },
  sheet: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2d',
    overflow: 'hidden',
  },
  header: {
    color: '#8a8a8e',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2d',
  },
  rowPressed: { backgroundColor: '#242427' },
  rowLabel: { color: '#f2f2f7', fontSize: 16, fontWeight: '500' },
  cancel: {
    marginTop: 8,
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2d',
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelLabel: { color: '#f2f2f7', fontSize: 16, fontWeight: '600' },
});