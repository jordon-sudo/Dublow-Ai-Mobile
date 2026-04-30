// src/store/usageStore.ts
// Tracks the organization's credit usage and drives the UsageBanner.
//
// Strategy:
//   - Poll GET /v1/usage/limit every 5 minutes while the app is foregrounded.
//   - Immediately refresh on workflow 429 (soft cap signal) so the banner
//     appears without waiting for the next poll tick.
//   - If the endpoint returns 401/403 (key lacks scope), silently disable
//     the feature — user never sees a broken banner.
//
// Threshold model:
//   <80%  -> 'none'  (no banner)
//   80-94% -> 'warn'  (amber "approaching limit")
//   >=95% -> 'cap'    (red "credit limit reached, cheap models only")
//
// Dismissal:
//   Users can dismiss each kind independently for the session. The banner
//   re-appears on a kind bump (warn -> cap) so severity escalation is never
//   silent. Dismissals are in-memory (not persisted) so they naturally
//   reset on app restart.
import { create } from 'zustand';
import { AppState, AppStateStatus } from 'react-native';
import { useSettings } from './settingsStore';

export type BannerKind = 'none' | 'warn' | 'cap';

interface UsageState {
  totalLimit: number | null;
  totalUsed: number | null;
  loadedAt: number | null;
  /** true once we've confirmed the endpoint is accessible with this key. */
  available: boolean;
  /** Last successful refresh returned a meaningful response. */
  hasData: boolean;
  /** Kind dismissed by the user in this session. */
  dismissedKind: BannerKind;

  refresh: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  dismiss: (kind: BannerKind) => void;
  /** Called by the client layer when a workflow 429 is observed. */
  notifyWorkflowLimited: () => void;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let pollTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

export const useUsage = create<UsageState>((set, get) => ({
  totalLimit: null,
  totalUsed: null,
  loadedAt: null,
  available: true,
  hasData: false,
  dismissedKind: 'none',

  refresh: async () => {
    const getClient = useSettings.getState().getClient;
    const client = getClient();
    console.log('[usageStore] refresh, client=', !!client);
    if (!client) return;
    try {
      const snap = await client.getUsageLimit();
      console.log('[usageStore] snap=', snap);
      console.log('[usageStore] snap=', snap);
      if (snap === null) {
        console.warn('[usageStore] endpoint returned 401/403 — disabling banner');
        set({ available: false });
        return;
      }
      const prevKind = deriveKind(get().totalUsed, get().totalLimit);
      const nextKind = deriveKind(snap.totalUsed, snap.totalLimit);
      set({
        totalLimit: snap.totalLimit,
        totalUsed: snap.totalUsed,
        loadedAt: Date.now(),
        available: true,
        hasData: true,
        // Reset dismissal when severity increases so escalations aren't hidden.
        dismissedKind:
          rank(nextKind) > rank(prevKind) ? 'none' : get().dismissedKind,
      });
    } catch (err) {
      // Transient network / 5xx. Keep whatever we already had; do not flip
      // `available` to false — only 401/403 should do that.
      console.warn('[usageStore] refresh failed', err);
    }
  },

  startPolling: () => {
    console.log('[usageStore] startPolling called, timer=', !!pollTimer);
    if (pollTimer) return;
    void get().refresh();
    pollTimer = setInterval(() => {
      if (AppState.currentState === 'active') void get().refresh();
    }, POLL_INTERVAL_MS);
    appStateSub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') void get().refresh();
    });
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (appStateSub) {
      appStateSub.remove();
      appStateSub = null;
    }
  },

  dismiss: (kind) => set({ dismissedKind: kind }),

  notifyWorkflowLimited: () => {
    // A 429 from workflows means we're at/over the soft cap. Trigger a
    // refresh so the banner updates to 'cap' without waiting for poll.
    void get().refresh();
  },
}));

/** Percentage used as a float 0..1+, or null if we have no data yet. */
export function percentUsed(s: UsageState): number | null {
  if (s.totalLimit == null || s.totalUsed == null || s.totalLimit <= 0) return null;
  return s.totalUsed / s.totalLimit;
}

export function deriveKind(used: number | null, limit: number | null): BannerKind {
  if (used == null || limit == null || limit <= 0) return 'none';
  const pct = used / limit;
  if (pct >= 0.0001) return 'cap';   // any usage at all triggers red
  if (pct >= 0 ) return 'warn';
  return 'none';
}

function rank(k: BannerKind): number {
  return k === 'cap' ? 2 : k === 'warn' ? 1 : 0;
}

/** Derived selector: banner kind the UI should render right now. */
export function selectVisibleKind(s: UsageState): BannerKind {
  if (!s.available || !s.hasData) return 'none';
  const actual = deriveKind(s.totalUsed, s.totalLimit);
  if (actual === 'none') return 'none';
  if (rank(s.dismissedKind) >= rank(actual)) return 'none';
  return actual;
}