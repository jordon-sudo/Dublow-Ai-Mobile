// app/index.tsx
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator, Alert,
  Modal, ScrollView, ActionSheetIOS,
} from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useSettings } from '../src/store/settingsStore';
import { useChat } from '../src/store/chatStore';
import { useConversations, ChatMsg } from '../src/store/conversationsStore';
import { usePrompts, PERSONAL_FOLDER_ID } from '../src/store/promptsStore';
import { useOfflineQueue } from '../src/store/offlineQueueStore';
import { useConnectivity } from '../src/hooks/useConnectivity';
import { useTheme, spacing, radii, fontSize } from '../src/theme';
import { TOOL_CATALOG, groupedTools, ToolDef } from '../src/lib/tools';
import { StatusBubble } from '../src/components/StatusBubble';
import AssistantMarkdown from '../src/components/AssistantMarkdown';
import type { StreamStatus } from '../src/lib/hatzClient';
import ConversationsDrawer from '../src/components/ConversationsDrawer';
import MessageActionSheet, { MessageAction } from '../src/components/MessageActionSheet';
import ModelPickerSheet from '../src/components/ModelPickerSheet';
import ChatEmptyState from '../src/components/ChatEmptyState';
import { copyText, shareText, buildQuoteMarkdown, deriveTitleFromMessage } from '../src/lib/messageActions';
import UsageBanner from '../src/components/UsageBanner';
import { track, captureError, latencyBucket } from '../src/lib/telemetry';


/**
 * Maps an error to a coarse category for analytics.
 * We never ship error.message itself — it can contain URLs, request IDs,
 * or partial user content. Buckets are stable enough to aggregate trends.
 */
function classifyError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (msg.includes('network') || msg.includes('fetch')) return 'network';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('401') || msg.includes('unauthorized')) return 'unauthorized';
  if (msg.includes('403') || msg.includes('forbidden')) return 'forbidden';
  if (msg.includes('429') || msg.includes('rate') || msg.includes('quota')) return 'rate_limited';
  if (msg.includes('5')) return 'server_error';
  return 'unknown';
}

