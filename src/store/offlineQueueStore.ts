// src/store/offlineQueueStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A single queued outgoing message waiting to be sent when connectivity returns.
 *
 * We capture enough state at queue-time to faithfully replay the send later —
 * model/target, the tools configuration that was active, and the conversation
 * the message belongs to. This ensures that switching conversations between
 * queue and replay does not misroute the send.
 */
export type QueuedMessage = {
  /** Client-side unique ID. Used to reconcile the pending bubble in the transcript
   *  with the queue entry, and to remove the entry on successful send. */
  id: string;

  /** The conversation this message belongs to. Replay always targets this
   *  conversation, regardless of what the user is currently viewing. */
  conversationId: string;

  /** The user-composed message body. */
  content: string;

  /** The target ID selected at queue time (model id or agent id). We replay
   *  against the same target the user chose, not whatever is currently selected. */
  targetId: string;

  /** Tools configuration captured at queue time. */
  autoTools: boolean;
  activeTools: string[];

  /** Unix epoch ms at which the message was queued. Used for FIFO ordering
   *  and for displaying relative timestamps on pending bubbles if desired. */
  queuedAt: number;

  /** Replay attempt counter. Incremented each time replay is attempted. Useful
   *  for backoff logic or for surfacing "failed to send after N attempts" UX. */
  attempts: number;

  /** Last error message if the most recent replay attempt failed. Cleared on
   *  successful send (at which point the entry is removed entirely). */
  lastError?: string;
};

type OfflineQueueState = {
  queue: QueuedMessage[];

  /** Append a new message to the queue. Returns the generated ID so the caller
   *  can render the pending bubble with a matching marker. */
  enqueue: (
    input: Omit<QueuedMessage, 'id' | 'queuedAt' | 'attempts' | 'lastError'>,
  ) => string;

  /** Remove an entry by ID. Called after a successful replay. */
  remove: (id: string) => void;

  /** Increment the attempts counter and optionally record the last error. */
  recordAttempt: (id: string, error?: string) => void;

  /** Get all queued messages for a specific conversation, in FIFO order. */
  getForConversation: (conversationId: string) => QueuedMessage[];

  /** Clear all queued messages across all conversations. Exposed for a future
   *  "Clear offline queue" settings action; not called automatically. */
  clearAll: () => void;
};

function makeId(): string {
  // Compact non-cryptographic ID. Good enough for in-app reconciliation.
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queue: [],

      enqueue: (input) => {
        const entry: QueuedMessage = {
          id: makeId(),
          queuedAt: Date.now(),
          attempts: 0,
          ...input,
        };
        set((s) => ({ queue: [...s.queue, entry] }));
        return entry.id;
      },

      remove: (id) => {
        set((s) => ({ queue: s.queue.filter((m) => m.id !== id) }));
      },

      recordAttempt: (id, error) => {
        set((s) => ({
          queue: s.queue.map((m) =>
            m.id === id ? { ...m, attempts: m.attempts + 1, lastError: error } : m,
          ),
        }));
      },

      getForConversation: (conversationId) => {
        return get()
          .queue.filter((m) => m.conversationId === conversationId)
          .sort((a, b) => a.queuedAt - b.queuedAt);
      },

      clearAll: () => set({ queue: [] }),
    }),
    {
      name: 'hatz.offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the queue itself. Methods are re-hydrated from the factory
      // on next app launch.
      partialize: (state) => ({ queue: state.queue }),
      version: 1,
    },
  ),
);