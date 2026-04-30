// src/components/CodeBlock.tsx
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import CodeHighlighter from 'react-native-code-highlighter';
import {
  atomOneDark,
  atomOneLight,
} from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { useTheme, spacing, radii, fontSize, type Theme } from '../theme';

const COLLAPSE_THRESHOLD = 20;
const PREVIEW_LINES = 10;

// Map theme modes to highlight.js styles. Extend here when adding new modes.
const HLJS_STYLE_BY_MODE: Record<Theme['mode'], Record<string, any>> = {
  dark: atomOneDark,
  // light: atomOneLight, // enable when a light theme mode is added
};

// Fallback for modes not yet mapped (keeps TS and runtime safe).
const FALLBACK_HLJS = atomOneDark;

interface Props {
  code: string;
  language?: string;
}

export default function CodeBlock({ code, language }: Props) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lang = (language || '').toLowerCase().trim() || 'text';
  const lines = useMemo(() => code.replace(/\n$/, '').split('\n'), [code]);
  const isLong = lines.length > COLLAPSE_THRESHOLD;
  const hiddenCount = isLong ? lines.length - PREVIEW_LINES : 0;
  const displayCode =
    isLong && !expanded
      ? lines.slice(0, PREVIEW_LINES).join('\n')
      : code.replace(/\n$/, '');

  // Strip `background` and `backgroundColor` from EVERY token class in the
  // hljs style object, not just the top-level `hljs` key. react-syntax-highlighter
  // merges these into inline styles on nested <Text> nodes, so any one of them
  // can paint a light surface over our themed wrapper.
  const hljsStyle = useMemo(() => {
    const base = HLJS_STYLE_BY_MODE[theme.mode] ?? FALLBACK_HLJS;
    const out: Record<string, any> = {};
    for (const key of Object.keys(base)) {
      const { background, backgroundColor, ...rest } = (base as any)[key] ?? {};
      out[key] = rest;
    }
    return out;
  }, [theme.mode]);

  // Derive subtle header/footer dividers from the theme border so they read
  // correctly on both dark and (future) light surfaces.
  const divider = theme.colors.border;

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: divider }]}>
        <Text style={[styles.langLabel, { color: theme.colors.textMuted }]}>
          {lang}
        </Text>
        <Pressable onPress={copy} style={styles.copyBtn} hitSlop={8}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? theme.colors.success : theme.colors.textMuted}
          />
          <Text
            style={[
              styles.copyText,
              { color: copied ? theme.colors.success : theme.colors.textMuted },
            ]}
          >
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        }}
      >
        <CodeHighlighter
          language={lang}
          hljsStyle={hljsStyle}
          textStyle={{
            backgroundColor: 'transparent',
            fontSize: 13,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          }}
          containerStyle={{
            backgroundColor: theme.colors.surfaceAlt,
            padding: 0,
          }}
          scrollViewProps={{
            style: { backgroundColor: theme.colors.surfaceAlt },
            contentContainerStyle: { backgroundColor: theme.colors.surfaceAlt },
          }}
        >
          {displayCode}
        </CodeHighlighter>
      </ScrollView>

      {isLong ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={[styles.expandBtn, { borderTopColor: divider }]}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={theme.colors.textMuted}
          />
          <Text style={[styles.expandText, { color: theme.colors.textMuted }]}>
            {expanded
              ? 'Show less'
              : `Show ${hiddenCount} more line${hiddenCount === 1 ? '' : 's'}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  langLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'lowercase',
    letterSpacing: 0.5,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  copyText: { fontSize: fontSize.xs, fontWeight: '600' },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandText: { fontSize: fontSize.xs, fontWeight: '600' },
});