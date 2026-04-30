// src/lib/appRunRegistry.ts
// In-flight registry for synchronous app runs. Because Hatz's /v1/app/{id}/query
// has no job_id concept, we fake jobs on the client and kick the fetch here so
// it survives the runner screen unmounting.
import { HatzClient } from './hatzClient';
import { useWorkflowJobs } from '../store/workflowJobsStore';
import { notifyJobComplete } from './notifications';
import { track, captureError, latencyBucket } from './telemetry';

const inflight = new Map<string, Promise<void>>();

export function isAppRunInflight(localJobId: string): boolean {
  return inflight.has(localJobId);
}

export function startAppRun(params: {
  localJobId: string;
  appId: string;
  appName: string;
  inputs: Record<string, any>;
  fileUuids?: string[];
  client: HatzClient;
}): void {
  const { localJobId, appId, appName, inputs, fileUuids, client } = params;
  if (inflight.has(localJobId)) return;

  const store = useWorkflowJobs.getState();

  const startedAt = Date.now();

  const run = (async () => {
    try {
      const output = await client.runApp({ appId, inputs, fileUuids });
      await useWorkflowJobs.getState().completeAppJob(localJobId, output);
      track('app_run_completed', {
        ok: true,
        latency: latencyBucket(Date.now() - startedAt),
      });
      await notifyJobComplete({
        job_id: localJobId,
        app_name: appName,
        status: 'complete',
      } as any);
    } catch (e: any) {
      const msg = e?.message ?? 'App run failed.';
      await useWorkflowJobs.getState().failAppJob(localJobId, msg);
      track('app_run_completed', {
        ok: false,
        latency: latencyBucket(Date.now() - startedAt),
        error_kind: e?.name ?? 'Error',
      });
      captureError(e, { where: 'appRun.execute' });
      await notifyJobComplete({
        job_id: localJobId,
        app_name: appName,
        status: 'failed',
      } as any);
    } finally {
      inflight.delete(localJobId);
    }
  })();

  inflight.set(localJobId, run);
  // Suppress unhandled rejection warnings; errors are captured above.
  void run.catch(() => {});
}