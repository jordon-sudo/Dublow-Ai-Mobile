// src/lib/chatExport.ts
// Export a conversation to markdown or PDF, then hand it to the system share
// sheet. PDF generation goes through expo-print (HTML → OS print engine → PDF).
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Conversation } from '../store/conversationsStore';

/* --------------------------------- markdown -------------------------------- */

export function buildMarkdown(conv: Conversation): string {
  const title = conv.title || 'Untitled chat';
  const created = new Date(conv.createdAt ?? conv.updatedAt ?? Date.now());
  const header =
    `# ${title}\n\n` +
    `*Exported ${new Date().toLocaleString()} · Created ${created.toLocaleString()}*\n\n---\n`;

  const body = conv.messages
    .filter((m) => m.role !== 'system' && !!m.content)
    .map((m) => {
      const who = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : m.role;
      return `## ${who}\n\n${m.content.trim()}\n`;
    })
    .join('\n');

  return `${header}\n${body}`;
}

/* ----------------------------------- html ---------------------------------- */

/** Minimal HTML-escape for text nodes. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

/**
 * Convert a message's markdown-ish content to lightweight HTML. We intentionally
 * do not pull in a full markdown parser here — this is for printed output, and a
 * few targeted transforms (fenced code, inline code, bold, italics, paragraphs)
 * cover ~all real chat content without the dependency cost.
 */
function messageToHtml(content: string): string {
  // 1) Extract fenced code blocks first so their contents are not mangled by
  // the inline transforms below.
  const codeBlocks: string[] = [];
  const withPlaceholders = content.replace(/```([\s\S]*?)```/g, (_m, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(esc(String(code).replace(/^\n/, '').replace(/\n$/, '')));
    return `\u0000CODE${idx}\u0000`;
  });

  // 2) Escape everything that is not a code-block placeholder.
  let out = esc(withPlaceholders);

  // 3) Inline transforms.
  out = out
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // 4) Paragraph split on blank lines; single newlines become <br>.
  out = out
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  // 5) Restore code blocks.
  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => {
    return `<pre><code>${codeBlocks[Number(i)]}</code></pre>`;
  });

  return out;
}

export function buildHtml(conv: Conversation): string {
  const title = esc(conv.title || 'Untitled chat');
  const created = new Date(conv.createdAt ?? conv.updatedAt ?? Date.now()).toLocaleString();
  const exported = new Date().toLocaleString();

  const body = conv.messages
    .filter((m) => m.role !== 'system' && !!m.content)
    .map((m) => {
      const who = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : esc(m.role);
      const klass = m.role === 'user' ? 'user' : 'assistant';
      return `<section class="msg ${klass}"><h2>${who}</h2>${messageToHtml(m.content)}</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #111; line-height: 1.5; padding: 32px; }
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  h2 { font-size: 12pt; margin: 18pt 0 6pt; color: #555; text-transform: uppercase; letter-spacing: 0.6px; }
  .meta { color: #888; font-size: 9pt; margin-bottom: 18pt; }
  .msg { page-break-inside: avoid; margin-bottom: 10pt; }
  .msg.user h2 { color: #0a66c2; }
  .msg.assistant h2 { color: #333; }
  p { margin: 6pt 0; font-size: 11pt; }
  code { background: #f3f3f5; padding: 1pt 4pt; border-radius: 3pt; font-family: Menlo, Consolas, monospace; font-size: 10pt; }
  pre { background: #f3f3f5; padding: 8pt 10pt; border-radius: 6pt; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 12pt 0; }
</style></head>
<body>
  <h1>${title}</h1>
  <div class="meta">Exported ${esc(exported)} · Created ${esc(created)}</div>
  <hr>
  ${body}
</body></html>`;
}

/* --------------------------------- export --------------------------------- */

function safeBaseName(s: string): string {
  return (s || 'chat').replace(/[^\w.\-]+/g, '_').slice(0, 60) || 'chat';
}

export type ExportFormat = 'markdown' | 'pdf';

/** Generate the file and open the share sheet. */
export async function exportConversation(
  conv: Conversation,
  format: ExportFormat,
): Promise<void> {
  const base = safeBaseName(conv.title);

  if (format === 'markdown') {
    const md = buildMarkdown(conv);
    const dest = `${FileSystem.cacheDirectory}${base}.md`;
    await FileSystem.writeAsStringAsync(dest, md, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await shareFile(dest, { mimeType: 'text/markdown', UTI: 'net.daringfireball.markdown' });
    return;
  }

  if (format === 'pdf') {
    const html = buildHtml(conv);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    // expo-print produces a random-named PDF in cache; rename to a friendly name
    // so the share sheet's default filename reflects the chat title.
    const friendly = `${FileSystem.cacheDirectory}${base}.pdf`;
    try {
      // Move; if a prior export with the same name exists, delete it first.
      await FileSystem.deleteAsync(friendly, { idempotent: true });
      await FileSystem.moveAsync({ from: uri, to: friendly });
      await shareFile(friendly, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch {
      // If the rename fails for any reason, fall back to the original uri.
      await shareFile(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    }
    return;
  }
}

async function shareFile(
  uri: string,
  opts: { mimeType: string; UTI?: string },
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, {
    mimeType: opts.mimeType,
    UTI: opts.UTI,
    dialogTitle: 'Export chat',
  });
}