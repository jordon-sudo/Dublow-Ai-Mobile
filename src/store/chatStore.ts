// src/store/chatStore.ts
// Thin compatibility shim over useConversations. Preserves the original
// useChat() surface so existing screens keep working unchanged. All state
// now lives in the active conversation inside conversationsStore, which
// handles encrypted persistence and legacy migration.
import { create } from 'zustand';
import { useConversations, ChatMsg } from './conversationsStore';

export type { ChatMsg };

interface ChatState {
  hydrated: boolean;
  messages: ChatMsg[];
  attachedFileIds: string[];
  activeTools: string[];
  autoTools: boolean;

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

/**
 * Read the current active conversation and project it into the legacy
 * ChatState shape. Called on every subscription notification below.
 */
function project(): Pick<
  ChatState,
  'messages' | 'attachedFileIds' | 'activeTools' | 'autoTools' | 'hydrated'
> {
  const c = useConversations.getState();
  const active = c.activeId ? c.conversations[c.activeId] : null;
  return {
    hydrated: c.hydrated,
    messages: active?.messages ?? [],
    attachedFileIds: active?.attachedFileIds ?? [],
    activeTools: active?.activeTools ?? [],
    autoTools: active?.autoTools ?? true,
  };
}

export const useChat = create<ChatState>((set, get) => ({
  ...project(),

  hydrate: async () => {
    await useConversations.getState().hydrate();
    set(project());
  },

  clear: async () => {
    await useConversations.getState().clearActive();
    set(project());
  },

  appendUser: (content) => {
    useConversations.getState().appendUserToActive(content);
    set(project());
  },

  appendAssistantDelta: (delta) => {
    useConversations.getState().appendAssistantDeltaToActive(delta);
    // Lightweight projection: avoid full recompute during streaming.
    const active = useConversations.getState().getActive();
    if (active) set({ messages: active.messages });
  },

  finalizeAssistant: () => {
    // Fire-and-forget; conversationsStore handles persistence + auto-title.
    void useConversations.getState().finalizeAssistantOnActive();
    set(project());
  },

  setAttachedFileIds: async (ids) => {
    useConversations.getState().patchActive({ attachedFileIds: ids });
    set(project());
  },

  addAttachedFileId: async (id) => {
    const current = useConversations.getState().getActive()?.attachedFileIds ?? [];
    const ids = Array.from(new Set([...current, id]));
    useConversations.getState().patchActive({ attachedFileIds: ids });
    set(project());
  },

  removeAttachedFileId: async (id) => {
    const current = useConversations.getState().getActive()?.attachedFileIds ?? [];
    useConversations
      .getState()
      .patchActive({ attachedFileIds: current.filter((x) => x !== id) });
    set(project());
  },

  setActiveTools: async (tools) => {
    useConversations.getState().patchActive({ activeTools: tools });
    set(project());
  },

  setAutoTools: async (b) => {
    useConversations.getState().patchActive({ autoTools: b });
    set(project());
  },
}));

// Keep useChat in lock-step with conversationsStore: any change to the
// active conversation (including switching conversations via the drawer)
// re-projects into useChat so subscribed components re-render naturally.
useConversations.subscribe((s, prev) => {
  const activeChanged = s.activeId !== prev.activeId;
  const hydrationChanged = s.hydrated !== prev.hydrated;
  const activeConv = s.activeId ? s.conversations[s.activeId] : null;
  const prevConv = prev.activeId ? prev.conversations[prev.activeId] : null;
  const convChanged = activeConv !== prevConv;
  if (activeChanged || hydrationChanged || convChanged) {
    useChat.setState(project());
  }
});