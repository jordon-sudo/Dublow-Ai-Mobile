// src/lib/notifications.ts
// Local notifications for workflow job completion.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import type { TrackedJob } from '../store/workflowJobsStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
  }) as any,
});

let permissionRequested = false;

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (existing.canAskAgain === false) return false;
    if (permissionRequested && !existing.granted) return false;

    permissionRequested = true;
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });

    if (Platform.OS === 'android' && req.granted) {
      await Notifications.setNotificationChannelAsync('workflow-jobs', {
        name: 'Workflow Jobs',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    return req.granted;
  } catch (e) {
    console.warn('[notifications] permission error', e);
    return false;
  }
}

export async function notifyJobComplete(
  job: Pick<TrackedJob, 'job_id' | 'app_name' | 'status'>,
): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const isFailed = String(job.status).toLowerCase() === 'failed';
    const title = isFailed
      ? `${job.app_name} failed`
      : `${job.app_name} completed`;
    const body = isFailed
      ? 'Tap to view the error details.'
      : 'Tap to view the results.';

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { job_id: job.job_id },
        sound: 'default',
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('[notifications] schedule error', e);
  }
}

export function installNotificationTapHandler(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as
      | { job_id?: string }
      | undefined;
    const jobId = data?.job_id;
    if (jobId && typeof jobId === 'string') {
      setTimeout(() => {
        router.push(`/jobs/${jobId}` as any);
      }, 50);
    }
  });
  return () => sub.remove();
}