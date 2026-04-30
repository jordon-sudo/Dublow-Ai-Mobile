// app/privacy.tsx
// Privacy & data settings. Lets the user opt out of product analytics.
// Crash reporting stays always-on so we can ship fixes — this is stated plainly.
import { ScrollView, StyleSheet, Switch, Text, View, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../src/store/settingsStore';
import { useTheme, spacing, radii, fontSize } from '../src/theme';

export default function PrivacyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const analyticsEnabled = useSettings((s) => s.analyticsEnabled);
  const setAnalyticsEnabled = useSettings((s) => s.setAnalyticsEnabled);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.bg }]}
      edges={['bottom']}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Privacy',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTitleStyle: { color: theme.colors.text },
          headerTintColor: theme.colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} style={{ paddingHorizontal: 8 }}>
              <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.sectionHeader, { color: theme.colors.textMuted }]}>
            Product Analytics
          </Text>

          <View
            style={[
              styles.row,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Ionicons name="bar-chart-outline" size={18} color={theme.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                Usage analytics
              </Text>
              <Text style={[styles.rowCaption, { color: theme.colors.textMuted }]}>
                Helps us prioritize improvements. No message content, file contents, or
                personal information is ever sent.
              </Text>
            </View>
            <Switch
              value={analyticsEnabled}
              onValueChange={setAnalyticsEnabled}
              trackColor={{ true: theme.colors.primary, false: theme.colors.surfaceAlt }}
            />
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.sectionHeader, { color: theme.colors.textMuted }]}>
            What we collect
          </Text>
          <View
            style={[
              styles.panel,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Bullet theme={theme} text="Anonymous user ID (your account hash, never your email)." />
            <Bullet theme={theme} text="Feature events: sign-in, message sent, model changed, app run, workflow run." />
            <Bullet theme={theme} text="Coarse metadata: model ID, success/failure, latency buckets, error categories." />
            <Bullet theme={theme} text="Device type and OS version (standard mobile app context)." />
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.sectionHeader, { color: theme.colors.textMuted }]}>
            What we never collect
          </Text>
          <View
            style={[
              styles.panel,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Bullet theme={theme} text="Message content or chat history." />
            <Bullet theme={theme} text="File contents or file names." />
            <Bullet theme={theme} text="Email addresses, phone numbers, or any free-form personal text." />
            <Bullet theme={theme} text="Location, contacts, or device identifiers beyond what the OS publishes." />
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.sectionHeader, { color: theme.colors.textMuted }]}>
            Crash Reporting
          </Text>
          <View
            style={[
              styles.panel,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.bodyText, { color: theme.colors.text }]}>
              Crash reports are always enabled so we can fix bugs and improve stability. Reports
              contain stack traces and device information — never your messages or files.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Bullet({ theme, text }: { theme: ReturnType<typeof useTheme>; text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bulletDot, { color: theme.colors.textMuted }]}>•</Text>
      <Text style={[styles.bodyText, { color: theme.colors.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontSize: fontSize.md, fontWeight: '600', marginBottom: 2 },
  rowCaption: { fontSize: fontSize.xs, lineHeight: 17 },
  panel: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletDot: { fontSize: fontSize.md, lineHeight: 20 },
  bodyText: { fontSize: fontSize.sm, lineHeight: 20 },
});