const ACCEPTED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'txt', 'md', 'rtf',
  'csv', 'xls', 'xlsx',
  'ppt', 'pptx',
  'json', 'xml', 'html', 'htm',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic',
];
const ACCEPTED_MIME_PREFIXES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'text/', 'image/', 'application/json', 'application/xml',
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
    getGroupedTargets, defaultTools, defaultAutoTools, defaultModelId,
  } = useSettings();
  const {
    messages, attachedFileIds, activeTools, autoTools,
    appendUser, appendAssistantDelta, finalizeAssistant, clear,
    setActiveTools, setAutoTools, addAttachedFileId, removeAttachedFileId,
  } = useChat();

  const activeId = useConversations((s) => s.activeId);
  const newConversation = useConversations((s) => s.newConversation);
  const truncateActiveAt = useConversations((s) => s.truncateActiveAt);
  const removeLastAssistantMessage = useConversations((s) => s.removeLastAssistantMessage);
  const forkActiveAsNew = useConversations((s) => s.forkActiveAsNew);
  const appendAssistantDeltaToConversation = useConversations((s) => s.appendAssistantDeltaToConversation);
  const finalizeAssistantOnConversation = useConversations((s) => s.finalizeAssistantOnConversation);
  const removeLastAssistantMessageFromConversation = useConversations((s) => s.removeLastAssistantMessageFromConversation);

  const createPrompt = usePrompts((s) => s.createPrompt);

  const enqueue = useOfflineQueue((s) => s.enqueue);
  const getForConversation = useOfflineQueue((s) => s.getForConversation);
  const removeFromQueue = useOfflineQueue((s) => s.remove);
  const recordAttempt = useOfflineQueue((s) => s.recordAttempt);
  const queueState = useOfflineQueue((s) => s.queue);

  const [input, setInput] = useState('');
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [targetPickerQuery, setTargetPickerQuery] = useState('');
  const [toolsPickerOpen, setToolsPickerOpen] = useState(false);
  const listRef = useRef<FlatList>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Message-level action state
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<ChatMsg | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [regenPickerOpen, setRegenPickerOpen] = useState(false);

  const [chatScopeId, setChatScopeId] = useState<string>(() => uuidv4());
  const [fileNames, setFileNames] = useState<Record<string, string>>({});

  const replayingRef = useRef(false);

  useEffect(() => {
    if (messages.length === 0) {
      if (activeTools.length === 0 && defaultTools.length > 0) setActiveTools(defaultTools);
      if (autoTools !== defaultAutoTools) setAutoTools(defaultAutoTools);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the user switches conversations, resolve which model the selector
  // should show. Priority:
  //   1. The conversation's own modelId (user-set, most specific).
  //   2. The user's configured default model (Settings → Default Model).
  //   3. Leave the selector on whatever it already was (last-used global).
  // Case 2 is what makes "force default on new conversations" work: a brand
  // new chat has no modelId, so it snaps to the configured default. Once the
  // user picks a different model in that chat, patchActive writes modelId
  // and case 1 takes over on the next visit.
  useEffect(() => {
    if (!activeId) return;
    const conv = useConversations.getState().getActive();
    const convModel = conv?.modelId;
    const target = convModel ?? defaultModelId ?? null;
    if (target && target !== selectedModel) {
      void setSelectedModel(target);
    }
    // Intentionally depend only on activeId. We do not want this to re-run
    // when selectedModel changes (that would fight user selections mid-chat).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /**
   * Stream a completion against the active conversation using the given modelId.
   * Extracted so both the regular send path AND the Regenerate action can share
   * it. Assumes caller has already mutated the conversation (appended user
   * message for send, removed last assistant for regenerate).
   */
  const streamCompletion = async (modelId: string) => {
    const client = getClient();
    if (!client) return;

    // Pin this stream to the conversation that was active when it began.
    // Every token, finalize, and error write will target this ID directly,
    // so switching conversations mid-stream cannot redirect the response
    // into another chat.
    const pinnedConvId = useConversations.getState().activeId;
    if (!pinnedConvId) return;

    setBusy(true);
    setStreamStatus({ kind: 'thinking' });
    // Seed an empty assistant bubble on the pinned conversation.
    appendAssistantDeltaToConversation(pinnedConvId, '');

    // Build history from the pinned conversation, not "active" - otherwise
    // if the user switches chats during setup we'd send the wrong history.
    const sys = useSettings.getState().systemPrompt?.trim();
    const pinnedConv = useConversations.getState().conversations[pinnedConvId];
    const base = (pinnedConv?.messages ?? [])
      .filter((m) => !(m.role === 'assistant' && m.content.length === 0))
      .map(({ role, content }) => ({ role, content }));
    const history = sys ? [{ role: 'system' as const, content: sys }, ...base] : base;
    const isAgent = models.find((m) => m.id === modelId)?.kind === 'agent';

    // Capture session options too. If the user toggles tools or attachments
    // after send, the request already in flight should be unaffected.
    const pinnedAutoTools = pinnedConv?.autoTools ?? autoTools;
    const pinnedActiveTools = pinnedConv?.activeTools ?? activeTools;
    const pinnedFileIds = pinnedConv?.attachedFileIds ?? attachedFileIds;

    const startedAt = Date.now();
    track('chat_message_sent', {
      model_id: modelId,
      kind: isAgent ? 'agent' : 'model',
      has_attachments: pinnedFileIds.length > 0,
      attachment_count: pinnedFileIds.length,
      tools_count: pinnedAutoTools ? 0 : pinnedActiveTools.length,
      auto_tools: pinnedAutoTools,
    });

    await client.streamChat(
      {
        ...(isAgent ? { agent_id: modelId } : { model: modelId }),
        messages: history,
        auto_tool_selection: pinnedAutoTools,
        tools_to_use: pinnedAutoTools ? undefined : pinnedActiveTools,
        file_uuids: pinnedFileIds,
      },
      {
        onToken: (delta) => appendAssistantDeltaToConversation(pinnedConvId, delta),
        onStatus: (s) => {
          // Status is a transient UI affordance. Only reflect it if the user
          // is still viewing the conversation this stream belongs to -
          // otherwise it would show a spinner on an unrelated chat.
          if (useConversations.getState().activeId === pinnedConvId) {
            setStreamStatus(s);
          }
        },
        onDone: () => {
          void finalizeAssistantOnConversation(pinnedConvId);
          if (useConversations.getState().activeId === pinnedConvId) {
            setStreamStatus(null);
            setBusy(false);
          } else {
            // The user walked away; just clear local busy/status.
            setStreamStatus(null);
            setBusy(false);
          }
          track('chat_message_received', {
            model_id: modelId,
            ok: true,
            latency_bucket: latencyBucket(Date.now() - startedAt),
          });
        },
        onError: (err) => {
          appendAssistantDeltaToConversation(pinnedConvId, `\n\n_Error: ${err.message}_`);
          void finalizeAssistantOnConversation(pinnedConvId);
          setStreamStatus(null);
          setBusy(false);
          track('chat_message_received', {
            model_id: modelId,
            ok: false,
            latency_bucket: latencyBucket(Date.now() - startedAt),
            error_kind: classifyError(err),
          });
          captureError(err, { where: 'streamChat', model_id: modelId });
        },
      },
    );
  };

  const replayQueue = async () => {
    if (replayingRef.current) return;
    if (!activeId) return;
    const client = getClient();
    if (!client) return;
    replayingRef.current = true;
    try {
      // Pin to the conversation whose queued messages we're replaying.
      // Even if the user switches chats partway through replay, queued
      // responses should land on the conversation they were queued from.
      const pinnedConvId = activeId;
      const pending = getForConversation(pinnedConvId);
      for (const q of pending) {
        appendAssistantDeltaToConversation(pinnedConvId, '');
        setBusy(true);
        setStreamStatus({ kind: 'thinking' });

        const sys = useSettings.getState().systemPrompt?.trim();
        const pinnedConv = useConversations.getState().conversations[pinnedConvId];
        const base = (pinnedConv?.messages ?? [])
          .filter((m) => !(m.role === 'assistant' && m.content.length === 0))
          .map(({ role, content }) => ({ role, content }));
        const history = sys ? [{ role: 'system' as const, content: sys }, ...base] : base;
        const isAgent = models.find((m) => m.id === q.targetId)?.kind === 'agent';

        await new Promise<void>((resolve) => {
          client.streamChat(
            {
              ...(isAgent ? { agent_id: q.targetId } : { model: q.targetId }),
              messages: history,
              auto_tool_selection: q.autoTools,
              tools_to_use: q.autoTools ? undefined : q.activeTools,
              file_uuids: [],
            },
            {
              onToken: (delta) => appendAssistantDeltaToConversation(pinnedConvId, delta),
              onStatus: (s) => {
                if (useConversations.getState().activeId === pinnedConvId) {
                  setStreamStatus(s);
                }
              },
              onDone: () => {
                void finalizeAssistantOnConversation(pinnedConvId);
                setStreamStatus(null);
                setBusy(false);
                removeFromQueue(q.id);
                resolve();
              },
              onError: (err) => {
                appendAssistantDeltaToConversation(pinnedConvId, `\n\n_Error: ${err.message}_`);
                void finalizeAssistantOnConversation(pinnedConvId);
                setStreamStatus(null);
                setBusy(false);
                recordAttempt(q.id, err.message);
                resolve();
              },
            },
          );
        });
      }
    } finally {
      replayingRef.current = false;
    }
  };

  const { isOnline, isInitialized } = useConnectivity({ onReconnect: replayQueue });
  const router = useRouter();
  const params = useLocalSearchParams<{ prefill?: string }>();

  useEffect(() => {
    if (typeof params.prefill === 'string' && params.prefill.length > 0) {
      setInput(params.prefill);
      router.setParams({ prefill: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.prefill]);

  useEffect(() => {
    if (isOnline && isInitialized && activeId) {
      const pending = getForConversation(activeId);
      if (pending.length > 0) replayQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, activeId]);

  const currentTarget = models.find((m) => m.id === selectedModel);
  const canSend = !!apiKey && !!selectedModel && input.trim().length > 0 && !busy;

  const send = async () => {
    const userText = input.trim();
    if (!userText) return;

    if (!isOnline) {
      if (attachedFileIds.length > 0) {
        Alert.alert('Offline', 'Files cannot be sent while offline. Remove the attachment or wait for connectivity to return.');
        return;
      }
      if (!activeId || !selectedModel) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setInput('');
      appendUser(userText);
      enqueue({
        conversationId: activeId,
        content: userText,
        targetId: selectedModel,
        autoTools,
        activeTools,
      });
      return;
    }

    if (!selectedModel) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setInput('');
    appendUser(userText);
    await streamCompletion(selectedModel);
  };

  /**
   * Mirrors the "+ New" button in ConversationsDrawer: spins up a fresh
   * conversation without destroying the current one. No confirmation —
   * the previous chat is preserved in history and can be reopened from
   * the drawer.
   */
  const handleNewChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    newConversation();
    setInput('');
    setFileNames({});
  };

  /** Empty-state action: jump to the prompt library. */
  const handleChoosePrompt = () => {
    Haptics.selectionAsync().catch(() => {});
    router.push('/prompts');
  };

  /**
   * Empty-state action: switch to the Gemini 3 Pro Image model.
   * We resolve it by label-match rather than hardcoding an id, so changes
   * in the model slug upstream don't silently break this button.
   */
  const handleImageGeneration = () => {
    const imageModel = models.find((m) => {
      const lbl = (m.label ?? '').toLowerCase();
      const id = (m.id ?? '').toLowerCase();
      const hay = `${lbl} ${id}`;
      return hay.includes('gemini') && hay.includes('image');
    });
    if (!imageModel) {
      Alert.alert(
        'Image model unavailable',
        'Gemini 3 Pro Image was not found in your model list. Check your API key and connection, or pick an image-capable model from the model picker.',
      );
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    void setSelectedModel(imageModel.id);
    // Persist the choice on the active conversation so switching away and
    // back restores image mode.
    useConversations.getState().patchActive({ modelId: imageModel.id });
    track('model_changed', { model_id: imageModel.id, source: 'image_shortcut' });
  };

  // -------------------- Message-level action handlers --------------------

  /**
   * Opens the action sheet against a given message. Called from long-press
   * on any rendered bubble.
   */
  const openMessageActions = (msg: ChatMsg, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedMsg(msg);
    setSelectedIdx(index);
    setActionSheetOpen(true);
  };

  /**
   * Dispatches the chosen action from MessageActionSheet. All six actions
   * are handled here. The sheet has already closed itself before this fires.
   */
  const handleMessageAction = async (action: MessageAction) => {
    const msg = selectedMsg;
    const idx = selectedIdx;
    if (!msg) return;

    switch (action) {
      case 'copy': {
        const ok = await copyText(msg.content);
        if (ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          Alert.alert('Copy failed', 'The system clipboard could not be written.');
        }
        break;
      }

      case 'share': {
        const ok = await shareText(msg.content, msg.role === 'user' ? 'My message' : 'Assistant message');
        if (ok) Haptics.selectionAsync().catch(() => {});
        break;
      }

      case 'quote_new_chat': {
        // Fork a new conversation, then navigate with the quoted markdown as prefill.
        const { draftBody } = forkActiveAsNew(buildQuoteMarkdown(msg.content));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // Router push on same route with prefill param. The useEffect above
        // will populate the composer. We give the store a tick to settle
        // the active conversation switch before setting params.
        setTimeout(() => {
          router.setParams({ prefill: draftBody });
        }, 50);
        break;
      }

      case 'save_as_prompt': {
        const title = deriveTitleFromMessage(msg.content);
        const promptId = createPrompt({
          title,
          body: msg.content,
          folderId: PERSONAL_FOLDER_ID,
          tags: [],
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          'Saved to Prompt Library',
          `"${title}" was added to your Personal folder. Edit it anytime from Settings -> Manage Prompts.`,
          [
            { text: 'OK', style: 'default' },
            {
              text: 'Edit Now',
              onPress: () => router.push({ pathname: '/prompt-edit', params: { id: promptId } }),
            },
          ],
        );
        break;
      }

      case 'edit_resend': {
        if (idx < 0) return;
        // Confirm before truncation — this is destructive.
        Alert.alert(
          'Edit and Resend?',
          'This will remove this message and everything after it, then load the text into your composer so you can edit and resend.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue',
              style: 'destructive',
              onPress: () => {
                const originalContent = msg.content;
                truncateActiveAt(idx);
                setInput(originalContent);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              },
            },
          ],
        );
        break;
      }

      case 'regenerate': {
        // Open the model picker. The confirm handler will perform the regen.
        setRegenPickerOpen(true);
        break;
      }
    }
  };

  /**
   * Called when the user confirms a model in ModelPickerSheet during a
   * Regenerate flow. Strips the trailing assistant message, re-streams
   * against the chosen model, and persists that model on the conversation
   * so future sends use it too.
   */
  const handleRegenerateWithModel = async (modelId: string) => {
    setRegenPickerOpen(false);

    // Persist the model choice on the conversation record and in settings
    // so the composer reflects it from here on.
    await setSelectedModel(modelId);
    useConversations.getState().patchActive({ modelId });
    track('model_changed', { model_id: modelId, source: 'regenerate' });
    track('message_regenerated', { model_id: modelId });

    // Strip the last assistant message from the *current* conversation,
    // then re-stream. streamCompletion will pin to activeId internally,
    // so a chat switch after this point cannot redirect the regenerated
    // response into the wrong conversation.
    const convIdForRegen = useConversations.getState().activeId;
    if (convIdForRegen) {
      removeLastAssistantMessageFromConversation(convIdForRegen);
    }
    // Give the store a tick to settle before we read messages for history.
    setTimeout(() => {
      streamCompletion(modelId);
    }, 0);
  };

  const uploadAsset = async (asset: AttachedAsset) => {
    const client = getClient();
    const apps = useSettings.getState().apps;
    if (!client) return;

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
      const uuid = await client.uploadFile(
        { uri: asset.uri, name: asset.name, type: asset.type },
        { scopeType: 'app', scopeId: scopeApp.id },
      );
      await addAttachedFileId(uuid);
      setFileNames((prev) => ({ ...prev, [uuid]: asset.name }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // NB: we deliberately do not include file name or extension. mime_family
      // (the part before '/') is coarse enough to be useful without leakage.
      const mimeFamily = (asset.type || '').split('/')[0] || 'unknown';
      track('file_uploaded', { ok: true, mime_family: mimeFamily });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Unknown error');
      track('file_uploaded', { ok: false, error_kind: classifyError(e) });
      captureError(e, { where: 'uploadFile' });
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
    if (!perm.granted) { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await uploadAsset({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg' });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Camera access is required.'); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await uploadAsset({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg' });
  };

  const openAttachmentSheet = () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Files cannot be attached while offline.');
      return;
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose Photo', 'Choose File'], cancelButtonIndex: 0 },
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
    const next = activeTools.includes(id) ? activeTools.filter((t) => t !== id) : [...activeTools, id];
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
          <Text style={[styles.emptySub, { color: theme.colors.textMuted }]}>Add your API key and pick a model to get started.</Text>
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

  const pendingForConv = activeId ? getForConversation(activeId) : [];

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
        <Pressable onPress={handleNewChat} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="create-outline" size={22} color={theme.colors.text} />
        </Pressable>
        <Link href="/settings" asChild>
          <Pressable style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="settings-outline" size={22} color={theme.colors.text} />
          </Pressable>
        </Link>
      </View>

      <UsageBanner swipeToDismiss />

      {!isOnline && isInitialized ? (
        <View style={[stylesOffline.banner, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
          <Ionicons name="cloud-offline-outline" size={14} color={theme.colors.textMuted} />
          <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs, marginLeft: 6 }}>
            Offline - messages will send when connectivity returns.
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={[
            // Extra bottom padding keeps the last line of streamed text from
            // butting up against the composer. spacing.lg alone reads too
            // tight during active scroll; add a fixed 10pt breathing room.
            { padding: spacing.md, paddingBottom: spacing.lg + 46 },
            messages.length === 0 && { flexGrow: 1 },
          ]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <ChatEmptyState
              modelLabel={currentTarget?.label ?? 'Select a model'}
              onPickModel={() => setTargetPickerOpen(true)}
              onChoosePrompt={handleChoosePrompt}
              onImageGeneration={handleImageGeneration}
            />
          }
          extraData={queueState}
          renderItem={({ item, index }) => {
            const isUser = item.role === 'user';
            if (!isUser) {
              // Assistant bubble — long-press opens MessageActionSheet against this message.
              return (
                <Pressable
                  onLongPress={() => openMessageActions(item, index)}
                  delayLongPress={350}
                  style={styles.assistantWrap}
                >
                  <AssistantMarkdown
                    style={{
                      body: { color: theme.colors.assistantText, fontSize: fontSize.md, lineHeight: 26 },
                      paragraph: { marginTop: 0, marginBottom: spacing.md },
                      link: { color: theme.colors.primary },
                    }}
                  >
                    {item.content || '…'}
                  </AssistantMarkdown>
                </Pressable>
              );
            }
            const isPending = pendingForConv.some((q) => q.content === item.content);
            return (
              <Pressable
                onLongPress={() => openMessageActions(item, index)}
                delayLongPress={350}
                style={[styles.userBubble, { backgroundColor: theme.colors.bubbleUser, opacity: isPending ? 0.65 : 1 }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.bubbleUserText, fontSize: fontSize.md, lineHeight: 22, flexShrink: 1 }}>
                    {item.content}
                  </Text>
                  {isPending ? (
                    <Ionicons name="time-outline" size={14} color={theme.colors.bubbleUserText} style={{ marginLeft: 6, opacity: 0.8 }} />
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
        {busy && streamStatus && streamStatus.kind !== 'writing' ? <StatusBubble status={streamStatus} /> : null}

        {attachedFileIds.length > 0 && (
          <View style={[styles.filesStrip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {attachedFileIds.map((id) => {
                const label = fileNames[id] ?? `${id.slice(0, 8)}…`;
                return (
                  <View key={id} style={[styles.fileChip, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                    <Ionicons name="document-outline" size={14} color={theme.colors.textMuted} />
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: fontSize.xs, maxWidth: 160 }}>{label}</Text>
                    <Pressable
                      onPress={() => {
                        removeAttachedFileId(id);
                        setFileNames((p) => { const n = { ...p }; delete n[id]; return n; });
                      }}
                      hitSlop={8}
                    >
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
            paddingBottom: 10,
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
            <Pressable onPress={openAttachmentSheet} style={styles.dockIcon} hitSlop={8} disabled={uploading || !isOnline}>
              {uploading ? (
                <ActivityIndicator size="small" color={theme.colors.text} />
              ) : (
                <Ionicons name="add" size={22} color={isOnline ? theme.colors.text : theme.colors.textMuted} />
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

      {/* Target picker (existing header model/agent picker) */}
      <Modal visible={targetPickerOpen} transparent animationType="slide" onRequestClose={() => setTargetPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTargetPickerOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={-insets.bottom}
            style={{ width: '100%' }}
            pointerEvents="box-none"
          >
            <Pressable
              style={[
                styles.modalSheet,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  maxHeight: '85%',
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
            <View style={[styles.modalHandle, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Select Model or Agent</Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                paddingHorizontal: spacing.sm,
                paddingVertical: 8,
                borderRadius: radii.md,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                marginHorizontal: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              <Ionicons name="search" size={16} color={theme.colors.textMuted} />
              <TextInput
                value={targetPickerQuery}
                onChangeText={setTargetPickerQuery}
                placeholder="Search models"
                placeholderTextColor={theme.colors.textMuted}
                style={{ flex: 1, color: theme.colors.text, fontSize: fontSize.md, paddingVertical: 0 }}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
              {getGroupedTargets()
                .map((group) => {
                  const q = targetPickerQuery.trim().toLowerCase();
                  if (!q) return group;
                  return {
                    ...group,
                    items: group.items.filter((m) => {
                      const hay = `${m.label} ${m.id} ${(m as any).provider ?? ''}`.toLowerCase();
                      return hay.includes(q);
                    }),
                  };
                })
                .filter((group) => group.items.length > 0)
                .map((group) => (
                <View key={group.title} style={{ marginBottom: spacing.md }}>
                  <Text style={[styles.groupHeader, { color: theme.colors.textMuted }]}>{group.title}</Text>
                  {group.items.map((m) => {
                    const active = m.id === selectedModel;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => {
                          void setSelectedModel(m.id);
                          // Remember this choice on the active conversation so
                          // switching away and back restores the same model.
                          useConversations.getState().patchActive({ modelId: m.id });
                          track('model_changed', { model_id: m.id, kind: m.kind, source: 'picker' });
                          setTargetPickerOpen(false);
                        }}
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
          </KeyboardAvoidingView>
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

      {/* NEW: Message action sheet (long-press on any bubble) */}
      <MessageActionSheet
        visible={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        message={selectedMsg}
        messageIndex={selectedIdx}
        totalMessages={messages.length}
        isStreaming={busy}
        onAction={handleMessageAction}
      />

      {/* NEW: Model picker for Regenerate flow */}
      <ModelPickerSheet
        visible={regenPickerOpen}
        onClose={() => setRegenPickerOpen(false)}
        initialSelectedId={useConversations.getState().getActive()?.modelId ?? selectedModel}
        title="Regenerate with model"
        caption="This response will be regenerated using the chosen model."
        onConfirm={handleRegenerateWithModel}
      />

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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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

const stylesOffline = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});