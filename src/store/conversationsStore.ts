// src/store/conversationsStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sealJson, openJson } from '../lib/secureBlob';
import { generateTitle } from '../lib/titleGen';

const BLOB_KEY = 'hatz_conversations_v1';
const LEGACY_CHAT_KEY = 'hatz_chat_v2';

export interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: number;
}

export interface Conversation {
  id: string;
  title: string;
  titleLocked: boolean;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  messages: ChatMsg[];
  attachedFileIds: string[];
  activeTools: string[];
  autoTools: boolean;
  /**
   * Optional per-conversation model override. When set, outbound completion
   * requests should use this model name instead of the app-level default.
   * Added to support the Regenerate action's per-run model picker.
   */
  modelId?: string;
}

interface Persisted {
  conversations: Record<string, Conversation>;
  order: string[];
  activeId: string | null;
}

interface State extends Persisted {
  hydrated: boolean;

  hydrate: () => Promise<void>;

  // Conversation management
  newConversation: () => string;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;

  // Search
  search: (
    q: string,
  ) => Array<{ conv: Conversation; hit: 'title' | 'message'; snippet: string }>;

  // Active-conversation mutators
  getActive: () => Conversation | null;
  patchActive: (patch: Partial<Conversation>) => void;
  appendUserToActive: (content: string) => void;
  appendAssistantDeltaToActive: (delta: string) => void;
  finalizeAssistantOnActive: () => Promise<void>;
  clearActive: () => Promise<void>;

  // Conversation-scoped stream writers. Mirror the *ToActive mutators but
  // target a specific conversation ID so an in-flight stream keeps writing
  // to the conversation it started on even if the user switches away.
  appendAssistantDeltaToConversation: (convId: string, delta: string) => void;
  finalizeAssistantOnConversation: (convId: string) => Promise<void>;
  removeLastAssistantMessageFromConversation: (convId: string) => void;

  // Message-level action helpers (added for Message Actions feature)
  /**
   * Truncate the active conversation's messages at `index`, removing
   * the message at that index and everything after it. Used by Edit & Resend:
   * the caller then populates the composer with the removed user message so
   * the user can edit it and resend. Persists immediately.
   */
  truncateActiveAt: (index: number) => void;

  /**
   * Remove the final assistant message from the active conversation, if one
   * exists as the last message. Used by Regenerate to clear the old response
   * before streaming a new one. If the last message is not an assistant
   * message, this is a no-op. Persists immediately.
   */
  removeLastAssistantMessage: () => void;

  /**
   * Create a brand-new conversation, copy the active conversation's tool
   * settings and attached file IDs into it, optionally seed a composer draft
   * for the caller to read out, mark it active, and return its id.
   *
   * Used by:
   *   - Quote in new chat: caller passes the blockquote markdown as draftBody.
   *   - Any future "start a new chat pre-filled with X" flow.
   *
   * The draft itself is NOT appended as a message — the caller is expected
   * to populate the composer UI via a route param (?prefill=...). We return
   * it here only so the caller does not have to thread a separate value.
   */
  forkActiveAsNew: (draftBody?: string) => { newId: string; draftBody: string };
}

/* ------------------------- helpers ------------------------- */

function uid(): string {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  );
}

function makeConversation(partial?: Partial<Conversation>): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    titleLocked: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
    attachedFileIds: [],
    activeTools: [],
    autoTools: true,
    ...partial,
  };
}

function reorder(state: Persisted): string[] {
  const ids = Object.keys(state.conversations);
  ids.sort((a, b) => {
    const A = state.conversations[a];
    const B = state.conversations[b];
    if (A.pinned !== B.pinned) return A.pinned ? -1 : 1;
    return B.updatedAt - A.updatedAt;
  });
  return ids;
}

async function persist(state: Persisted): Promise<void> {
  const packed = await sealJson({
    conversations: state.conversations,
    order: state.order,
    activeId: state.activeId,
  });
  await AsyncStorage.setItem(BLOB_KEY, packed);
}

/* ------------------------- store --------------------------- */

