// src/lib/appRunRegistry.ts
// In-flight registry for synchronous app runs. Because Hatz's /v1/app/{id}/query
// has no job_id concept, we fake jobs on the client and kick the fetch here so
// it survives the runner screen unmounting.
import { HatzClient } from './hatzClient';
import { useWorkflowJobs } from '../store/workflowJobsStore';
import { notifyJobComplete } from './notifications';

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

  const run = (async () => {
    try {
      const output = await client.runApp({ appId, inputs, fileUuids });
      await useWorkflowJobs.getState().completeAppJob(localJobId, output);
      await notifyJobComplete({
        job_id: localJobId,
        app_name: appName,
        status: 'complete',
      });
    } catch (e: any) {
      const msg = e?.message ?? 'App run failed.';
      await useWorkflowJobs.getState().failAppJob(localJobId, msg);
      await notifyJobComplete({
        job_id: localJobId,
        app_name: appName,
        status: 'failed',
      });
    } finally {
      inflight.delete(localJobId);
    }
  })();

  inflight.set(localJobId, run);
  // Suppress unhandled rejection warnings; errors are captured above.
  void run.catch(() => {});
}