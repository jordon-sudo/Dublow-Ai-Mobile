// src/components/JobAttachment.tsx
// Renders a single assistant-generated attachment for a workflow step:
//   - Fetches the presigned URL on mount (the parent only renders this when
//     the step card is already expanded, so this is effectively lazy).
//   - If the URL looks like an image, shows an inline preview.
//     Otherwise, shows a file-tile with icon + filename.
//   - Tap → fullscreen preview (images) or share sheet (non-images).
//   - Long-press → AttachmentActionSheet (Save to Photos / Files / Share / Copy Link).
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, spacing, radii, fontSize } from '../theme';
import { HatzClient } from '../lib/hatzClient';
import AttachmentActionSheet, { type AttachmentAction } from './AttachmentActionSheet';
import ImagePreviewModal from './ImagePreviewModal';
import {
  copyLink,
  downloadToCache,
  filenameFromUrl,
  isImageUrl,
  saveToPhotos,
  shareLocalFile,
} from '../lib/attachments';

interface Props {
  jobId: string;
  stepId: string;
  outputType?: string;
  client: HatzClient | null;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; message: string };

export default function JobAttachment({ jobId, stepId, outputType, client }: Props) {
  const theme = useTheme();

  const [state, setState] = useState<FetchState>({ kind: 'idle' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'photos' | 'files' | 'share'>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!client) {
        setState({ kind: 'error', message: 'Missing API client.' });
        return;
      }
      setState({ kind: 'loading' });
      try {
        const { url } = await client.getWorkflowPresignedUrl(jobId, stepId);
        if (cancelled || !mountedRef.current) return;
        setState({ kind: 'ready', url });
      } catch (e: any) {
        if (cancelled || !mountedRef.current) return;
        setState({ kind: 'error', message: e?.message ?? 'Failed to fetch file URL.' });
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [client, jobId, stepId]);

  // Image detection: output_type hint first, URL extension fallback.
  const url = state.kind === 'ready' ? state.url : null;
  const looksLikeImage =
    outputType === 'image' || (url ? isImageUrl(url) : false);

  const filename = url ? filenameFromUrl(url, 'attachment') : 'Attachment';

  const openTap = async () => {
    if (state.kind !== 'ready') return;
    if (looksLikeImage) {
      setPreviewOpen(true);
    } else {
      // Non-image: tap falls through to Share (surfaces Save to Files on iOS).
      await doShare();
    }
  };

  const openLongPress = () => {
    if (state.kind !== 'ready') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSheetOpen(true);
  };

  const doSaveToPhotos = async () => {
    if (state.kind !== 'ready') return;
    setBusy('photos');
    try {
      const local = await downloadToCache(state.url);
      await saveToPhotos(local);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Saved', 'Saved to Photos.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error.');
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  };

  const doShare = async () => {
    if (state.kind !== 'ready') return;
    setBusy('share');
    try {
      const local = await downloadToCache(state.url);
      await shareLocalFile(local, { dialogTitle: filename });
    } catch (e: any) {
      Alert.alert('Share failed', e?.message ?? 'Unknown error.');
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  };

  const doSaveToFiles = async () => {
    // On iOS the system share sheet exposes "Save to Files".
    // On Android it opens the SAF picker.
    await doShare();
  };

  const doCopyLink = async () => {
    if (state.kind !== 'ready') return;
    try {
      await copyLink(state.url);
      Haptics.selectionAsync().catch(() => {});
    } catch {
      // non-fatal
    }
  };

  const onSheetSelect = async (action: AttachmentAction) => {
    setSheetOpen(false);
    // Small timeout lets the sheet finish its dismiss animation before any
    // subsequent system UI (share sheet, permission prompt, alert) appears.
    await new Promise((r) => setTimeout(r, 150));
    switch (action) {
      case 'saveToPhotos':
        await doSaveToPhotos();
        break;
      case 'saveToFiles':
        await doSaveToFiles();
        break;
      case 'share':
        await doShare();
        break;
      case 'copyLink':
        await doCopyLink();
        break;
    }
  };

  /* ------------------------------ render states ------------------------------ */

  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <View
        style={[
          styles.tile,
          { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
        ]}
      >
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.sm }}>
          Preparing attachment…
        </Text>
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View
        style={[
          styles.tile,
          { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
        ]}
      >
        <Ionicons name="alert-circle-outline" size={20} color={theme.colors.danger} />
        <Text style={{ color: theme.colors.danger, fontSize: fontSize.sm, flex: 1 }}>
          {state.message}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={openTap}
        onLongPress={openLongPress}
        delayLongPress={300}
        style={({ pressed }) => [
          looksLikeImage ? styles.imageWrap : styles.tile,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {looksLikeImage ? (
          <Image
            source={{ uri: state.url }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <>
            <Ionicons
              name="document-outline"
              size={22}
              color={theme.colors.text}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: theme.colors.text, fontSize: fontSize.sm, fontWeight: '600' }}
                numberOfLines={1}
              >
                {filename}
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: fontSize.xs }}>
                Tap to open · Hold for options
              </Text>
            </View>
            {busy === 'share' ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            )}
          </>
        )}
        {looksLikeImage && busy ? (
          <View style={styles.imageBusy}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </Pressable>

      <AttachmentActionSheet
        visible={sheetOpen}
        isImage={looksLikeImage}
        onSelect={onSheetSelect}
        onClose={() => setSheetOpen(false)}
      />

      <ImagePreviewModal
        visible={previewOpen}
        uri={looksLikeImage ? state.url : null}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  imageWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    overflow: 'hidden',
    aspectRatio: 4 / 3,
    width: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});