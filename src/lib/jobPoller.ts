// src/lib/jobPoller.ts
// App-wide foreground poller. Scans workflowJobsStore for non-terminal jobs,
// polls each via HatzClient, updates the store, and fires a local notification
// on terminal transitions (exactly once per job).
import { AppState, type AppStateStatus } from 'react-native';
import { HatzClient } from './hatzClient';
import { isTerminalStatus } from './appsTypes';
import { useWorkflowJobs } from '../store/workflowJobsStore';
import { useSettings } from '../store/settingsStore';
import { notifyJobComplete } from './notifications';

const POLL_INTERVAL_MS = 5000;

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let polling = false; // reentrancy guard

async function tick(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const apiKey = useSettings.getState().apiKey;
    if (!apiKey) return;

    const state = useWorkflowJobs.getState();
    if (!state.hydrated) return;

    const pending = state.order
      .map((id) => state.jobs[id])
      .filter((j) => j && !isTerminalStatus(j.status) && !j.notified);

    if (pending.length === 0) return;

    const client = new HatzClient(apiKey);

    // Poll sequentially to avoid bursting the API.
    for (const job of pending) {
      try {
        const fresh = await client.getJobStatus(job.job_id);
        const wasTerminal = isTerminalStatus(job.status);
        await state.updateJob(job.job_id, fresh);

        if (!wasTerminal && isTerminalStatus(fresh.status)) {
          await notifyJobComplete({
            job_id: job.job_id,
            app_name: job.app_name,
            status: fresh.status,
          });
          await useWorkflowJobs.getState().markNotified(job.job_id);
        }
      } catch (e) {
        // Network blip — try again next tick.
        console.warn('[jobPoller] tick error', job.job_id, e);
      }
    }
  } finally {
    polling = false;
  }
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  // Kick immediately so users don't wait a full interval on app open.
  void tick();
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function handleAppStateChange(next: AppStateStatus) {
  if (next === 'active') startTimer();
  else stopTimer();
}

/**
 * Start the global poller. Idempotent — safe to call multiple times.
 * Returns a disposer for cleanup.
 */
export function startJobPoller(): () => void {
  if (appStateSub) return () => {}; // already started

  if (AppState.currentState === 'active') startTimer();
  appStateSub = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    stopTimer();
    appStateSub?.remove();
    appStateSub = null;
  };
}