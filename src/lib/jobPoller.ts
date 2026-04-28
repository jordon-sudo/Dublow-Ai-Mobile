// src/lib/jobPoller.ts
// Foreground-only poller. Every POLL_INTERVAL_MS it walks every non-terminal
// job in workflowJobsStore, refreshes its status, and fires a local
// notification the first time a job reaches a terminal state.
import { AppState, type AppStateStatus } from 'react-native';
import { HatzClient } from './hatzClient';
import { isTerminalStatus } from './appsTypes';
import { useWorkflowJobs, type TrackedJob } from '../store/workflowJobsStore';
import { useSettings } from '../store/settingsStore';
import { notifyJobComplete } from './notifications';

const POLL_INTERVAL_MS = 5000;

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let appStateSub: { remove: () => void } | null = null;

function getPendingJobs(): TrackedJob[] {
  const { jobs } = useWorkflowJobs.getState();
  return Object.values(jobs).filter(
    (j) => !isTerminalStatus(j.status) || j.notified !== true,
  );
}

async function tick(): Promise<void> {
  if (inFlight) return;
  const apiKey = useSettings.getState().apiKey;
  if (!apiKey) return;

  const pending = getPendingJobs();
  if (pending.length === 0) return;

  inFlight = true;
  const client = new HatzClient(apiKey);
  const { updateJob, markNotified } = useWorkflowJobs.getState();

  try {
    // Poll in parallel but cap concurrency to avoid bursts on large backlogs.
    const batches = chunk(pending, 4);
    for (const batch of batches) {
      await Promise.all(
        batch.map(async (job) => {
          try {
            const snapshot = await client.getJobStatus(job.job_id);
            const wasTerminal = isTerminalStatus(job.status);
            await updateJob(job.job_id, snapshot);

            if (!wasTerminal && isTerminalStatus(snapshot.status) && !job.notified) {
              // Read the freshly-updated job back out so the notification
              // body reflects the latest status string.
              const fresh = useWorkflowJobs.getState().jobs[job.job_id];
              if (fresh) {
                await notifyJobComplete(fresh);
                await markNotified(job.job_id);
              }
            }
          } catch (e) {
            // Transient errors (network, 5xx) are ignored; next tick retries.
            console.warn('[jobPoller] poll failed for', job.job_id, e);
          }
        }),
      );
    }
  } finally {
    inFlight = false;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function handleAppState(state: AppStateStatus) {
  if (state === 'active') {
    // Fire immediately on return to foreground so users see fresh state.
    void tick();
  }
}

/** Start the global job poller. Idempotent. */
export function startJobPoller(): void {
  if (timer) return;

  // Ensure the store is hydrated at least once before the first tick.
  void useWorkflowJobs.getState().hydrate();

  timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);

  appStateSub = AppState.addEventListener('change', handleAppState);

  // Immediate first tick so a quick-completing job notifies fast.
  void tick();
}

/** Stop the poller. Only useful during teardown / tests. */
export function stopJobPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}