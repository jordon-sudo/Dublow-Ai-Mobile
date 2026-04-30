// src/components/CodeBlock.tsx
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import CodeHighlighter from 'react-native-code-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { useTheme, spacing, radii, fontSize } from '../theme';

const COLLAPSE_THRESHOLD = 20;
const PREVIEW_LINES = 10;

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
  const displayCode = isLong && !expanded
    ? lines.slice(0, PREVIEW_LINES).join('\n')
    : code.replace(/\n$/, '');

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
        { backgroundColor: '#282c34', borderColor: theme.colors.border },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: '#ffffff14' }]}>
        <Text style={styles.langLabel}>{lang}</Text>
        <Pressable onPress={copy} style={styles.copyBtn} hitSlop={8}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? '#4ade80' : '#cbd5e1'}
          />
          <Text style={[styles.copyText, { color: copied ? '#4ade80' : '#cbd5e1' }]}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}
      >
        <CodeHighlighter
          language={lang}
          hljsStyle={atomOneDark}
          textStyle={{
            fontSize: 13,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          }}
          containerStyle={{ backgroundColor: 'transparent', padding: 0 }}
        >
          {displayCode}
        </CodeHighlighter>
      </ScrollView>

      {isLong ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={[styles.expandBtn, { borderTopColor: '#ffffff14' }]}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#cbd5e1"
          />
          <Text style={styles.expandText}>
            {expanded ? 'Show less' : `Show ${hiddenCount} more line${hiddenCount === 1 ? '' : 's'}`}
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
    color: '#94a3b8',
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
  expandText: { color: '#cbd5e1', fontSize: fontSize.xs, fontWeight: '600' },
});