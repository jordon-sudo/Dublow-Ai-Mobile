// src/store/chatStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_KEY = 'hatz_chat_v2';

export interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface PersistedChat {
  messages: ChatMsg[];
  attachedFileIds: string[];
  activeTools: string[];
  autoTools: boolean;
}

interface ChatState extends PersistedChat {
  hydrated: boolean;

  hydrate: () => Promise<void>;
  clear: () => Promise<void>;

  // Messages
  appendUser: (content: string) => void;
  appendAssistantDelta: (delta: string) => void;
  finalizeAssistant: () => void;

  // Session options
  setAttachedFileIds: (ids: string[]) => Promise<void>;
  addAttachedFileId: (id: string) => Promise<void>;
  removeAttachedFileId: (id: string) => Promise<void>;

  setActiveTools: (tools: string[]) => Promise<void>;
  setAutoTools: (b: boolean) => Promise<void>;
}

const DEFAULTS: PersistedChat = {
  messages: [],
  attachedFileIds: [],
  activeTools: [],
  autoTools: true,
};

async function persist(state: PersistedChat) {
  await AsyncStorage.setItem(CHAT_KEY, JSON.stringify(state));
}

export const useChat = create<ChatState>((set, get) => ({
  hydrated: false,
  ...DEFAULTS,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(CHAT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedChat>;
        set({ ...DEFAULTS, ...parsed, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch (e) {
      console.warn('chat hydrate failed', e);
      set({ hydrated: true });
    }
  },

  clear: async () => {
    set({ ...DEFAULTS });
    await AsyncStorage.removeItem(CHAT_KEY);
  },

  appendUser: (content) => {
    const next = [...get().messages, { role: 'user' as const, content }];
    set({ messages: next });
    persist({
      messages: next,
      attachedFileIds: get().attachedFileIds,
      activeTools: get().activeTools,
      autoTools: get().autoTools,
    });
  },

  appendAssistantDelta: (delta) => {
    const msgs = get().messages;
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant') {
      const updated = [...msgs.slice(0, -1), { ...last, content: last.content + delta }];
      set({ messages: updated });
    } else {
      set({ messages: [...msgs, { role: 'assistant' as const, content: delta }] });
    }
  },

  finalizeAssistant: () => {
    persist({
      messages: get().messages,
      attachedFileIds: get().attachedFileIds,
      activeTools: get().activeTools,
      autoTools: get().autoTools,
    });
  },

  setAttachedFileIds: async (ids) => {
    set({ attachedFileIds: ids });
    await persist({
      messages: get().messages,
      attachedFileIds: ids,
      activeTools: get().activeTools,
      autoTools: get().autoTools,
    });
  },

  addAttachedFileId: async (id) => {
    const ids = Array.from(new Set([...get().attachedFileIds, id]));
    await get().setAttachedFileIds(ids);
  },

  removeAttachedFileId: async (id) => {
    await get().setAttachedFileIds(get().attachedFileIds.filter((x) => x !== id));
  },

  setActiveTools: async (tools) => {
    set({ activeTools: tools });
    await persist({
      messages: get().messages,
      attachedFileIds: get().attachedFileIds,
      activeTools: tools,
      autoTools: get().autoTools,
    });
  },

  setAutoTools: async (b) => {
    set({ autoTools: b });
    await persist({
      messages: get().messages,
      attachedFileIds: get().attachedFileIds,
      activeTools: get().activeTools,
      autoTools: b,
    });
  },
}));