// src/store/promptsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DUBLOW_SEED } from '../data/dublowPromptSeed';

/**
 * A user-saved reusable prompt. Lives in exactly one folder, may carry zero or
 * more tags, and may contain {{placeholder}} tokens that are resolved at use-time.
 */
export type Prompt = {
  id: string;
  folderId: string;
  title: string;
  body: string;
  tags: string[];              // normalized lowercase, deduped
  createdAt: number;
  updatedAt: number;
  usageCount: number;          // increments on "Use"
  lastUsedAt?: number;
};

/**
 * A user-created folder. Every prompt belongs to exactly one. Deleting a folder
 * reassigns its prompts to the "Personal" default folder rather than destroying them.
 */
export type Folder = {
  id: string;
  name: string;
  createdAt: number;
};

export const PERSONAL_FOLDER_ID = 'folder_personal';
export const DUBLOW_FOLDER_ID = 'folder_dublow';

type PromptsState = {
  folders: Folder[];
  prompts: Prompt[];
  seeded: boolean;              // guards one-time Dublow seed on first launch

  // Folder CRUD
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;

  // Prompt CRUD
  createPrompt: (input: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'lastUsedAt'>) => string;
  updatePrompt: (id: string, patch: Partial<Omit<Prompt, 'id' | 'createdAt'>>) => void;
  deletePrompt: (id: string) => void;
  recordUsage: (id: string) => void;

  // Queries
  getByFolder: (folderId: string | null) => Prompt[];
  searchPrompts: (query: string, folderId?: string | null) => Prompt[];

  // Import / export
  exportJSON: () => string;
  importJSON: (raw: string, mode: 'merge' | 'replace') => { folders: number; prompts: number };

  // Maintenance
  seedDublowIfNeeded: () => void;
  clearAll: () => void;
};

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw || '').trim().toLowerCase();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

const DEFAULT_FOLDERS: Folder[] = [
  { id: DUBLOW_FOLDER_ID, name: 'Dublow', createdAt: Date.now() },
  { id: PERSONAL_FOLDER_ID, name: 'Personal', createdAt: Date.now() },
];

