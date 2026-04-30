// app/settings.tsx
import { useState } from 'react';
import Constants from 'expo-constants';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Switch, Modal, Linking, Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSettings } from '../src/store/settingsStore';
import { usePrompts } from '../src/store/promptsStore';
import { useTheme, spacing, radii, fontSize } from '../src/theme';
import { groupedTools, ToolDef } from '../src/lib/tools';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    apiKey,
    systemPrompt, setSystemPrompt,
    defaultTools, setDefaultTools,
    defaultAutoTools, setDefaultAutoTools,
  } = useSettings();

  const exportPromptsJSON = usePrompts((s) => s.exportJSON);
  const importPromptsJSON = usePrompts((s) => s.importJSON);

  const [promptDraft, setPromptDraft] = useState(systemPrompt);
  const [toolsOpen, setToolsOpen] = useState(false);

  const savePrompt = () => setSystemPrompt(promptDraft);

  const toggleDefaultTool = (id: string) => {
    const next = defaultTools.includes(id)
      ? defaultTools.filter((t) => t !== id)
      : [...defaultTools, id];
    setDefaultTools(next);
  };

  const onManagePrompts = () => {
    router.push('/prompts');
  };

  const onExportPrompts = async () => {
    try {
      const json = exportPromptsJSON();
      const filename = `hatz-prompts-${new Date().toISOString().slice(0, 10)}.json`;
      const uri = (FileSystem.cacheDirectory ?? FileSystem.documentDirectory) + filename;
      await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Prompt Library',
          UTI: 'public.json',
        });
      } else {
        Alert.alert('Exported', `Saved to ${uri}`);
      }
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Unknown error');
    }
  };

  const onImportPrompts = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });

      Alert.alert(
        'Import prompts',
        'Merge with existing library, or replace it entirely?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Merge',
            onPress: () => {
              try {
                const result = importPromptsJSON(raw, 'merge');
                Alert.alert('Imported', `${result.prompts} prompt(s) merged into ${result.folders} folder(s).`);
              } catch (e: any) {
                Alert.alert('Import failed', e?.message ?? 'Invalid file');
              }
            },
          },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Replace library?',
                'This will erase your current prompts. Personal and Dublow default folders are preserved.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Replace',
                    style: 'destructive',
                    onPress: () => {
                      try {
                        const result = importPromptsJSON(raw, 'replace');
                        Alert.alert('Imported', `${result.prompts} prompt(s) loaded into ${result.folders} folder(s).`);
                      } catch (e: any) {
                        Alert.alert('Import failed', e?.message ?? 'Invalid file');
                      }
                    },
                  },
                ],
              );
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Unknown error');
    }
  };

  const appVersion = Constants.expoConfig?.version ?? '—';
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    '—';

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor: theme.colors.bg,
          marginTop: 0,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: 'hidden',
        },
      ]}
      edges={['bottom']}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Settings',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTitleStyle: { color: theme.colors.text },
          headerTintColor: theme.colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10} style={{ paddingHorizontal: 8 }}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>

        <Section title="Account" theme={theme}>
          <Pressable
            onPress={() => router.push('/api-key')}
            style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <Ionicons name="key-outline" size={18} color={theme.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                API Key Management
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>
                {apiKey ? `•••• ${apiKey.slice(-6)}` : 'Not configured'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        </Section>

        <Section title="System Prompt" theme={theme}
          caption="Prepended to every new conversation. Leave blank to disable.">
          <TextInput
            style={[styles.textarea, {
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            }]}
            value={promptDraft}
            onChangeText={setPromptDraft}
            onBlur={savePrompt}
            multiline
            placeholder="e.g. You are a concise, senior technical assistant…"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Pressable onPress={savePrompt} style={[styles.secondaryBtn, { borderColor: theme.colors.border, marginTop: spacing.sm }]}>
            <Ionicons name="save-outline" size={16} color={theme.colors.text} />
            <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Save Prompt</Text>
          </Pressable>
        </Section>

        <Section title="Prompt Library" theme={theme}
          caption="Reusable prompts organized into folders. Tap a prompt in the library to send it to your composer.">
          <Pressable
            onPress={onManagePrompts}
            style={[styles.row, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
          >
            <Ionicons name="bookmarks-outline" size={18} color={theme.colors.primaryText} />
            <Text style={{ flex: 1, color: theme.colors.primaryText, fontSize: fontSize.md, fontWeight: '700' }}>
              Manage Prompts
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.primaryText} />
          </Pressable>

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable
              onPress={onImportPrompts}
              style={[styles.secondaryBtn, { borderColor: theme.colors.border, flex: 1 }]}
            >
              <Ionicons name="download-outline" size={16} color={theme.colors.text} />
              <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Import JSON</Text>
            </Pressable>
            <Pressable
              onPress={onExportPrompts}
              style={[styles.secondaryBtn, { borderColor: theme.colors.border, flex: 1 }]}
            >
              <Ionicons name="share-outline" size={16} color={theme.colors.text} />
              <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Export JSON</Text>
            </Pressable>
          </View>
        </Section>

        <Section title="Tool Defaults" theme={theme}
          caption="Applied to new chats. You can override per-chat.">
          <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Ionicons name="flash-outline" size={18} color={theme.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                Default Auto Tools
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>
                Let the model choose tools automatically.
              </Text>
            </View>
            <Switch
              value={defaultAutoTools}
              onValueChange={setDefaultAutoTools}
              trackColor={{ true: theme.colors.primary, false: theme.colors.surfaceAlt }}
            />
          </View>

          <Pressable
            onPress={() => setToolsOpen(true)}
            style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, marginTop: spacing.sm }]}
          >
            <Ionicons name="construct-outline" size={18} color={theme.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                Default Tools
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>
                {defaultTools.length === 0 ? 'None selected' : `${defaultTools.length} selected`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        </Section>

        <Section title="About" theme={theme}>
          <InfoRow label="App Version" value={appVersion} theme={theme} />
          <InfoRow label="Build" value={buildNumber} theme={theme} />
          <Pressable
            onPress={() => Linking.openURL('https://docs.hatz.ai/')}
            style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, marginTop: spacing.sm }]}
          >
            <Ionicons name="document-text-outline" size={18} color={theme.colors.textMuted} />
            <Text style={{ flex: 1, color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
              Hatz Documentation
            </Text>
            <Ionicons name="open-outline" size={18} color={theme.colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL('https://dublow.hatz.ai/')}
            style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, marginTop: spacing.sm }]}
          >
            <Ionicons name="globe-outline" size={18} color={theme.colors.textMuted} />
            <Text style={{ flex: 1, color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
              Dublow Digital
            </Text>
            <Ionicons name="open-outline" size={18} color={theme.colors.textMuted} />
          </Pressable>
        </Section>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* Default tools picker modal */}
      <Modal visible={toolsOpen} transparent animationType="slide" onRequestClose={() => setToolsOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setToolsOpen(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.modalHandle, { backgroundColor: theme.colors.border }]} />
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Default Tools</Text>
            <ScrollView style={{ maxHeight: 520 }}>
              {groupedTools().map(({ category, tools }) => (
                <View key={category} style={{ marginBottom: spacing.md }}>
                  <Text style={[styles.groupHeader, { color: theme.colors.textMuted }]}>{category}</Text>
                  {tools.map((t: ToolDef) => {
                    const on = defaultTools.includes(t.id);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => toggleDefaultTool(t.id)}
                        style={[styles.toolRow, {
                          backgroundColor: on ? theme.colors.primarySoft : 'transparent',
                          borderColor: theme.colors.border,
                        }]}
                      >
                        <Ionicons
                          name={(t.icon as any) ?? 'construct-outline'}
                          size={18}
                          color={on ? theme.colors.primary : theme.colors.textMuted}
                          style={{ marginRight: spacing.sm }}
                        />
                        <Text style={{ flex: 1, color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
                          {t.label}
                        </Text>
                        {on ? <Ionicons name="checkmark" size={18} color={theme.colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setToolsOpen(false)}
              style={[styles.primaryBtn, { backgroundColor: theme.colors.primary, alignSelf: 'center', marginTop: spacing.sm }]}
            >
              <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, caption, theme, children }: any) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{
        color: theme.colors.textMuted, fontSize: fontSize.xs, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 1,
      }}>
        {title}
      </Text>
      {caption ? (
        <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.xs }}>
          {caption}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function InfoRow({ label, value, theme }: any) {
  return (
    <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={{ flex: 1, color: theme.colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.sm }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textarea: {
    minHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  primaryBtnText: { fontSize: fontSize.md, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryBtnText: { fontSize: fontSize.md, fontWeight: '600' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.md },
  groupHeader: {
    fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: spacing.xs, paddingHorizontal: spacing.xs,
  },
  toolRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth,
  },
});