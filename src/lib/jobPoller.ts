// src/lib/jobPoller.ts
// Foreground-only poller. Every POLL_INTERVAL_MS it walks every non-terminal
// job in workflowJobsStore, refreshes its status, and fires a local
// notification the first time a job reaches a terminal state.
//
// Separately, on every tick (and on hydration) it sweeps already-terminal
// jobs that were never notified — those get a one-shot local notification
// and are marked notified so they never poll again.
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

/** Jobs that need a server poll: non-terminal only. */
function getPollableJobs(): TrackedJob[] {
  const { jobs } = useWorkflowJobs.getState();
  return Object.values(jobs).filter(
    (j) => j.is_workflow && !isTerminalStatus(j.status),
  );
}

/** Jobs that are already terminal but were never notified. */
function getUnnotifiedTerminalJobs(): TrackedJob[] {
  const { jobs } = useWorkflowJobs.getState();
  return Object.values(jobs).filter(
    (j) => isTerminalStatus(j.status) && j.notified !== true,
  );
}

/** Fire notifications for terminal-but-unnotified jobs. No network calls. */
async function sweepUnnotifiedTerminal(): Promise<void> {
  const stale = getUnnotifiedTerminalJobs();
  if (stale.length === 0) return;
  const { markNotified } = useWorkflowJobs.getState();
  for (const job of stale) {
    // Stale jobs from before this fix are silently absorbed. Real-time
    // completions still notify via the main tick loop.
    const ageMs = Date.now() - (job.updated_at ?? 0);
    const STALE_NOTIFY_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    if (ageMs < STALE_NOTIFY_THRESHOLD_MS) {
      try {
        await notifyJobComplete(job);
      } catch (e) {
        console.warn('[jobPoller] notify failed for', job.job_id, e);
      }
    }
    // Mark notified even if the notification threw — we do not want to
    // retry indefinitely and spam the user. One best-effort shot.
    await markNotified(job.job_id);
  }
}

async function tick(): Promise<void> {
  if (inFlight) return;

  // Always do the free (no-network) sweep first so zombies die fast.
  await sweepUnnotifiedTerminal();

  const apiKey = useSettings.getState().apiKey;
  if (!apiKey) return;

  const pending = getPollableJobs();
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

            if (!wasTerminal && isTerminalStatus(snapshot.status)) {
              // Read the freshly-updated job back out so the notification
              // body reflects the latest status string.
              const fresh = useWorkflowJobs.getState().jobs[job.job_id];
              if (fresh && !fresh.notified) {
                try {
                  await notifyJobComplete(fresh);
                } catch (e) {
                  console.warn('[jobPoller] notify failed for', job.job_id, e);
                }
                // Mark notified unconditionally so we never loop on this job,
                // even if the notification API threw.
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

  // Ensure the store is hydrated at least once before the first tick. After
  // hydration, immediately sweep any terminal-but-unnotified jobs from prior
  // sessions so they do not get re-polled even once.
  void (async () => {
    await useWorkflowJobs.getState().hydrate();
    await sweepUnnotifiedTerminal();
  })();

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