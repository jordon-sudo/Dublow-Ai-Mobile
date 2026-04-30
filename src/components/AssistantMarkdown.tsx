// src/components/AssistantMarkdown.tsx
import { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Markdown, { RenderRules, MarkdownProps } from 'react-native-markdown-display';
import { useTheme, spacing, radii, fontSize } from '../theme';
import CodeBlock from './CodeBlock';

interface Props {
  children: string;
  style?: MarkdownProps['style'];
}

function AssistantMarkdownImpl({ children, style }: Props) {
  const theme = useTheme();

  const rules: RenderRules = {
    // Fenced code blocks: ```lang\n...\n```
    fence: (node) => {
      const content = String(node.content ?? '');
      const language = (((node as any).sourceInfo as string) || '').trim();
      return <CodeBlock key={node.key} code={content} language={language} />;
    },

    // Inline code: `foo`
    code_inline: (node, _children, _parent, styles) => (
      <Text
        key={node.key}
        style={[
          styles.code_inline,
          {
            backgroundColor: theme.colors.surfaceAlt,
            color: theme.colors.text,
            borderRadius: 4,
            paddingHorizontal: 5,
            paddingVertical: 1,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            fontSize: fontSize.sm,
          },
        ]}
      >
        {node.content}
      </Text>
    ),

    // Tables
    table: (node, children) => (
      <View
        key={node.key}
        style={[
          localStyles.tableWrap,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
        ]}
      >
        {children}
      </View>
    ),
    thead: (node, children) => (
      <View
        key={node.key}
        style={[localStyles.thead, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
      >
        {children}
      </View>
    ),
    tbody: (node, children) => <View key={node.key}>{children}</View>,
    tr: (node, children) => (
      <View key={node.key} style={[localStyles.tr, { borderColor: theme.colors.border }]}>
        {children}
      </View>
    ),
    th: (node, children) => (
      <View key={node.key} style={[localStyles.cell, { borderColor: theme.colors.border }]}>
        <Text style={[localStyles.thText, { color: theme.colors.text }]}>{children}</Text>
      </View>
    ),
    td: (node, children) => (
      <View key={node.key} style={[localStyles.cell, { borderColor: theme.colors.border }]}>
        <Text style={{ color: theme.colors.text, fontSize: fontSize.sm }}>{children}</Text>
      </View>
    ),
  };

  const mergedStyle = {
    body: {
      color: theme.colors.text,
      fontSize: fontSize.md,
      lineHeight: 26,
    },
    heading1: {
      color: theme.colors.text,
      fontSize: fontSize.xxl,
      fontWeight: '700' as const,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    heading2: {
      color: theme.colors.text,
      fontSize: fontSize.xl,
      fontWeight: '700' as const,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    heading3: {
      color: theme.colors.text,
      fontSize: fontSize.lg,
      fontWeight: '600' as const,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    heading4: { color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' as const },
    heading5: { color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' as const },
    heading6: { color: theme.colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' as const },
    strong: { fontWeight: '700' as const, color: theme.colors.text },
    em: { fontStyle: 'italic' as const, color: theme.colors.text },
    link: { color: theme.colors.primary, textDecorationLine: 'underline' as const },
    blockquote: {
      backgroundColor: theme.colors.surfaceAlt,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginVertical: spacing.sm,
      borderRadius: radii.sm,
    },
    bullet_list: { marginVertical: spacing.xs },
    ordered_list: { marginVertical: spacing.xs },
    list_item: { marginVertical: 2, color: theme.colors.text },
    hr: { backgroundColor: theme.colors.border, height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
    paragraph: { marginTop: 0, marginBottom: spacing.sm },
    ...(style ?? {}),
  } as MarkdownProps['style'];

  return <Markdown rules={rules} style={mergedStyle}>{children}</Markdown>;
}

const localStyles = StyleSheet.create({
  tableWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  thead: { borderBottomWidth: StyleSheet.hairlineWidth },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  thText: { fontSize: fontSize.sm, fontWeight: '700' },
});

export default memo(AssistantMarkdownImpl);