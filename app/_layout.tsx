// app/_layout.tsx
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, Text, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useSettings } from '../src/store/settingsStore';
import { useChat } from '../src/store/chatStore';
import { useTheme } from '../src/theme';
import {
  ensureNotificationPermission,
  installNotificationTapHandler,
} from '../src/lib/notifications';
import { startJobPoller } from '../src/lib/jobPoller';
import { useUsage } from '../src/store/usageStore';
import { initTelemetry, track } from '../src/lib/telemetry';

// Initialize telemetry once at module load (before any React renders).
initTelemetry();
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://9f28b1c9f6c4aa969abe2702680be75f@o4511309479673856.ingest.us.sentry.io/4511309492977664',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

LogBox.ignoreLogs([
  'A props object containing a "key" prop is being spread into JSX',
]);

export default Sentry.wrap(function RootLayout() {
  const hydrateSettings = useSettings((s) => s.hydrate);
  const hydrateChat = useChat((s) => s.hydrate);
  const hydrated = useSettings((s) => s.hydrated);
  const userHashId = useSettings((s) => s.userHashId);
  const apiKey = useSettings((s) => s.apiKey);
  const theme = useTheme();

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    hydrateSettings();
    hydrateChat();

    void ensureNotificationPermission();
    const unsubNotifTap = installNotificationTapHandler();
    startJobPoller();
    track('app_open');

    return () => {
      unsubNotifTap();
    };
  }, [hydrateSettings, hydrateChat]);

  // Usage polling — starts only after the user is authenticated, since the
  // endpoint needs a valid API key. Stops on sign-out to avoid 401 spam.
  useEffect(() => {
    if (!hydrated) return;
    const authed = !!apiKey && !!userHashId;
    if (!authed) {
      useUsage.getState().stopPolling();
      return;
    }
    useUsage.getState().startPolling();
    return () => {
      useUsage.getState().stopPolling();
    };
  }, [hydrated, apiKey, userHashId]);

  // Gate: route to /signin when auth is incomplete, and away from /signin when complete.
  useEffect(() => {
    if (!hydrated) return;
    const onSignIn = segments[0] === 'signin';
    const authed = !!apiKey && !!userHashId;

    if (!authed && !onSignIn) {
      router.replace('/signin');
    } else if (authed && onSignIn) {
      router.replace('/');
    }
  }, [hydrated, apiKey, userHashId, segments, router]);

  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#000',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>
          Hatz
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.bg },
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});