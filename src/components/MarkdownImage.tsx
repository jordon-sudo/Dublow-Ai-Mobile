// src/components/MarkdownImage.tsx
// Inline image renderer for markdown image nodes (![alt](url)).
// Behaviors mirror JobAttachment:
//   - Tap → fullscreen preview.
//   - Long-press → AttachmentActionSheet (Save to Photos / Files / Share / Copy Link).
// Unlike JobAttachment, the URL is known up front, so no presigned-URL fetch.
import { useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, spacing, radii } from '../theme';
import AttachmentActionSheet, { type AttachmentAction } from './AttachmentActionSheet';
import ImagePreviewModal from './ImagePreviewModal';
import {
  copyLink,
  downloadToCache,
  filenameFromUrl,
  saveToPhotos,
  shareLocalFile,
} from '../lib/attachments';

interface Props {
  url: string;
  alt?: string;
}

export default function MarkdownImage({ url, alt }: Props) {
  const theme = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errored, setErrored] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const filename = filenameFromUrl(url, alt || 'image');

  const doSaveToPhotos = async () => {
    setBusy(true);
    try {
      const local = await downloadToCache(url);
      await saveToPhotos(local);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Saved', 'Saved to Photos.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const doShare = async () => {
    setBusy(true);
    try {
      const local = await downloadToCache(url);
      await shareLocalFile(local, { dialogTitle: filename });
    } catch (e: any) {
      Alert.alert('Share failed', e?.message ?? 'Unknown error.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const doCopyLink = async () => {
    try {
      await copyLink(url);
      Haptics.selectionAsync().catch(() => {});
    } catch {
      // non-fatal
    }
  };

  const onSheetSelect = async (action: AttachmentAction) => {
    setSheetOpen(false);
    await new Promise((r) => setTimeout(r, 150));
    switch (action) {
      case 'saveToPhotos':
        await doSaveToPhotos();
        break;
      case 'saveToFiles':
        await doShare();
        break;
      case 'share':
        await doShare();
        break;
      case 'copyLink':
        await doCopyLink();
        break;
    }
  };

  if (errored) {
    return null; // Silently drop broken images rather than render a visual error.
  }

  return (
    <>
      <Pressable
        onPress={() => setPreviewOpen(true)}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          setSheetOpen(true);
        }}
        delayLongPress={300}
        style={({ pressed }) => [
          styles.wrap,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Image
          source={{ uri: url }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setErrored(true)}
          accessibilityLabel={alt}
        />
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </Pressable>

      <AttachmentActionSheet
        visible={sheetOpen}
        isImage
        onSelect={onSheetSelect}
        onClose={() => setSheetOpen(false)}
      />

      <ImagePreviewModal
        visible={previewOpen}
        uri={url}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    overflow: 'hidden',
    aspectRatio: 4 / 3,
    width: '100%',
    marginVertical: spacing.xs,
  },
  image: { width: '100%', height: '100%' },
  busy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});