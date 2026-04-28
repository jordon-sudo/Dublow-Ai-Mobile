// src/store/workflowJobsStore.ts
// Encrypted, persisted registry of jobs (workflow + client-side app pseudo-jobs).
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sealJson, openJson } from '../lib/secureBlob';
import { isTerminalStatus, type WorkflowJob, type JobStatus } from '../lib/appsTypes';

const BLOB_KEY = 'hatz_workflow_jobs_v1';

const TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_JOBS = 100;
// If an app pseudo-job has been "running" longer than this, assume the app
// was force-quit mid-run and mark it failed.
const APP_STUCK_TIMEOUT_MS = 10 * 60 * 1000;

export interface TrackedJob {
  job_id: string;
  app_id: string;
  app_name: string;
  is_workflow: boolean;        // false => client-side app pseudo-job
  created_at: number;
  updated_at: number;
  status: JobStatus | string;
  notified: boolean;
  last_snapshot?: WorkflowJob; // workflows only
  inputs?: Record<string, unknown>;
  output_data?: string;        // apps: final text output
  error?: string;              // apps: failure reason
}

interface Persisted {
  jobs: Record<string, TrackedJob>;
  order: string[];
}

interface State extends Persisted {
  hydrated: boolean;

  hydrate: () => Promise<void>;

  trackJob: (params: {
    job_id: string;
    app_id: string;
    app_name: string;
    inputs?: Record<string, unknown>;
  }) => Promise<void>;

  trackAppJob: (params: {
    job_id: string;
    app_id: string;
    app_name: string;
    inputs?: Record<string, unknown>;
  }) => Promise<void>;

  completeAppJob: (job_id: string, output: string) => Promise<void>;
  failAppJob: (job_id: string, error: string) => Promise<void>;

  updateJob: (job_id: string, snapshot: WorkflowJob) => Promise<boolean>;
  markNotified: (job_id: string) => Promise<void>;
  removeJob: (job_id: string) => Promise<void>;

  getJob: (job_id: string) => TrackedJob | null;
  getPendingJobs: () => TrackedJob[];
  getAllJobs: () => TrackedJob[];
}

async function persist(state: Persisted): Promise<void> {
  const packed = await sealJson({ jobs: state.jobs, order: state.order });
  await AsyncStorage.setItem(BLOB_KEY, packed);
}

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

/** On hydrate, mark any app pseudo-job stuck in non-terminal state as failed.
 *  Workflows are not swept — they live on the server and the poller handles them. */
function sweepStuckAppJobs(state: Persisted): Persisted {
  const now = Date.now();
  const jobs = { ...state.jobs };
  let mutated = false;
  for (const id of state.order) {
    const j = jobs[id];
    if (!j) continue;
    if (j.is_workflow) continue;
    if (isTerminalStatus(j.status)) continue;
    if (now - j.created_at < APP_STUCK_TIMEOUT_MS) continue;
    jobs[id] = {
      ...j,
      status: 'failed',
      error: 'Run interrupted (app closed before completion).',
      updated_at: now,
    };
    mutated = true;
  }
  return mutated ? { jobs, order: state.order } : state;
}

export const useWorkflowJobs = create<State>((set, get) => ({
  jobs: {},
  order: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const packed = await AsyncStorage.getItem(BLOB_KEY);
    const loaded = await openJson<Persisted>(packed);
    if (loaded && loaded.jobs) {
      const base = prune({
        jobs: loaded.jobs,
        order: loaded.order?.length ? loaded.order : Object.keys(loaded.jobs),
      });
      const swept = sweepStuckAppJobs(base);
      set({ ...swept, hydrated: true });
      void persist(swept);
    } else {
      set({ hydrated: true });
    }
  },

  trackJob: async ({ job_id, app_id, app_name, inputs }) => {
    if (get().jobs[job_id]) return;
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

  trackAppJob: async ({ job_id, app_id, app_name, inputs }) => {
    if (get().jobs[job_id]) return;
    const now = Date.now();
    const job: TrackedJob = {
      job_id,
      app_id,
      app_name,
      is_workflow: false,
      created_at: now,
      updated_at: now,
      status: 'running',
      notified: false,
      inputs,
    };
    const jobs = { ...get().jobs, [job_id]: job };
    const order = [job_id, ...get().order.filter((x) => x !== job_id)];
    const pruned = prune({ jobs, order });
    set(pruned);
    await persist(pruned);
  },

  completeAppJob: async (job_id, output) => {
    const existing = get().jobs[job_id];
    if (!existing) return;
    const updated: TrackedJob = {
      ...existing,
      status: 'complete',
      output_data: output,
      updated_at: Date.now(),
    };
    const jobs = { ...get().jobs, [job_id]: updated };
    set({ jobs });
    await persist({ jobs, order: get().order });
  },

  failAppJob: async (job_id, error) => {
    const existing = get().jobs[job_id];
    if (!existing) return;
    const updated: TrackedJob = {
      ...existing,
      status: 'failed',
      error,
      updated_at: Date.now(),
    };
    const jobs = { ...get().jobs, [job_id]: updated };
    set({ jobs });
    await persist({ jobs, order: get().order });
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