export const useConversations = create<State>((set, get) => ({
  conversations: {},
  order: [],
  activeId: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;

    const packed = await AsyncStorage.getItem(BLOB_KEY);
    const loaded = await openJson<Persisted>(packed);

    if (loaded && Object.keys(loaded.conversations ?? {}).length > 0) {
      set({
        conversations: loaded.conversations,
        order: loaded.order?.length ? loaded.order : reorder(loaded),
        activeId:
          loaded.activeId && loaded.conversations[loaded.activeId]
            ? loaded.activeId
            : reorder(loaded)[0] ?? null,
        hydrated: true,
      });
      return;
    }

    const legacy = await AsyncStorage.getItem(LEGACY_CHAT_KEY);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        const root = parsed?.state ?? parsed;
        const legacyMsgs: ChatMsg[] = Array.isArray(root?.messages)
          ? root.messages
          : [];
        if (legacyMsgs.length > 0) {
          const conv = makeConversation({
            title: 'Previous chat',
            messages: legacyMsgs,
            attachedFileIds: root?.attachedFileIds ?? [],
            activeTools: root?.activeTools ?? [],
            autoTools: root?.autoTools ?? true,
          });
          const next: Persisted = {
            conversations: { [conv.id]: conv },
            order: [conv.id],
            activeId: conv.id,
          };
          await persist(next);
          await AsyncStorage.removeItem(LEGACY_CHAT_KEY);
          set({ ...next, hydrated: true });
          return;
        }
      } catch (e) {
        console.warn('[conversationsStore] legacy migration failed', e);
      }
    }

    const conv = makeConversation({ title: 'New chat' });
    const next: Persisted = {
      conversations: { [conv.id]: conv },
      order: [conv.id],
      activeId: conv.id,
    };
    await persist(next);
    set({ ...next, hydrated: true });
  },

  newConversation: () => {
    const conv = makeConversation({ title: 'New chat' });
    const conversations = { ...get().conversations, [conv.id]: conv };
    const order = reorder({ conversations, order: [], activeId: conv.id });
    set({ conversations, order, activeId: conv.id });
    void persist({ conversations, order, activeId: conv.id });
    return conv.id;
  },

  selectConversation: (id) => {
    if (!get().conversations[id]) return;
    set({ activeId: id });
    void persist({
      conversations: get().conversations,
      order: get().order,
      activeId: id,
    });
  },

  renameConversation: async (id, title) => {
    const existing = get().conversations[id];
    if (!existing) return;
    const updated: Conversation = {
      ...existing,
      title: title.trim() || existing.title,
      titleLocked: true,
      updatedAt: Date.now(),
    };
    const conversations = { ...get().conversations, [id]: updated };
    const order = reorder({ conversations, order: [], activeId: get().activeId });
    set({ conversations, order });
    await persist({ conversations, order, activeId: get().activeId });
  },

  deleteConversation: async (id) => {
    const { [id]: _drop, ...rest } = get().conversations;
    let order = get().order.filter((x) => x !== id);
    let activeId = get().activeId;

    if (activeId === id) {
      activeId = order[0] ?? null;
      if (!activeId) {
        const conv = makeConversation({ title: 'New chat' });
        rest[conv.id] = conv;
        order = [conv.id];
        activeId = conv.id;
      }
    }

    set({ conversations: rest, order, activeId });
    await persist({ conversations: rest, order, activeId });
  },

  togglePin: async (id) => {
    const existing = get().conversations[id];
    if (!existing) return;
    const updated: Conversation = {
      ...existing,
      pinned: !existing.pinned,
      updatedAt: Date.now(),
    };
    const conversations = { ...get().conversations, [id]: updated };
    const order = reorder({ conversations, order: [], activeId: get().activeId });
    set({ conversations, order });
    await persist({ conversations, order, activeId: get().activeId });
  },

  search: (q) => {
    const needle = q.toLowerCase();
    if (!needle) return [];
    const out: Array<{ conv: Conversation; hit: 'title' | 'message'; snippet: string }> = [];
    const { conversations, order } = get();
    for (const id of order) {
      const conv = conversations[id];
      if (!conv) continue;
      if (conv.title && conv.title.toLowerCase().includes(needle)) {
        out.push({ conv, hit: 'title', snippet: conv.title });
        continue;
      }
      let matched = false;
      for (let i = conv.messages.length - 1; i >= 0 && !matched; i--) {
        const m = conv.messages[i];
        if (!m?.content) continue;
        const lc = m.content.toLowerCase();
        const idx = lc.indexOf(needle);
        if (idx >= 0) {
          const start = Math.max(0, idx - 24);
          const end = Math.min(m.content.length, idx + needle.length + 40);
          const snippet =
            (start > 0 ? '… ' : '') +
            m.content.slice(start, end).replace(/\s+/g, ' ') +
            (end < m.content.length ? ' …' : '');
          out.push({ conv, hit: 'message', snippet });
          matched = true;
        }
      }
    }
    return out;
  },

  getActive: () => {
    const { activeId, conversations } = get();
    return activeId ? conversations[activeId] ?? null : null;
  },

  patchActive: (patch) => {
    const { activeId, conversations } = get();
    if (!activeId) return;
    const existing = conversations[activeId];
    if (!existing) return;
    const updated: Conversation = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    };
    const nextConvos = { ...conversations, [activeId]: updated };
    const order = reorder({ conversations: nextConvos, order: [], activeId });
    set({ conversations: nextConvos, order });
    void persist({ conversations: nextConvos, order, activeId });
  },

  appendUserToActive: (content) => {
    const { activeId, conversations } = get();
    if (!activeId) return;
    const existing = conversations[activeId];
    if (!existing) return;
    const msg: ChatMsg = { role: 'user', content, createdAt: Date.now() };
    const updated: Conversation = {
      ...existing,
      messages: [...existing.messages, msg],
      updatedAt: Date.now(),
    };
    const nextConvos = { ...conversations, [activeId]: updated };
    const order = reorder({ conversations: nextConvos, order: [], activeId });
    set({ conversations: nextConvos, order });
    void persist({ conversations: nextConvos, order, activeId });
  },

  appendAssistantDeltaToActive: (delta) => {
    const { activeId, conversations } = get();
    if (!activeId) return;
    const existing = conversations[activeId];
    if (!existing) return;
    const msgs = [...existing.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: (last.content || '') + delta };
    } else {
      msgs.push({ role: 'assistant', content: delta, createdAt: Date.now() });
    }
    const updated: Conversation = {
      ...existing,
      messages: msgs,
      updatedAt: Date.now(),
    };
    const nextConvos = { ...conversations, [activeId]: updated };
    // Intentionally skip reorder + persist on every token — too chatty.
    set({ conversations: nextConvos });
  },

  finalizeAssistantOnActive: async () => {
    const { activeId, conversations } = get();
    if (!activeId) return;
    const existing = conversations[activeId];
    if (!existing) return;

    const order = reorder({ conversations, order: [], activeId });
    set({ order });
    await persist({ conversations, order, activeId });

    if (!existing.titleLocked) {
      const firstUser = existing.messages.find((m) => m.role === 'user');
      const firstAssistant = existing.messages.find((m) => m.role === 'assistant');
      const shouldTitle =
        !!firstUser &&
        !!firstAssistant &&
        (!existing.title || existing.title === 'New chat');

      if (shouldTitle) {
        try {
          const title = await generateTitle(
            firstUser!.content,
            firstAssistant!.content,
          );
          const current = get().conversations[activeId];
          if (current && !current.titleLocked) {
            const updated: Conversation = {
              ...current,
              title,
              updatedAt: Date.now(),
            };
            const nextConvos = { ...get().conversations, [activeId]: updated };
            const nextOrder = reorder({
              conversations: nextConvos,
              order: [],
              activeId,
            });
            set({ conversations: nextConvos, order: nextOrder });
            await persist({
              conversations: nextConvos,
              order: nextOrder,
              activeId,
            });
          }
        } catch (e) {
          console.warn('[conversationsStore] auto-title failed', e);
        }
      }
    }
  },

  clearActive: async () => {
    const { activeId, conversations } = get();
    if (!activeId) return;
    const existing = conversations[activeId];
    if (!existing) return;
    const updated: Conversation = {
      ...existing,
      messages: [],
      attachedFileIds: [],
      updatedAt: Date.now(),
    };
    const nextConvos = { ...conversations, [activeId]: updated };
    const order = reorder({ conversations: nextConvos, order: [], activeId });
    set({ conversations: nextConvos, order });
    await persist({ conversations: nextConvos, order, activeId });
  },

  appendAssistantDeltaToConversation: (convId, delta) => {
    const { conversations } = get();
    const existing = conversations[convId];
    if (!existing) return;
    const msgs = [...existing.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: (last.content || '') + delta };
    } else {
      msgs.push({ role: 'assistant', content: delta, createdAt: Date.now() });
    }
    const updated: Conversation = {
      ...existing,
      messages: msgs,
      updatedAt: Date.now(),
    };
    const nextConvos = { ...conversations, [convId]: updated };
    // Same as the *ToActive variant: skip reorder + persist on every token.
    set({ conversations: nextConvos });
  },

  finalizeAssistantOnConversation: async (convId) => {
    const { conversations, activeId } = get();
    const existing = conversations[convId];
    if (!existing) return;

    const order = reorder({ conversations, order: [], activeId });
    set({ order });
    await persist({ conversations, order, activeId });

    if (!existing.titleLocked) {
      const firstUser = existing.messages.find((m) => m.role === 'user');
      const firstAssistant = existing.messages.find((m) => m.role === 'assistant');
      const shouldTitle =
        !!firstUser &&
        !!firstAssistant &&
        (!existing.title || existing.title === 'New chat');

      if (shouldTitle) {
        try {
          const title = await generateTitle(
            firstUser!.content,
            firstAssistant!.content,
          );
          const current = get().conversations[convId];
          if (current && !current.titleLocked) {
            const updated: Conversation = {
              ...current,
              title,
              updatedAt: Date.now(),
            };
            const nextConvos = { ...get().conversations, [convId]: updated };
            const nextOrder = reorder({
              conversations: nextConvos,
              order: [],
              activeId: get().activeId,
            });
            set({ conversations: nextConvos, order: nextOrder });
            await persist({
              conversations: nextConvos,
              order: nextOrder,
              activeId: get().activeId,
            });
          }
        } catch (e) {
          console.warn('[conversationsStore] auto-title failed', e);
        }
      }
    }
  },

  removeLastAssistantMessageFromConversation: (convId) => {
    const { conversations, activeId } = get();
    const existing = conversations[convId];
    if (!existing) return;
    const msgs = existing.messages;
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.role !== 'assistant') return;
    const updated: Conversation = {
      ...existing,
      messages: msgs.slice(0, -1),
      updatedAt: Date.now(),
    };
    const nextConvos = { ...conversations, [convId]: updated };
    const order = reorder({ conversations: nextConvos, order: [], activeId });
    set({ conversations: nextConvos, order });
    void persist({ conversations: nextConvos, order, activeId });
  },

  // -------------------- Message-level action helpers --------------------

  truncateActiveAt: (index) => {
    const { activeId, conversations } = get();
    if (!activeId) return;
    const existing = conversations[activeId];
    if (!existing) return;
    if (index < 0 || index >= existing.messages.length) return;
    const updated: Conversation = {
      ...existing,
      messages: existing.messages.slice(0, index),
      updatedAt: Date.now(),
    };
    const nextConvos = { ...conversations, [activeId]: updated };
    const order = reorder({ conversations: nextConvos, order: [], activeId });
    set({ conversations: nextConvos, order });
    void persist({ conversations: nextConvos, order, activeId });
  },

  removeLastAssistantMessage: () => {
    const { activeId, conversations } = get();
    if (!activeId) return;
    const existing = conversations[activeId];
    if (!existing) return;
    const msgs = existing.messages;
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.role !== 'assistant') return;
    const updated: Conversation = {
      ...existing,
      messages: msgs.slice(0, -1),
      updatedAt: Date.now(),
    };
    const nextConvos = { ...conversations, [activeId]: updated };
    const order = reorder({ conversations: nextConvos, order: [], activeId });
    set({ conversations: nextConvos, order });
    void persist({ conversations: nextConvos, order, activeId });
  },

  forkActiveAsNew: (draftBody) => {
    const { activeId, conversations } = get();
    const source = activeId ? conversations[activeId] : null;

    // Carry over tool settings and the active model if set, but NOT messages
    // or attached files. The new chat starts clean; the caller handles the
    // composer prefill via router params.
    const conv = makeConversation({
      title: 'New chat',
      activeTools: source?.activeTools ?? [],
      autoTools: source?.autoTools ?? true,
      modelId: source?.modelId,
    });

    const nextConvos = { ...conversations, [conv.id]: conv };
    const order = reorder({ conversations: nextConvos, order: [], activeId: conv.id });
    set({ conversations: nextConvos, order, activeId: conv.id });
    void persist({ conversations: nextConvos, order, activeId: conv.id });

    return { newId: conv.id, draftBody: draftBody ?? '' };
  },
}));