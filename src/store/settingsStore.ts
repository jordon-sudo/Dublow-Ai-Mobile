// src/store/settingsStore.ts
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HatzClient, ModelInfo, AppInfo } from '../lib/hatzClient';

const API_KEY_SLOT = 'hatz_api_key';
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

/** A single selectable target in the picker (model or agent). */
export interface PickTarget extends ModelInfo {}

/** Grouped view for the picker UI. */
export interface TargetGroup {
  title: string;       // "My Agents" | developer name
  kind: 'agent' | 'model';
  items: PickTarget[];
}

interface SettingsState {
  hydrated: boolean;
  apiKey: string | null;
  models: PickTarget[];     // All models + agents, flat
  apps: AppInfo[];

  // Prefs
  selectedModel: string | null;
  systemPrompt: string;
  defaultTools: string[];
  defaultAutoTools: boolean;

  // Actions
  hydrate: () => Promise<void>;
  setApiKey: (key: string | null) => Promise<void>;
  setSelectedModel: (id: string) => Promise<void>;
  setSystemPrompt: (s: string) => Promise<void>;
  setDefaultTools: (t: string[]) => Promise<void>;
  setDefaultAutoTools: (b: boolean) => Promise<void>;
  refreshCatalog: () => Promise<void>;

  // Derived
  getClient: () => HatzClient | null;
  getGroupedTargets: () => TargetGroup[];
}

async function savePrefs(p: Prefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

export const useSettings = create<SettingsState>((set, get) => ({
  hydrated: false,
  apiKey: null,
  models: [],
  apps: [],
  ...DEFAULT_PREFS,

  hydrate: async () => {
    try {
      const [key, prefsRaw] = await Promise.all([
        SecureStore.getItemAsync(API_KEY_SLOT),
        AsyncStorage.getItem(PREFS_KEY),
      ]);
      const prefs: Prefs = prefsRaw ? { ...DEFAULT_PREFS, ...JSON.parse(prefsRaw) } : DEFAULT_PREFS;
      set({ apiKey: key, ...prefs, hydrated: true });
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
      // Merge agents + models into a single flat list; UI groups via getGroupedTargets.
      set({ models: [...agents, ...models], apps });

      // If no model selected yet, default to first available model (not agent).
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

    // Agents: single group, alpha by label.
    const agentGroup: TargetGroup | null = agents.length
      ? {
          title: 'My Agents',
          kind: 'agent',
          items: [...agents].sort((a, b) => a.label.localeCompare(b.label)),
        }
      : null;

    // Models: group by provider (developer), alpha groups, alpha within group.
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