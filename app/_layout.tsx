// app/_layout.tsx
import { Stack, router } from 'expo-router';
import { View, Text, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useSettings } from '../src/store/settingsStore';
import { useChat } from '../src/store/chatStore';
import { useTheme } from '../src/theme';
import { initNotifications, jobIdFromResponse } from '../src/lib/notifications';
import { startJobPoller } from '../src/lib/jobPoller';

LogBox.ignoreLogs([
  'A props object containing a "key" prop is being spread into JSX',
]);

export default function RootLayout() {
  const hydrateSettings = useSettings((s) => s.hydrate);
  const hydrateChat = useChat((s) => s.hydrate);
  const hydrated = useSettings((s) => s.hydrated);
  const theme = useTheme();

  const didInitNotifs = useRef(false);

  useEffect(() => {
    hydrateSettings();
    hydrateChat();
  }, [hydrateSettings, hydrateChat]);

  // Notifications: request permission once.
  useEffect(() => {
    if (didInitNotifs.current) return;
    didInitNotifs.current = true;
    void initNotifications();
    // Clear any stale delivered notifications so old test taps don't replay.
    Notifications.dismissAllNotificationsAsync().catch(() => {});
  }, []);

  // Notifications: tap → route. Warm listener only; cold-start disabled
  // to avoid racing the router.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const jobId = jobIdFromResponse(response);
      if (jobId) router.push(`/jobs/${jobId}` as any);
    });
    return () => sub.remove();
  }, []);

  // Global foreground job poller.
  useEffect(() => {
    const stop = startJobPoller();
    return stop;
  }, []);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 56, fontWeight: '800', letterSpacing: 2 }}>Hatz</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
            headerTintColor: theme.colors.primary,
            contentStyle: { backgroundColor: theme.colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}