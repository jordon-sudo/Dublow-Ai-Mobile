// src/lib/attachments.ts
// Helpers for handling assistant-generated file outputs: detecting images,
// downloading to cache, saving to the device photo library, and surfacing the
// system share sheet (which exposes "Save to Files" on iOS and SAF on Android).

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|heic|heif|bmp)(?:$|\?)/i;
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm)(?:$|\?)/i;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

/**
 * Best-effort content-type probe via HEAD. Returns null if the request fails
 * or the server does not send Content-Type.
 */
async function probeContentType(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type');
    if (!ct) return null;
    return ct.split(';')[0].trim().toLowerCase();
  } catch {
    return null;
  }
}

/** Extract the extension from a filename, sans leading dot. Empty string if none. */
function extFromName(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

/** True if the URL path extension looks like a supported image. */
export function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return IMAGE_EXT_RE.test(url);
}

/** True if the URL path extension looks like a supported video. */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return VIDEO_EXT_RE.test(url);
}

/** Best-effort filename pulled from a URL's path, sans query string. */
export function filenameFromUrl(url: string, fallback = 'file'): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Download a remote URL into the app's cache directory. Returns the local
 * file URI (file:// ...). Filename is derived from the URL path and coerced
 * to a safe basename if needed.
 */
export async function downloadToCache(url: string): Promise<string> {
  const rawName = filenameFromUrl(url, `download-${Date.now()}`);
  const safe = rawName.replace(/[^\w.\-]+/g, '_');

  // If the URL already carries a usable extension, trust it. Otherwise probe
  // the Content-Type header and append the matching extension. MediaLibrary
  // and most share targets reject files without an extension.
  let finalName = safe;
  if (!extFromName(safe)) {
    const mime = await probeContentType(url);
    const mapped = mime ? MIME_TO_EXT[mime] : null;
    // Reasonable default for S3 image URLs that omit Content-Type entirely.
    const ext = mapped ?? 'jpg';
    finalName = `${safe}.${ext}`;
  }

  const dest = `${FileSystem.cacheDirectory}${finalName}`;
  const res = await FileSystem.downloadAsync(url, dest);
  if (res.status >= 400) {
    throw new Error(`Download failed (${res.status})`);
  }
  return res.uri;
}

/**
 * Save a local file URI (images/videos only) to the device photo library.
 * Prompts for permission the first time.
 */
export async function saveToPhotos(localUri: string): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Photo library permission denied.');
  }
  await MediaLibrary.saveToLibraryAsync(localUri);
}

/**
 * Open the system share sheet for a local file URI. On iOS this exposes
 * "Save to Files"; on Android it opens the SAF destination picker.
 */
export async function shareLocalFile(
  localUri: string,
  opts?: { mimeType?: string; dialogTitle?: string; UTI?: string },
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(localUri, {
    mimeType: opts?.mimeType,
    dialogTitle: opts?.dialogTitle ?? 'Share',
    UTI: opts?.UTI,
  });
}

/** Copy a URL string to the clipboard. */
export async function copyLink(url: string): Promise<void> {
  await Clipboard.setStringAsync(url);
}