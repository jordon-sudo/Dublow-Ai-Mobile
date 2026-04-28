// src/components/ConversationsDrawer.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  Animated,
  Dimensions,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useConversations, Conversation } from '../store/conversationsStore';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_W = Math.min(340, Math.round(SCREEN_W * 0.86));

export default function ConversationsDrawer({ visible, onClose }: Props) {
  const {
    conversations,
    order,
    activeId,
    newConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    togglePin,
    search,
  } = useConversations();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const slide = useRef(new Animated.Value(-DRAWER_W)).current;
  const fade = useRef(new Animated.Value(0)).current;

  // Slide in / out
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, {
        toValue: visible ? 0 : -DRAWER_W,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: visible ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, slide, fade]);

  // Debounce search input (150ms)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  const rows = useMemo(() => {
    if (debounced) {
      return search(debounced).map((r) => ({
        conv: r.conv,
        snippet: r.snippet,
        hit: r.hit,
      }));
    }
    const list = order.map((id) => conversations[id]).filter(Boolean);
    const pinned = list.filter((c) => c.pinned);
    const recent = list.filter((c) => !c.pinned);
    return [
      ...(pinned.length ? [{ header: 'Pinned' as const }] : []),
      ...pinned.map((conv) => ({ conv, snippet: lastPreview(conv), hit: 'none' as const })),
      ...(recent.length ? [{ header: 'Recent' as const }] : []),
      ...recent.map((conv) => ({ conv, snippet: lastPreview(conv), hit: 'none' as const })),
    ];
  }, [debounced, order, conversations, search]);

  const handleNew = () => {
    newConversation();
    onClose();
  };

  const handleSelect = (id: string) => {
    selectConversation(id);
    onClose();
  };

  const handleLongPress = (conv: Conversation) => {
    Alert.alert(conv.title || 'Untitled', undefined, [
      {
        text: conv.pinned ? 'Unpin' : 'Pin to top',
        onPress: () => togglePin(conv.id),
      },
      {
        text: 'Rename',
        onPress: () => promptRename(conv, renameConversation),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete conversation?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => deleteConversation(conv.id),
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateX: slide }] }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chats</Text>
            <Pressable onPress={handleNew} hitSlop={10} style={styles.newBtn}>
              <Text style={styles.newBtnText}>＋ New</Text>
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats and messages"
              placeholderTextColor="#8a8a8e"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            data={rows}
            keyExtractor={(item, i) =>
              'header' in item ? `h-${item.header}-${i}` : item.conv.id
            }
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => {
              if ('header' in item) {
                return <Text style={styles.groupHeader}>{item.header}</Text>;
              }
              const { conv, snippet } = item;
              const isActive = conv.id === activeId;
              return (
                <Pressable
                  onPress={() => handleSelect(conv.id)}
                  onLongPress={() => handleLongPress(conv)}
                  style={({ pressed }) => [
                    styles.row,
                    isActive && styles.rowActive,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.rowTop}>
                    <Text
                      numberOfLines={1}
                      style={[styles.rowTitle, isActive && styles.rowTitleActive]}
                    >
                      {conv.pinned ? '📌 ' : ''}
                      {conv.title || 'New chat'}
                    </Text>
                    <Text style={styles.rowTime}>{relTime(conv.updatedAt)}</Text>
                  </View>
                  {!!snippet && (
                    <Text numberOfLines={1} style={styles.rowPreview}>
                      {snippet}
                    </Text>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {debounced ? 'No matches.' : 'No conversations yet.'}
              </Text>
            }
          />
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

/* -------------------- helpers -------------------- */

function lastPreview(conv: Conversation): string {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.role !== 'system' && m.content) {
      return m.content.replace(/\s+/g, ' ').slice(0, 80);
    }
  }
  return '';
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(ts).toLocaleDateString();
}

function promptRename(
  conv: Conversation,
  rename: (id: string, title: string) => Promise<void>,
) {
  if (Platform.OS === 'ios' && (Alert as any).prompt) {
    (Alert as any).prompt(
      'Rename chat',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (text: string) => {
            const t = (text || '').trim();
            if (t) rename(conv.id, t);
          },
        },
      ],
      'plain-text',
      conv.title,
    );
  } else {
    // Android: minimal inline fallback — a proper modal can replace this later.
    Alert.alert('Rename', 'Use the iOS build to rename inline, or I can add a custom modal.');
  }
}

/* -------------------- styles -------------------- */

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_W,
    backgroundColor: '#111',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#2a2a2d',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  newBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1f1f22',
  },
  newBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  searchWrap: { paddingHorizontal: 12, paddingBottom: 10 },
  searchInput: {
    backgroundColor: '#1c1c1e',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
  },
  groupHeader: {
    color: '#8a8a8e',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f1f22',
  },
  rowActive: { backgroundColor: '#1a1a1d' },
  rowPressed: { backgroundColor: '#1f1f22' },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    color: '#f2f2f7',
    fontSize: 15,
    fontWeight: '500',
  },
  rowTitleActive: { color: '#fff', fontWeight: '600' },
  rowTime: {
    color: '#8a8a8e',
    fontSize: 12,
  },
  rowPreview: {
    color: '#8a8a8e',
    fontSize: 13,
    marginTop: 2,
  },
  empty: {
    color: '#8a8a8e',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
});