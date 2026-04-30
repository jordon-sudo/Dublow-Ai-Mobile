// src/components/ImagePreviewModal.tsx
// Fullscreen image preview with top-bar actions: Save to Photos, Save to Files, Close.
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  Image,
  ActivityIndicator,
  Text,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useTheme, spacing, fontSize } from '../theme';
import {
  downloadToCache,
  filenameFromUrl,
  saveToPhotos,
  shareLocalFile,
} from '../lib/attachments';

interface Props {
  visible: boolean;
  uri: string | null;
  /** When false, the "Save to Photos" button is hidden (non-image assets). */
  canSaveToPhotos?: boolean;
  onClose: () => void;
}

export default function ImagePreviewModal({
  visible,
  uri,
  canSaveToPhotos = true,
  onClose,
}: Props) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [busy, setBusy] = useState<null | 'photos' | 'files'>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doSaveToPhotos = async () => {
    if (!uri) return;
    setBusy('photos');
    try {
      const local = await downloadToCache(uri);
      await saveToPhotos(local);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Saved', 'Saved to Photos.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error.');
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  };

  const doSaveToFiles = async () => {
    if (!uri) return;
    setBusy('files');
    try {
      const local = await downloadToCache(uri);
      await shareLocalFile(local, { dialogTitle: filenameFromUrl(uri, 'image') });
    } catch (e: any) {
      Alert.alert('Share failed', e?.message ?? 'Unknown error.');
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => {
        setLoading(true);
        setErrored(false);
      }}
    >
      <View style={styles.root}>
        {/* Backdrop: tap anywhere outside the image to dismiss. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
          <View style={styles.topBarRow}>
            {canSaveToPhotos ? (
              <ActionButton
                icon="image-outline"
                busy={busy === 'photos'}
                disabled={!uri || errored || !!busy}
                onPress={doSaveToPhotos}
                label="Photos"
              />
            ) : null}
            <ActionButton
              icon="folder-outline"
              busy={busy === 'files'}
              disabled={!uri || errored || !!busy}
              onPress={doSaveToFiles}
              label="Files"
            />
            <ActionButton icon="close" onPress={onClose} />
          </View>
        </SafeAreaView>

        <View style={styles.imageWrap} pointerEvents="none">
          {uri && !errored ? (
            <Image
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setErrored(true);
              }}
            />
          ) : null}

          {loading && uri && !errored ? (
            <View style={styles.center}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}

          {errored ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={28} color={theme.colors.danger} />
              <Text style={{ color: '#fff', marginTop: spacing.sm, fontSize: fontSize.sm }}>
                Failed to load image.
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------ action button ------------------------------ */

function ActionButton({
  icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.actionBtn,
        { opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Ionicons name={icon} size={20} color="#fff" />
      )}
      {label ? <Text style={styles.actionLabel}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    zIndex: 10,
  },
  topBarRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    minHeight: 36,
  },
  actionLabel: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});