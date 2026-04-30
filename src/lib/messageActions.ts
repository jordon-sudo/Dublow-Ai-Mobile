// src/lib/messageActions.ts
// Pure helpers for the Copy, Share, and Quote message-level actions.
// No React or store imports here — keep these easy to unit-test and reuse.
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

/**
 * Copy the given text to the system clipboard.
 *
 * Returns true on success, false on failure. We never throw from here —
 * the action sheet uses the boolean to decide whether to show a toast /
 * success haptic or an error alert.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text ?? '');
    return true;
  } catch (e) {
    console.warn('[messageActions] copy failed', e);
    return false;
  }
}

/**
 * Open the system Share sheet with the given text payload. On iOS this
 * surfaces the standard UIActivityViewController; on Android it opens
 * the native chooser. React Native's built-in Share module handles both.
 *
 * Returns true if the user completed a share action, false if they
 * dismissed the sheet or the platform returned an error.
 */
export async function shareText(text: string, title?: string): Promise<boolean> {
  try {
    const result = await Share.share(
      {
        message: text ?? '',
        ...(title ? { title } : {}),
      },
      {
        // iOS-only; ignored on Android. Suppresses the "Print" action,
        // which makes no sense for plain chat text.
        excludedActivityTypes: [
          'com.apple.UIKit.activity.Print',
          'com.apple.UIKit.activity.AssignToContact',
          'com.apple.UIKit.activity.SaveToCameraRoll',
        ],
      },
    );
    // result.action is 'sharedAction', 'dismissedAction' (iOS only), or 'dismissedAction'.
    return result.action === Share.sharedAction;
  } catch (e) {
    console.warn('[messageActions] share failed', e);
    return false;
  }
}

/**
 * Convert an arbitrary string into a markdown blockquote. Preserves
 * paragraph breaks. Used by the "Quote in new chat" action to seed
 * the composer with the referenced message so the user can add their
 * follow-up underneath.
 *
 * A trailing blank line is appended so the user's cursor lands on a
 * clean new paragraph after the quote, which is what they almost
 * always want next.
 *
 *   Input:  "Line one\n\nLine two"
 *   Output: "> Line one\n>\n> Line two\n\n"
 */
export function buildQuoteMarkdown(text: string): string {
  if (!text) return '\n\n';
  const lines = text.split(/\r?\n/);
  const quoted = lines
    .map((line) => (line.length === 0 ? '>' : `> ${line}`))
    .join('\n');
  return `${quoted}\n\n`;
}

/**
 * Small helper for the "Save as Prompt" action. Derives a reasonable
 * prompt title from the first non-empty line of the message, truncated
 * to the given length. The prompt library's createPrompt method expects
 * a non-empty title, so this gives us a sensible default the user can
 * override in the edit screen.
 *
 * We strip markdown fences and inline code so titles don't start with
 * backticks, which look bad in the library list.
 */
export function deriveTitleFromMessage(text: string, maxLen = 60): string {
  if (!text) return 'Untitled prompt';
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? '';
  const cleaned = firstLine
    .replace(/^`+|`+$/g, '')
    .replace(/^#+\s*/, '')
    .replace(/[*_~]+/g, '')
    .trim();
  if (!cleaned) return 'Untitled prompt';
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trimEnd() + '…';
}