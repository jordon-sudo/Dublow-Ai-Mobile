// src/store/workflowJobsStore.ts
// Encrypted, persisted registry of workflow jobs the user has started.
// Mirrors the conversationsStore pattern: AES-GCM via secureBlob on top
// of AsyncStorage. Holds in-flight and recently completed jobs so they
// survive app restarts and power the Jobs screen + background poller.
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sealJson, openJson } from '../lib/secureBlob';
import { isTerminalStatus, type WorkflowJob, type JobStatus } from '../lib/appsTypes';

const BLOB_KEY = 'hatz_workflow_jobs_v1';

// How long to keep terminal jobs before auto-purging (7 days).
const TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
// Cap on total tracked jobs to keep the blob small.
const MAX_JOBS = 100;

export interface TrackedJob {
  job_id: string;
  app_id: string;
  app_name: string;           // Snapshot of the app's display name at run time.
  is_workflow: boolean;       // Always true today; reserved for future single-app async runs.
  created_at: number;         // Local epoch ms when we kicked it off.
  updated_at: number;         // Local epoch ms of the last snapshot write.
  status: JobStatus | string; // Last observed server status.
  notified: boolean;          // Has a local notification already fired for this terminal transition?
  last_snapshot?: WorkflowJob;// Last full server response, for the Jobs screen.
  inputs?: Record<string, unknown>; // What the user submitted, for replay/debug.
}

interface Persisted {
  jobs: Record<string, TrackedJob>;
  order: string[]; // job_ids, most recent first
}

interface State extends Persisted {
  hydrated: boolean;

  hydrate: () => Promise<void>;

  /** Register a new job the instant /workflows/run returns a job_id. */
  trackJob: (params: {
    job_id: string;
    app_id: string;
    app_name: string;
    inputs?: Record<string, unknown>;
  }) => Promise<void>;

  /** Write a fresh server snapshot. Returns true if this write caused
   *  the job to transition into a terminal status for the first time. */
  updateJob: (job_id: string, snapshot: WorkflowJob) => Promise<boolean>;

  /** Mark that a notification has been delivered for this job. */
  markNotified: (job_id: string) => Promise<void>;

  /** Remove a job from tracking entirely. */
  removeJob: (job_id: string) => Promise<void>;

  /** Convenience readers. */
  getJob: (job_id: string) => TrackedJob | null;
  getPendingJobs: () => TrackedJob[];
  getAllJobs: () => TrackedJob[];
}

/* ------------------------- helpers ------------------------- */

async function persist(state: Persisted): Promise<void> {
  const packed = await sealJson({ jobs: state.jobs, order: state.order });
  await AsyncStorage.setItem(BLOB_KEY, packed);
}

/** Drop very old terminal jobs and cap the total list size. */
function prune(state: Persisted): Persisted {
  const now = Date.now();
  const jobs: Record<string, TrackedJob> = {};
  const kept: string[] = [];

  for (const id of state.order) {
    const j = state.jobs[id];
    if (!j) continue;
    const aged =
      isTerminalStatus(j.status) && now - j.updated_at > TERMINAL_RETENTION_MS;
    if (aged) continue;
    jobs[id] = j;
    kept.push(id);
    if (kept.length >= MAX_JOBS) break;
  }

  return { jobs, order: kept };
}

/* ------------------------- store --------------------------- */

export const useWorkflowJobs = create<State>((set, get) => ({
  jobs: {},
  order: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const packed = await AsyncStorage.getItem(BLOB_KEY);
    const loaded = await openJson<Persisted>(packed);
    if (loaded && loaded.jobs) {
      const pruned = prune({
        jobs: loaded.jobs,
        order: loaded.order?.length ? loaded.order : Object.keys(loaded.jobs),
      });
      set({ ...pruned, hydrated: true });
      // Persist pruned state back so disk reflects memory.
      void persist(pruned);
    } else {
      set({ hydrated: true });
    }
  },

  trackJob: async ({ job_id, app_id, app_name, inputs }) => {
    const existing = get().jobs[job_id];
    if (existing) return; // Idempotent.

    const now = Date.now();
    const job: TrackedJob = {
      job_id,
      app_id,
      app_name,
      is_workflow: true,
      created_at: now,
      updated_at: now,
      status: 'pending',
      notified: false,
      inputs,
    };

    const jobs = { ...get().jobs, [job_id]: job };
    const order = [job_id, ...get().order.filter((x) => x !== job_id)];
    const pruned = prune({ jobs, order });
    set(pruned);
    await persist(pruned);
  },

  updateJob: async (job_id, snapshot) => {
    const existing = get().jobs[job_id];
    if (!existing) return false;

    const wasTerminal = isTerminalStatus(existing.status);
    const nowTerminal = isTerminalStatus(snapshot.status);
    const justTerminated = !wasTerminal && nowTerminal;

    const updated: TrackedJob = {
      ...existing,
      status: snapshot.status,
      last_snapshot: snapshot,
      updated_at: Date.now(),
    };

    const jobs = { ...get().jobs, [job_id]: updated };
    // Keep order stable; no reordering on status change.
    set({ jobs });
    await persist({ jobs, order: get().order });

    return justTerminated;
  },

  markNotified: async (job_id) => {
    const existing = get().jobs[job_id];
    if (!existing || existing.notified) return;
    const updated: TrackedJob = { ...existing, notified: true };
    const jobs = { ...get().jobs, [job_id]: updated };
    set({ jobs });
    await persist({ jobs, order: get().order });
  },

  removeJob: async (job_id) => {
    if (!get().jobs[job_id]) return;
    const { [job_id]: _drop, ...rest } = get().jobs;
    const order = get().order.filter((x) => x !== job_id);
    set({ jobs: rest, order });
    await persist({ jobs: rest, order });
  },

  getJob: (job_id) => get().jobs[job_id] ?? null,

  getPendingJobs: () => {
    const { jobs, order } = get();
    const out: TrackedJob[] = [];
    for (const id of order) {
      const j = jobs[id];
      if (j && !isTerminalStatus(j.status)) out.push(j);
    }
    return out;
  },

  getAllJobs: () => {
    const { jobs, order } = get();
    return order.map((id) => jobs[id]).filter(Boolean) as TrackedJob[];
  },
}));