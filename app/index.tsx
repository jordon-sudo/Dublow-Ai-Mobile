// app/index.tsx
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator, Alert,
  Modal, ScrollView, ActionSheetIOS,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import Markdown from 'react-native-markdown-display';
import { useSettings } from '../src/store/settingsStore';
import { useChat } from '../src/store/chatStore';
import { useTheme, spacing, radii, fontSize } from '../src/theme';
import { TOOL_CATALOG, groupedTools, ToolDef } from '../src/lib/tools';
import { StatusBubble } from '../src/components/StatusBubble';
import type { StreamStatus } from '../src/lib/hatzClient';
import ConversationsDrawer from '../src/components/ConversationsDrawer';

// Accepted file types for Hatz uploads.
const ACCEPTED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'txt', 'md', 'rtf',
  'csv', 'xls', 'xlsx',
  'ppt', 'pptx',
  'json', 'xml', 'html', 'htm',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic',
];

const ACCEPTED_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'text/',
  'image/',
  'application/json',
  'application/xml',
];

function isAcceptedFile(name: string, mime: string): boolean {
  const lowerName = (name || '').toLowerCase();
  const ext = lowerName.includes('.') ? lowerName.split('.').pop()! : '';
  const lowerMime = (mime || '').toLowerCase();

  if (ACCEPTED_EXTENSIONS.includes(ext)) return true;
  if (ACCEPTED_MIME_PREFIXES.some((p) => lowerMime.startsWith(p))) return true;
  return false;
}

function prettyExt(name: string): string {
  const lower = (name || '').toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop()! : '';
  return ext ? `.${ext}` : 'this file type';
}

// RFC4122 v4 UUID — used as scope_id for chat file uploads.
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type AttachedAsset = { uri: string; name: string; type: string };