export const usePrompts = create<PromptsState>()(
  persist(
    (set, get) => ({
      folders: DEFAULT_FOLDERS,
      prompts: [],
      seeded: false,

      // ---------- Folders ----------
      createFolder: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return '';
        const id = makeId('folder');
        set((s) => ({
          folders: [...s.folders, { id, name: trimmed, createdAt: Date.now() }],
        }));
        return id;
      },

      renameFolder: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((s) => ({
          folders: s.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
        }));
      },

      deleteFolder: (id) => {
        // Personal is the safety net; cannot be deleted.
        if (id === PERSONAL_FOLDER_ID) return;
        set((s) => ({
          folders: s.folders.filter((f) => f.id !== id),
          prompts: s.prompts.map((p) =>
            p.folderId === id ? { ...p, folderId: PERSONAL_FOLDER_ID, updatedAt: Date.now() } : p,
          ),
        }));
      },

      // ---------- Prompts ----------
      createPrompt: (input) => {
        const now = Date.now();
        const prompt: Prompt = {
          id: makeId('prompt'),
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
          ...input,
          title: input.title.trim() || 'Untitled',
          body: input.body,
          tags: normalizeTags(input.tags),
          folderId: input.folderId || PERSONAL_FOLDER_ID,
        };
        set((s) => ({ prompts: [...s.prompts, prompt] }));
        return prompt.id;
      },

      updatePrompt: (id, patch) => {
        set((s) => ({
          prompts: s.prompts.map((p) => {
            if (p.id !== id) return p;
            return {
              ...p,
              ...patch,
              tags: patch.tags ? normalizeTags(patch.tags) : p.tags,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      deletePrompt: (id) => {
        set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }));
      },

      recordUsage: (id) => {
        set((s) => ({
          prompts: s.prompts.map((p) =>
            p.id === id
              ? { ...p, usageCount: p.usageCount + 1, lastUsedAt: Date.now() }
              : p,
          ),
        }));
      },

      // ---------- Queries ----------
      getByFolder: (folderId) => {
        const all = get().prompts;
        if (!folderId) return [...all].sort((a, b) => b.updatedAt - a.updatedAt);
        return all.filter((p) => p.folderId === folderId).sort((a, b) => b.updatedAt - a.updatedAt);
      },

      searchPrompts: (query, folderId) => {
        const q = query.trim().toLowerCase();
        const scoped = folderId ? get().prompts.filter((p) => p.folderId === folderId) : get().prompts;
        if (!q) return [...scoped].sort((a, b) => b.updatedAt - a.updatedAt);
        return scoped
          .filter((p) => {
            if (p.title.toLowerCase().includes(q)) return true;
            if (p.body.toLowerCase().includes(q)) return true;
            if (p.tags.some((t) => t.includes(q))) return true;
            return false;
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },

      // ---------- Import / Export ----------
      exportJSON: () => {
        const { folders, prompts } = get();
        const payload = {
          version: 1,
          exportedAt: new Date().toISOString(),
          folders,
          prompts,
        };
        return JSON.stringify(payload, null, 2);
      },

      importJSON: (raw, mode) => {
        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error('Invalid JSON');
        }
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid import file');

        const incomingFolders: Folder[] = Array.isArray(parsed.folders) ? parsed.folders : [];
        const incomingPrompts: Prompt[] = Array.isArray(parsed.prompts) ? parsed.prompts : [];

        // Validate and normalize incoming records defensively.
        const now = Date.now();
        const cleanFolders: Folder[] = incomingFolders
          .filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
          .map((f) => ({
            id: f.id,
            name: String(f.name).trim() || 'Imported Folder',
            createdAt: typeof f.createdAt === 'number' ? f.createdAt : now,
          }));

        const cleanPrompts: Prompt[] = incomingPrompts
          .filter((p) => p && typeof p.id === 'string' && typeof p.body === 'string')
          .map((p) => ({
            id: p.id,
            folderId: typeof p.folderId === 'string' ? p.folderId : PERSONAL_FOLDER_ID,
            title: String(p.title || '').trim() || 'Untitled',
            body: String(p.body),
            tags: normalizeTags(Array.isArray(p.tags) ? p.tags : []),
            createdAt: typeof p.createdAt === 'number' ? p.createdAt : now,
            updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now,
            usageCount: typeof p.usageCount === 'number' ? p.usageCount : 0,
            lastUsedAt: typeof p.lastUsedAt === 'number' ? p.lastUsedAt : undefined,
          }));

        if (mode === 'replace') {
          // Preserve the two default folders so the app never ends up with zero folders.
          const folders = [
            ...DEFAULT_FOLDERS,
            ...cleanFolders.filter((f) => f.id !== DUBLOW_FOLDER_ID && f.id !== PERSONAL_FOLDER_ID),
          ];
          set({ folders, prompts: cleanPrompts });
          return { folders: folders.length, prompts: cleanPrompts.length };
        }

        // Merge: union folders by id, union prompts by id (incoming wins on conflict).
        set((s) => {
          const folderMap = new Map<string, Folder>();
          for (const f of s.folders) folderMap.set(f.id, f);
          for (const f of cleanFolders) folderMap.set(f.id, f);

          const promptMap = new Map<string, Prompt>();
          for (const p of s.prompts) promptMap.set(p.id, p);
          for (const p of cleanPrompts) promptMap.set(p.id, p);

          return {
            folders: Array.from(folderMap.values()),
            prompts: Array.from(promptMap.values()),
          };
        });
        return { folders: cleanFolders.length, prompts: cleanPrompts.length };
      },

      // ---------- Maintenance ----------
     seedDublowIfNeeded: () => {
        const state = get();
        if (state.seeded) return;
        // Only seed if the Dublow folder is empty — avoids re-seeding if the
        // user has already started adding prompts to it manually.
        const dublowExisting = state.prompts.filter((p) => p.folderId === DUBLOW_FOLDER_ID);
        if (dublowExisting.length > 0) {
          set({ seeded: true });
          return;
        }
        const now = Date.now();
        const seededPrompts: Prompt[] = DUBLOW_SEED.map((s, idx) => ({
          id: makeId('prompt'),
          folderId: DUBLOW_FOLDER_ID,
          title: s.title,
          body: s.body,
          tags: normalizeTags(s.tags),
          createdAt: now + idx,
          updatedAt: now + idx,
          usageCount: 0,
        }));
        set((curr) => ({ prompts: [...curr.prompts, ...seededPrompts], seeded: true }));
      },

      clearAll: () => {
        set({ folders: DEFAULT_FOLDERS, prompts: [], seeded: false });
      },
    }),
    {
      name: 'hatz.prompts-library',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        folders: state.folders,
        prompts: state.prompts,
        seeded: state.seeded,
      }),
      version: 1,
      // On rehydration, ensure the two default folders always exist even if
      // a corrupted persisted payload stripped them. This is defensive.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const hasPersonal = state.folders.some((f) => f.id === PERSONAL_FOLDER_ID);
        const hasDublow = state.folders.some((f) => f.id === DUBLOW_FOLDER_ID);
        if (!hasPersonal || !hasDublow) {
          const missing: Folder[] = [];
          if (!hasDublow) missing.push({ id: DUBLOW_FOLDER_ID, name: 'Dublow', createdAt: Date.now() });
          if (!hasPersonal) missing.push({ id: PERSONAL_FOLDER_ID, name: 'Personal', createdAt: Date.now() });
          state.folders = [...missing, ...state.folders];
        }
      },
    },
  ),
);