// src/components/UsageBanner.tsx
// Credit-usage banner. Shows amber when approaching the org's soft cap,
// red when at/past it. Dismissible via tap or (optionally) a left/right swipe.
import { useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUsage, percentUsed, selectVisibleKind } from '../store/usageStore';
import { spacing, radii, fontSize } from '../theme';

interface Props {
  /** Enable horizontal swipe-to-dismiss. Default false. */
  swipeToDismiss?: boolean;
}

export default function UsageBanner({ swipeToDismiss = false }: Props) {
  const kind = useUsage(selectVisibleKind);
  const pct = useUsage(percentUsed);
  const dismiss = useUsage((s) => s.dismiss);

  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // PanResponder is created unconditionally so hook order stays stable
  // across renders where `kind` flips between 'none' and a real value.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        swipeToDismiss && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_e, g) => {
        translateX.setValue(g.dx);
        opacity.setValue(Math.max(0.2, 1 - Math.abs(g.dx) / 220));
      },
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) > 110) {
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: g.dx > 0 ? 500 : -500,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }),
          ]).start(() => {
            dismiss(kind === 'none' ? 'warn' : kind);
            translateX.setValue(0);
            opacity.setValue(1);
          });
        } else {
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(opacity, { toValue: 1, useNativeDriver: true }),
          ]).start();
        }
      },
    }),
  ).current;

  if (kind === 'none') return null;

  const pctLabel = pct == null ? '' : `${Math.min(999, Math.round(pct * 100))}%`;
  const isCap = kind === 'cap';
  const bg = isCap ? '#FEE4E2' : '#FEF3C7';
  const border = isCap ? '#F97066' : '#F59E0B';
  const fg = isCap ? '#7A271A' : '#78350F';
  const icon = isCap ? 'alert-circle' : 'warning';

  const title = isCap ? 'Credit limit reached' : 'Approaching credit limit';
  const body = isCap
    ? `You've used ${pctLabel} of your organization's credits. Responses may be routed to lower-cost models until usage resets.`
    : `You've used ${pctLabel} of your organization's credits.`;

  return (
    <Animated.View
      {...(swipeToDismiss ? pan.panHandlers : {})}
      style={[
        styles.wrap,
        { backgroundColor: bg, borderColor: border, transform: [{ translateX }], opacity },
      ]}
    >
      <Ionicons name={icon} size={18} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: fg }]}>{title}</Text>
        <Text style={[styles.body, { color: fg }]}>{body}</Text>
      </View>
      <Pressable onPress={() => dismiss(kind)} hitSlop={8} style={styles.closeBtn}>
        <Ionicons name="close" size={16} color={fg} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: 2 },
  body: { fontSize: fontSize.xs, lineHeight: 16 },
  closeBtn: { padding: 2 },
});