export default function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const {
    apiKey, selectedModel, models, apps, getClient, setSelectedModel,
    getGroupedTargets, defaultTools, defaultAutoTools,
  } = useSettings();
  const {
    messages, attachedFileIds, activeTools, autoTools,
    appendUser, appendAssistantDelta, finalizeAssistant, clear,
    setActiveTools, setAutoTools, addAttachedFileId, removeAttachedFileId,
  } = useChat();

  const [input, setInput] = useState('');
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [toolsPickerOpen, setToolsPickerOpen] = useState(false);
  const listRef = useRef<FlatList>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Per-chat scope for file uploads; rotates on "New Chat".
  const [chatScopeId, setChatScopeId] = useState<string>(() => uuidv4());

  // Map of file UUID -> human-readable name, for the attachment chips.
  const [fileNames, setFileNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (messages.length === 0) {
      if (activeTools.length === 0 && defaultTools.length > 0) setActiveTools(defaultTools);
      if (autoTools !== defaultAutoTools) setAutoTools(defaultAutoTools);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTarget = models.find((m) => m.id === selectedModel);
  const canSend = !!apiKey && !!selectedModel && input.trim().length > 0 && !busy;

  const send = async () => {
    const client = getClient();
    if (!client || !selectedModel) return;
    const userText = input.trim();
    if (!userText) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setInput('');
    appendUser(userText);
    appendAssistantDelta('');
    setBusy(true);

    const sys = useSettings.getState().systemPrompt?.trim();
    const base = useChat.getState().messages
      .filter((m) => !(m.role === 'assistant' && m.content.length === 0))
      .map(({ role, content }) => ({ role, content }));
    const history = sys ? [{ role: 'system' as const, content: sys }, ...base] : base;

    setStreamStatus({ kind: 'thinking' });
    await client.streamChat(
      {
        ...(models.find((m) => m.id === selectedModel)?.kind === 'agent'
          ? { agent_id: selectedModel }
          : { model: selectedModel }),
        messages: history,
        auto_tool_selection: autoTools,
        tools_to_use: autoTools ? undefined : activeTools,
        file_uuids: attachedFileIds,
      },
      {
        onToken: (delta) => appendAssistantDelta(delta),
        onStatus: (s) => setStreamStatus(s),
        onDone: () => { finalizeAssistant(); setStreamStatus(null); setBusy(false); },
        onError: (err) => {
          appendAssistantDelta(`\n\n_Error: ${err.message}_`);
          finalizeAssistant(); setStreamStatus(null); setBusy(false);
        },
      },
    );
  };

  const confirmClear = () => {
    if (messages.length === 0) return;
    Alert.alert('Start a new chat?', 'This will delete the current conversation.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'New Chat',
        style: 'destructive',
        onPress: () => {
          clear();
          setFileNames({});
        },
      },
    ]);
  };

  // ---------- Attachments ----------

  const uploadAsset = async (asset: AttachedAsset) => {
  const client = getClient();
  const apps = useSettings.getState().apps;
  if (!client) return;

  // Client-side type guard.
  if (!isAcceptedFile(asset.name, asset.type)) {
    Alert.alert(
      'Unsupported file type',
      `Hatz does not accept ${prettyExt(asset.name)} files.\n\nSupported formats include PDF, Word, Excel, PowerPoint, text, CSV, JSON, and common image types (PNG, JPG, GIF, WEBP, HEIC).\n\nIf you need this file, export or convert it to a supported format and try again.`,
    );
    return;
  }

  const scopeApp = apps.find((a: any) => a.id);
  if (!scopeApp?.id) {
    Alert.alert(
      'Cannot upload',
      'No app found in your Hatz workspace. File uploads require at least one app in your account. Please create an app at ai.hatz.ai and try again.',
    );
    return;
  }

  try {
    setUploading(true);
    console.log('[upload] starting', asset.name, asset.type, 'scope=app', scopeApp.id);
    const uuid = await client.uploadFile(
      { uri: asset.uri, name: asset.name, type: asset.type },
      { scopeType: 'app', scopeId: scopeApp.id },
    );
    await addAttachedFileId(uuid);
    setFileNames((prev) => ({ ...prev, [uuid]: asset.name }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch (e: any) {
    console.warn('[upload] failed', e?.message || e);
    Alert.alert('Upload failed', e?.message ?? 'Unknown error');
  } finally {
    setUploading(false);
  }
};

  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await uploadAsset({
      uri: a.uri,
      name: a.name ?? 'file',
      type: a.mimeType ?? 'application/octet-stream',
    });
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await uploadAsset({
      uri: a.uri,
      name: a.fileName ?? `photo-${Date.now()}.jpg`,
      type: a.mimeType ?? 'image/jpeg',
    });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await uploadAsset({
      uri: a.uri,
      name: a.fileName ?? `photo-${Date.now()}.jpg`,
      type: a.mimeType ?? 'image/jpeg',
    });
  };

  const openAttachmentSheet = () => {
    console.log('[attach] opening sheet');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose Photo', 'Choose File'],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) takePhoto();
          else if (idx === 2) pickPhoto();
          else if (idx === 3) pickDocument();
        },
      );
    } else {
      Alert.alert('Attach', 'Select a source', [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose Photo', onPress: pickPhoto },
        { text: 'Choose File', onPress: pickDocument },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const toggleTool = (id: string) => {
    const next = activeTools.includes(id)
      ? activeTools.filter((t) => t !== id)
      : [...activeTools, id];
    setActiveTools(next);
  };

  if (!apiKey || !selectedModel) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primarySoft }]}>
            <Ionicons name="sparkles" size={32} color={theme.colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Welcome to Hatz Chat</Text>
          <Text style={[styles.emptySub, { color: theme.colors.textMuted }]}>
            Add your API key and pick a model to get started.
          </Text>
          <Link href="/settings" asChild>
            <Pressable style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]}>
              <Ionicons name="settings-outline" size={18} color={theme.colors.primaryText} />
              <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>Open Settings</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

 return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => setDrawerOpen(true)} style={styles.headerTitleRow} hitSlop={6}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Chat</Text>
            <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} style={{ marginLeft: 4 }} />
          </Pressable>
          <Text style={[styles.headerSub, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {currentTarget?.label ?? 'Select a model'}
          </Text>
        </View>
        <Link href={'/apps' as any} asChild>
          <Pressable style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="apps-outline" size={22} color={theme.colors.text} />
          </Pressable>
        </Link>
        <Pressable onPress={confirmClear} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="create-outline" size={22} color={theme.colors.text} />
        </Pressable>
        <Link href="/settings" asChild>
          <Pressable style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="settings-outline" size={22} color={theme.colors.text} />
          </Pressable>
        </Link>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.lg }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<View />}
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            if (!isUser) {
              return (
                <View style={styles.assistantWrap}>
                  <Markdown
                    style={{
                      body: { color: theme.colors.assistantText, fontSize: fontSize.md, lineHeight: 26 },
                      paragraph: { marginTop: 0, marginBottom: spacing.md },
                      code_inline: { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, paddingHorizontal: 4, borderRadius: 4 },
                      fence: { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, padding: spacing.md, borderRadius: radii.md },
                      link: { color: theme.colors.primary },
                    }}
                  >
                    {item.content || '…'}
                  </Markdown>
                </View>
              );
            }
            return (
              <View style={[styles.userBubble, { backgroundColor: theme.colors.bubbleUser }]}>
                <Text style={{ color: theme.colors.bubbleUserText, fontSize: fontSize.md, lineHeight: 22 }}>
                  {item.content}
                </Text>
              </View>
            );
          }}
        />
        {busy && streamStatus && streamStatus.kind !== 'writing' ? (
          <StatusBubble status={streamStatus} />
        ) : null}

        {/* Attachment chips — shows real file names above the composer */}
        {attachedFileIds.length > 0 && (
          <View style={[styles.filesStrip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {attachedFileIds.map((id) => {
                const label = fileNames[id] ?? `${id.slice(0, 8)}…`;
                return (
                  <View key={id} style={[styles.fileChip, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                    <Ionicons name="document-outline" size={14} color={theme.colors.textMuted} />
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: fontSize.xs, maxWidth: 160 }}>
                      {label}
                    </Text>
                    <Pressable onPress={() => { removeAttachedFileId(id); setFileNames((p) => { const n = { ...p }; delete n[id]; return n; }); }} hitSlop={8}>
                      <Ionicons name="close" size={14} color={theme.colors.textMuted} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={[
          styles.composer,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
          },
        ]}>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { color: theme.colors.text, flex: 1 }]}
              placeholder="Message"
              placeholderTextColor={theme.colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
            />
            <Pressable
              onPress={send}
              disabled={!canSend}
              style={[styles.sendBtn, { backgroundColor: theme.colors.primary, opacity: canSend ? 1 : 0.5 }]}
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.primaryText} />
              ) : (
                <Ionicons name="arrow-up" size={20} color={theme.colors.primaryText} />
              )}
            </Pressable>
          </View>

          <View style={styles.dock}>
            <Pressable onPress={openAttachmentSheet} style={styles.dockIcon} hitSlop={8} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color={theme.colors.text} />
              ) : (
                <Ionicons name="add" size={22} color={theme.colors.text} />
              )}
            </Pressable>

            <Pressable
              onPress={() => setAutoTools(!autoTools)}
              style={[styles.dockChip, {
                backgroundColor: autoTools ? theme.colors.primarySoft : 'transparent',
                borderColor: theme.colors.border,
              }]}
              hitSlop={6}
            >
              <Ionicons name="flash" size={14} color={autoTools ? theme.colors.primary : theme.colors.textMuted} />
              <Text style={[styles.dockChipText, { color: autoTools ? theme.colors.text : theme.colors.textMuted }]}>Auto</Text>
            </Pressable>

            <Pressable
              onPress={() => !autoTools && setToolsPickerOpen(true)}
              disabled={autoTools}
              style={[styles.dockChip, {
                borderColor: theme.colors.border,
                opacity: autoTools ? 0.4 : 1,
                backgroundColor: !autoTools && activeTools.length > 0 ? theme.colors.primarySoft : 'transparent',
              }]}
              hitSlop={6}
            >
              <Ionicons name="construct-outline" size={14} color={theme.colors.textMuted} />
              <Text style={[styles.dockChipText, { color: theme.colors.textMuted }]}>
                {activeTools.length > 0 && !autoTools ? `Tools · ${activeTools.length}` : 'Tools'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={theme.colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => setTargetPickerOpen(true)}
              style={[styles.dockChip, { borderColor: theme.colors.border }]}
              hitSlop={6}
            >
              <Ionicons name="cube-outline" size={14} color={theme.colors.textMuted} />
              <Text style={[styles.dockChipText, { color: theme.colors.text }]}>Models</Text>
              <Ionicons name="chevron-down" size={12} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Target picker */}
      <Modal visible={targetPickerOpen} transparent animationType="slide" onRequestClose={() => setTargetPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTargetPickerOpen(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.modalHandle, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Select Model or Agent</Text>
            <ScrollView style={{ maxHeight: 520 }}>
              {getGroupedTargets().map((group) => (
                <View key={group.title} style={{ marginBottom: spacing.md }}>
                  <Text style={[styles.groupHeader, { color: theme.colors.textMuted }]}>{group.title}</Text>
                  {group.items.map((m) => {
                    const active = m.id === selectedModel;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => { setSelectedModel(m.id); setTargetPickerOpen(false); }}
                        style={[styles.modelRow, {
                          backgroundColor: active ? theme.colors.primarySoft : 'transparent',
                          borderColor: theme.colors.border,
                        }]}
                      >
                        <Ionicons
                          name={m.kind === 'agent' ? 'person-circle-outline' : 'cube-outline'}
                          size={18}
                          color={theme.colors.textMuted}
                          style={{ marginRight: spacing.sm }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                            {m.label}
                          </Text>
                          {m.provider && m.kind === 'model' ? (
                            <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>
                              {m.provider}
                            </Text>
                          ) : null}
                        </View>
                        {active ? <Ionicons name="checkmark" size={18} color={theme.colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

{/* Tools picker */}
      <Modal visible={toolsPickerOpen} transparent animationType="slide" onRequestClose={() => setToolsPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setToolsPickerOpen(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.modalHandle, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Tools</Text>
            <ScrollView style={{ maxHeight: 520 }}>
              {groupedTools().map(({ category, tools }) => (
                <View key={category} style={{ marginBottom: spacing.md }}>
                  <Text style={[styles.groupHeader, { color: theme.colors.textMuted }]}>{category}</Text>
                  {tools.map((t: ToolDef) => {
                    const on = activeTools.includes(t.id);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => toggleTool(t.id)}
                        style={[styles.modelRow, {
                          backgroundColor: on ? theme.colors.primarySoft : 'transparent',
                          borderColor: theme.colors.border,
                        }]}
                      >
                        <Ionicons
                          name={(t.icon as any) ?? 'construct-outline'}
                          size={18}
                          color={on ? theme.colors.primary : theme.colors.textMuted}
                          style={{ marginRight: spacing.sm }}
                        />
                        <Text style={{ flex: 1, color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                          {t.label}
                        </Text>
                        {on ? <Ionicons name="checkmark" size={18} color={theme.colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setToolsPickerOpen(false)}
              style={[styles.primaryBtn, { backgroundColor: theme.colors.primary, alignSelf: 'center', marginTop: spacing.sm }]}
            >
              <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ConversationsDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIcon: {
    width: 72, height: 72, borderRadius: radii.pill,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: fontSize.xxl, fontWeight: '700', marginBottom: spacing.sm },
  emptySub: { fontSize: fontSize.md, textAlign: 'center', marginBottom: spacing.xl },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  primaryBtnText: { fontSize: fontSize.md, fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700' },
  headerSub: { fontSize: fontSize.xs, marginTop: 2 },
  iconBtn: { padding: spacing.sm, marginLeft: spacing.xs },

  assistantWrap: { paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  userBubble: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radii.xl,
    marginVertical: spacing.xs, maxWidth: '85%',
  },

  filesStrip: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth,
  },

  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  input: {
    minHeight: 40, maxHeight: 140,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  dockIcon: {
    width: 34, height: 34, borderRadius: radii.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  dockChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6,
    borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  dockChipText: { fontSize: fontSize.xs, fontWeight: '600' },
  sendBtn: {
    width: 38, height: 38, borderRadius: radii.pill,
    alignItems: 'center', justifyContent: 'center',
  },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.md },
  groupHeader: {
    fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: spacing.xs, paddingHorizontal: spacing.xs,
  },
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth,
  },
});