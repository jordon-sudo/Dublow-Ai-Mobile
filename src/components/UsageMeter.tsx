// src/components/UsageMeter.tsx
// Settings-page credit usage meter. Always visible when we have data;
// colorizes by threshold (green / yellow / red). The full UsageBanner
// renders above this whenever it has a warn/cap message.
import { StyleSheet, Text, View } from 'react-native';
import { useUsage, percentUsed, deriveKind } from '../store/usageStore';
import { useTheme, spacing, radii, fontSize } from '../theme';

export default function UsageMeter() {
  const theme = useTheme();
  const totalLimit = useUsage((s) => s.totalLimit);
  const totalUsed = useUsage((s) => s.totalUsed);
  const available = useUsage((s) => s.available);
  const hasData = useUsage((s) => s.hasData);
  const pct = useUsage(percentUsed);

  // Endpoint unreachable or not yet loaded — hide silently.
  if (!available || !hasData || pct == null) return null;

  const kind = deriveKind(totalUsed, totalLimit);
  const clamped = Math.max(0, Math.min(1, pct));
  const percentLabel = `${Math.min(999, Math.round(pct * 100))}%`;

  // Color grade: green <80, yellow 80-94, red >=95.
  const fill =
    kind === 'cap' ? '#DC2626'   // red-600
    : kind === 'warn' ? '#F59E0B' // amber-500
    : '#10B981';                  // emerald-500

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Credit Usage</Text>
        <Text style={[styles.percent, { color: theme.colors.textMuted }]}>
          {percentLabel}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: fill, width: `${clamped * 100}%` },
          ]}
        />
      </View>
      <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
        {formatCredits(totalUsed)} of {formatCredits(totalLimit)} credits used
      </Text>
    </View>
  );
}

function formatCredits(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontSize: fontSize.sm, fontWeight: '600' },
  percent: { fontSize: fontSize.xs, fontWeight: '600' },
  track: {
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  sub: { fontSize: fontSize.xs },
});