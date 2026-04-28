// src/lib/notifications.ts
// Local-notification helper for workflow job completion.
// Uses expo-notifications in local mode (no push server required).
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_CHANNEL_ID = 'workflow-jobs';

/**
 * Configure how notifications behave while the app is in the foreground.
 * We want the banner + sound even if the user is currently using the app —
 * otherwise a job completing while they're on another screen is silent.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * One-time setup: request permission and register the Android channel.
 * Safe to call on every app launch; Expo dedupes.
 * Returns true if notifications are usable.
 */
export async function initNotifications(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Workflow Jobs',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#7818D8',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    return status === 'granted';
  } catch (e) {
    console.warn('[notifications] init failed', e);
    return false;
  }
}

export interface JobCompletionPayload {
  job_id: string;
  app_name: string;
  status: 'complete' | 'failed' | string;
}

/**
 * Fire a local notification for a terminal job transition.
 * The job_id travels in `data` so the tap handler can deep-link.
 */
export async function notifyJobComplete(payload: JobCompletionPayload): Promise<void> {
  const didFail = payload.status === 'failed';
  const title = didFail
    ? `${payload.app_name} failed`
    : `${payload.app_name} finished`;
  const body = didFail
    ? 'Tap to see what went wrong.'
    : 'Tap to view the results.';

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { job_id: payload.job_id, kind: 'workflow-job' },
        sound: true,
      },
      trigger:
        Platform.OS === 'android'
          ? { channelId: ANDROID_CHANNEL_ID, seconds: 1 }
          : null, // iOS fires immediately when trigger is null.
    });
  } catch (e) {
    console.warn('[notifications] schedule failed', e);
  }
}

/**
 * Extract a job_id from a notification response, if it belongs to us.
 * Returns null for notifications from other sources.
 */
export function jobIdFromResponse(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data as
    | { job_id?: string; kind?: string }
    | undefined;
  if (!data || data.kind !== 'workflow-job' || !data.job_id) return null;
  return String(data.job_id);
}