// src/lib/secureBlob.ts
// AES-256-GCM envelope for AsyncStorage blobs. Key lives in SecureStore.
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, hexToBytes, utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils';

const KEY_SLOT = 'hatz_conv_cipher_v1';

async function getOrCreateKey(): Promise<Uint8Array> {
  let hex = await SecureStore.getItemAsync(KEY_SLOT);
  if (!hex) {
    const bytes = await Crypto.getRandomBytesAsync(32);
    hex = bytesToHex(bytes);
    await SecureStore.setItemAsync(KEY_SLOT, hex);
  }
  return hexToBytes(hex);
}

/** Encrypt a JSON-serializable value. Returns base64-ish packed string: "v1.<ivHex>.<ctHex>". */
export async function sealJson(value: unknown): Promise<string> {
  const key = await getOrCreateKey();
  const iv = await Crypto.getRandomBytesAsync(12);
  const plaintext = utf8ToBytes(JSON.stringify(value));
  const ct = gcm(key, iv).encrypt(plaintext);
  return `v1.${bytesToHex(iv)}.${bytesToHex(ct)}`;
}

/** Decrypt; returns null on any failure (treat as empty state). */
export async function openJson<T>(packed: string | null): Promise<T | null> {
  if (!packed) return null;
  try {
    const [ver, ivHex, ctHex] = packed.split('.');
    if (ver !== 'v1' || !ivHex || !ctHex) return null;
    const key = await getOrCreateKey();
    const pt = gcm(key, hexToBytes(ivHex)).decrypt(hexToBytes(ctHex));
    return JSON.parse(bytesToUtf8(pt)) as T;
  } catch (e) {
    console.warn('[secureBlob] decrypt failed', e);
    return null;
  }
}