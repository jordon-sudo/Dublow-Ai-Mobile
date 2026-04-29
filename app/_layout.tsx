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

LogBox.ignoreLogs([
  'A props object containing a "key" prop is being spread into JSX',
]);

export default function RootLayout() {
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

    return () => {
      unsubNotifTap();
    };
  }, [hydrateSettings, hydrateChat]);

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
}