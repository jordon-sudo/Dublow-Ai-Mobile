// src/components/AppInputForm.tsx
// Dynamic form driven by an app/workflow's user_inputs schema.
// Renders one field per input, one renderer per variable_type.
// Owns the values map and reports changes via onChange.
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radii, fontSize } from '../theme';
import type { UserInput } from '../lib/appsTypes';
import { useSettings } from '../store/settingsStore';
import { HatzClient } from '../lib/hatzClient';

export type InputValues = Record<string, string>;

export interface AppInputFormProps {
  inputs: UserInput[];
  values: InputValues;
  onChange: (next: InputValues) => void;
  /** Required for file_upload fields so uploads can be scoped correctly. */
  scopeAppId: string;
  /** Hide fields the user shouldn't edit. Defaults to none. */
  hidden?: Set<string>;
}

export default function AppInputForm({
  inputs,
  values,
  onChange,
  scopeAppId,
  hidden,
}: AppInputFormProps) {
  const ordered = useMemo(
    () =>
      [...inputs]
        .filter((i) => !hidden?.has(i.variable_name))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [inputs, hidden],
  );

  const set = (name: string, v: string) => onChange({ ...values, [name]: v });

  return (
    <View style={{ gap: spacing.md }}>
      {ordered.map((input) => (
        <FieldRow key={input.variable_name} input={input}>
          <FieldRenderer
            input={input}
            value={values[input.variable_name] ?? ''}
            onChange={(v) => set(input.variable_name, v)}
            scopeAppId={scopeAppId}
          />
        </FieldRow>
      ))}
    </View>
  );
}

/* ----------------------------- label wrapper ----------------------------- */

function FieldRow({
  input,
  children,
}: {
  input: UserInput;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const label = input.display_name || input.variable_name;
  return (
    <View>
      <Text style={[styles.label, { color: theme.colors.text }]}>
        {label}
        {input.required ? <Text style={{ color: '#e11d48' }}> *</Text> : null}
      </Text>
      {input.description ? (
        <Text style={[styles.desc, { color: theme.colors.textMuted }]}>
          {input.description}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/* --------------------------- per-type renderers -------------------------- */

function FieldRenderer({
  input,
  value,
  onChange,
  scopeAppId,
}: {
  input: UserInput;
  value: string;
  onChange: (v: string) => void;
  scopeAppId: string;
}) {
  switch (input.variable_type) {
    case 'paragraph':
      return <ParagraphField value={value} onChange={onChange} placeholder={input.description} />;
    // dropdown / multiple_choice render as plain single-line text inputs:
    // the Hatz AppUserInputResponse schema does not expose an options array,
    // so a modal picker would always be empty.
    case 'multiple_choice':
    case 'dropdown':
      return <ShortField value={value} onChange={onChange} placeholder={input.description} />;
    case 'file_upload':
      return <FileField value={value} onChange={onChange} scopeAppId={scopeAppId} />;
    case 'url':
      return (
        <ShortField
          value={value}
          onChange={onChange}
          placeholder="https://…"
          keyboardType="url"
          autoCapitalize="none"
        />
      );
    case 'short_answer':
    default:
      return <ShortField value={value} onChange={onChange} placeholder={input.description} />;
  }
}

function ShortField({
  value,
  onChange,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'url' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
}) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textMuted}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      style={[
        styles.input,
        { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    />
  );
}

function ParagraphField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textMuted}
      multiline
      textAlignVertical="top"
      style={[
        styles.input,
        styles.paragraph,
        { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    />
  );
}

function FileField({
  value,
  onChange,
  scopeAppId,
}: {
  value: string;
  onChange: (v: string) => void;
  scopeAppId: string;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const pick = async () => {
    try {
      setBusy(true);
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      const apiKey = useSettings.getState().apiKey;
      if (!apiKey) throw new Error('No API key configured.');
      const client = new HatzClient(apiKey);

      const uuid = await client.uploadFile(
        {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
        },
        { scopeType: 'workflow', scopeId: scopeAppId },
      );
      onChange(uuid);
      setName(asset.name);
    } catch (e: any) {
      console.warn('[AppInputForm] file upload failed', e?.message || e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={pick}
      disabled={busy}
      style={[styles.input, styles.choice, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      {busy ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={{ color: value ? theme.colors.text : theme.colors.textMuted }} numberOfLines={1}>
            {value ? name ?? 'File attached' : 'Choose a file…'}
          </Text>
          <Ionicons name={value ? 'checkmark-circle' : 'cloud-upload-outline'} size={18} color={theme.colors.textMuted} />
        </>
      )}
    </Pressable>
  );
}

/* --------------------------------- styles -------------------------------- */

const styles = StyleSheet.create({
  label: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: 4 },
  desc: { fontSize: fontSize.xs, marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
  paragraph: { minHeight: 120 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});