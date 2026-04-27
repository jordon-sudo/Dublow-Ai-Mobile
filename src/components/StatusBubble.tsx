// src/components/StatusBubble.tsx
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radii, fontSize } from '../theme';
import type { StreamStatus } from '../lib/hatzClient';

function labelFor(status: StreamStatus | null): { label: string; icon: keyof typeof Ionicons.glyphMap } {
  if (!status) return { label: 'Thinking', icon: 'sparkles-outline' };
  switch (status.kind) {
    case 'thinking': return { label: 'Thinking', icon: 'sparkles-outline' };
    case 'tool':     return { label: status.name ? `Using ${status.name}` : 'Using tools', icon: 'construct-outline' };
    case 'summary':  return { label: 'Summarizing', icon: 'document-text-outline' };
    case 'writing':  return { label: 'Writing', icon: 'create-outline' };
    default:         return { label: 'Thinking', icon: 'sparkles-outline' };
  }
}

export function StatusBubble({ status }: { status: StreamStatus | null }) {
  const theme = useTheme();
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const make = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
    const a = make(dot1, 0);
    const b = make(dot2, 150);
    const c = make(dot3, 300);
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [dot1, dot2, dot3]);

  const { label, icon } = labelFor(status);

  return (
    <View style={[styles.bubble, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Ionicons name={icon} size={14} color={theme.colors.primary} />
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <View style={styles.dots}>
        <Animated.View style={[styles.dot, { backgroundColor: theme.colors.primary, opacity: dot1 }]} />
        <Animated.View style={[styles.dot, { backgroundColor: theme.colors.primary, opacity: dot2 }]} />
        <Animated.View style={[styles.dot, { backgroundColor: theme.colors.primary, opacity: dot3 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  label: { fontSize: fontSize.sm, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 3, marginLeft: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});