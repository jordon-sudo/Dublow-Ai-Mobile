// src/store/settingsStore.ts
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HatzClient, ModelInfo, AppInfo } from '../lib/hatzClient';

const API_KEY_SLOT = 'hatz_api_key';
const USER_EMAIL_SLOT = 'hatz_user_email';
const USER_HASH_ID_SLOT = 'hatz_user_hash_id';
const PREFS_KEY = 'hatz_prefs_v2';

interface Prefs {
  selectedModel: string | null;
  systemPrompt: string;
  defaultTools: string[];
  defaultAutoTools: boolean;
}

const DEFAULT_PREFS: Prefs = {
  selectedModel: null,
  systemPrompt: '',
  defaultTools: [],
  defaultAutoTools: true,
};

export interface PickTarget extends ModelInfo {}

export interface TargetGroup {
  title: string;
  kind: 'agent' | 'model';
  items: PickTarget[];
}

interface SettingsState {
  hydrated: boolean;
  apiKey: string | null;
  userEmail: string | null;
  userHashId: string | null;
  models: PickTarget[];
  apps: AppInfo[];

  selectedModel: string | null;
  systemPrompt: string;
  defaultTools: string[];
  defaultAutoTools: boolean;

  hydrate: () => Promise<void>;
  setApiKey: (key: string | null) => Promise<void>;
  setAuth: (args: { apiKey: string; userEmail: string; userHashId: string }) => Promise<void>;
  signOut: () => Promise<void>;
  setSelectedModel: (id: string) => Promise<void>;
  setSystemPrompt: (s: string) => Promise<void>;
  setDefaultTools: (t: string[]) => Promise<void>;
  setDefaultAutoTools: (b: boolean) => Promise<void>;
  refreshCatalog: () => Promise<void>;

  getClient: () => HatzClient | null;
  getGroupedTargets: () => TargetGroup[];
}

async function savePrefs(p: Prefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

export const useSettings = create<SettingsState>((set, get) => ({
  hydrated: false,
  apiKey: null,
  userEmail: null,
  userHashId: null,
  models: [],
  apps: [],
  ...DEFAULT_PREFS,

  hydrate: async () => {
    try {
      const [key, email, hashId, prefsRaw] = await Promise.all([
        SecureStore.getItemAsync(API_KEY_SLOT),
        SecureStore.getItemAsync(USER_EMAIL_SLOT),
        SecureStore.getItemAsync(USER_HASH_ID_SLOT),
        AsyncStorage.getItem(PREFS_KEY),
      ]);
      const prefs: Prefs = prefsRaw ? { ...DEFAULT_PREFS, ...JSON.parse(prefsRaw) } : DEFAULT_PREFS;
      set({ apiKey: key, userEmail: email, userHashId: hashId, ...prefs, hydrated: true });
      if (key) await get().refreshCatalog();
    } catch (e) {
      console.warn('settings hydrate failed', e);
      set({ hydrated: true });
    }
  },

  setApiKey: async (key) => {
    if (key) await SecureStore.setItemAsync(API_KEY_SLOT, key);
    else await SecureStore.deleteItemAsync(API_KEY_SLOT);
    set({ apiKey: key });
    if (key) await get().refreshCatalog();
    else set({ models: [], apps: [] });
  },

  setAuth: async ({ apiKey, userEmail, userHashId }) => {
    await Promise.all([
      SecureStore.setItemAsync(API_KEY_SLOT, apiKey),
      SecureStore.setItemAsync(USER_EMAIL_SLOT, userEmail),
      SecureStore.setItemAsync(USER_HASH_ID_SLOT, userHashId),
    ]);
    set({ apiKey, userEmail, userHashId });
    await get().refreshCatalog();
  },

  signOut: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(API_KEY_SLOT),
      SecureStore.deleteItemAsync(USER_EMAIL_SLOT),
      SecureStore.deleteItemAsync(USER_HASH_ID_SLOT),
    ]);
    set({
      apiKey: null,
      userEmail: null,
      userHashId: null,
      models: [],
      apps: [],
      selectedModel: null,
    });
  },

  setSelectedModel: async (id) => {
    set({ selectedModel: id });
    await savePrefs({
      selectedModel: id,
      systemPrompt: get().systemPrompt,
      defaultTools: get().defaultTools,
      defaultAutoTools: get().defaultAutoTools,
    });
  },

  setSystemPrompt: async (s) => {
    set({ systemPrompt: s });
    await savePrefs({
      selectedModel: get().selectedModel,
      systemPrompt: s,
      defaultTools: get().defaultTools,
      defaultAutoTools: get().defaultAutoTools,
    });
  },

  setDefaultTools: async (t) => {
    set({ defaultTools: t });
    await savePrefs({
      selectedModel: get().selectedModel,
      systemPrompt: get().systemPrompt,
      defaultTools: t,
      defaultAutoTools: get().defaultAutoTools,
    });
  },

  setDefaultAutoTools: async (b) => {
    set({ defaultAutoTools: b });
    await savePrefs({
      selectedModel: get().selectedModel,
      systemPrompt: get().systemPrompt,
      defaultTools: get().defaultTools,
      defaultAutoTools: b,
    });
  },

  refreshCatalog: async () => {
    const client = get().getClient();
    if (!client) return;
    try {
      const [models, agents, apps] = await Promise.all([
        client.listModels().catch((e) => { console.warn('listModels', e); return [] as ModelInfo[]; }),
        client.listAgents().catch((e) => { console.warn('listAgents', e); return [] as ModelInfo[]; }),
        client.listApps().catch((e) => { console.warn('listApps', e); return [] as AppInfo[]; }),
      ]);
      set({ models: [...agents, ...models], apps });

      if (!get().selectedModel) {
        const firstModel = models[0] ?? agents[0];
        if (firstModel) await get().setSelectedModel(firstModel.id);
      }
    } catch (e) {
      console.warn('refreshCatalog failed', e);
    }
  },

  getClient: () => {
    const k = get().apiKey;
    return k ? new HatzClient(k) : null;
  },

  getGroupedTargets: () => {
    const all = get().models;
    const agents = all.filter((t) => t.kind === 'agent');
    const models = all.filter((t) => t.kind === 'model');

    const agentGroup: TargetGroup | null = agents.length
      ? {
          title: 'My Agents',
          kind: 'agent',
          items: [...agents].sort((a, b) => a.label.localeCompare(b.label)),
        }
      : null;

    const byProvider = new Map<string, PickTarget[]>();
    for (const m of models) {
      const key = m.provider || 'Other';
      if (!byProvider.has(key)) byProvider.set(key, []);
      byProvider.get(key)!.push(m);
    }
    const modelGroups: TargetGroup[] = Array.from(byProvider.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, items]) => ({
        title: provider,
        kind: 'model' as const,
        items: items.sort((a, b) => a.label.localeCompare(b.label)),
      }));

    return agentGroup ? [agentGroup, ...modelGroups] : modelGroups;
  },
}));