// app/api-key.tsx
import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../src/store/settingsStore';
import { useTheme, spacing, radii, fontSize } from '../src/theme';

export default function ApiKeyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { apiKey, setApiKey, refreshCatalog } = useSettings();
  const [draft, setDraft] = useState(apiKey ?? '');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      Alert.alert('Empty key', 'Enter a value or use Clear Key to remove.');
      return;
    }
    setSaving(true);
    try {
      await setApiKey(trimmed);
      Alert.alert('Saved', 'API key stored securely.');
    } finally { setSaving(false); }
  };

  const clearKey = () => {
    Alert.alert('Clear API key?', 'You will be signed out of the Hatz API.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        await setApiKey(null);
        setDraft('');
      }},
    ]);
  };

  const testConnection = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setTesting(true);
    try {
      const res = await fetch('https://ai.hatz.ai/v1/chat/models', {
        headers: { 'X-API-Key': trimmed },
      });
      if (res.ok) {
        Alert.alert('Success', 'API key is valid.');
      } else {
        Alert.alert('Failed', `Server responded ${res.status}.`);
      }
    } catch (e: any) {
      Alert.alert('Network error', e?.message ?? 'Unknown error');
    } finally { setTesting(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]} edges={['bottom']}>
      <Stack.Screen
  options={{
    headerShown: true,
    title: 'API Key',
    headerStyle: { backgroundColor: theme.colors.surface },
    headerTitleStyle: { color: theme.colors.text },
    headerTintColor: theme.colors.text,
    headerLeft: () => (
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={{ paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' }}
      >
        <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontSize: fontSize.md, marginLeft: 2 }}>Back</Text>
      </Pressable>
    ),
  }}
/>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.sm }}>
          Your Hatz AI key is stored in the device secure store. It is sent with every API request as the X-API-Key header.
        </Text>

        <View>
          <Text style={[styles.label, { color: theme.colors.text }]}>Key</Text>
          <View style={[styles.inputRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <TextInput
              style={{ flex: 1, color: theme.colors.text, fontSize: fontSize.md }}
              value={draft}
              onChangeText={setDraft}
              placeholder="sk-..."
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!reveal}
            />
            <Pressable onPress={() => setReveal((v) => !v)} hitSlop={8}>
              <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <Pressable onPress={save} disabled={saving} style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]}>
          {saving ? (
            <ActivityIndicator color={theme.colors.primaryText} />
          ) : (
            <>
              <Ionicons name="save-outline" size={16} color={theme.colors.primaryText} />
              <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>Save Key</Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={testConnection} disabled={testing || !draft.trim()} style={[styles.secondaryBtn, { borderColor: theme.colors.border }]}>
          {testing ? (
            <ActivityIndicator color={theme.colors.text} />
          ) : (
            <>
              <Ionicons name="pulse-outline" size={16} color={theme.colors.text} />
              <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Test Connection</Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={refreshCatalog} style={[styles.secondaryBtn, { borderColor: theme.colors.border }]}>
          <Ionicons name="refresh-outline" size={16} color={theme.colors.text} />
          <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>Refresh Models, Agents, Apps</Text>
        </Pressable>

        {apiKey ? (
          <Pressable onPress={clearKey} style={[styles.dangerBtn, { borderColor: theme.colors.border }]}>
            <Ionicons name="trash-outline" size={16} color="#ff6b6b" />
            <Text style={[styles.dangerBtnText, { color: '#ff6b6b' }]}>Clear Key</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  label: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radii.pill,
  },
  primaryBtnText: { fontSize: fontSize.md, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryBtnText: { fontSize: fontSize.md, fontWeight: '600' },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth, marginTop: spacing.lg,
  },
  dangerBtnText: { fontSize: fontSize.md, fontWeight: '700' },
});