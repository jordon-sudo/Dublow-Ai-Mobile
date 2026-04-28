// src/lib/titleGen.ts
import { useSettings } from '../store/settingsStore';

/** Ask Hatz for a 3-6 word title based on the opening exchange. Falls back to truncation. */
export async function generateTitle(userMsg: string, assistantMsg: string): Promise<string> {
  const fallback = userMsg.trim().slice(0, 40) || 'New chat';
  try {
    const client = useSettings.getState().getClient();
    const model = useSettings.getState().selectedModel;
    if (!client || !model) return fallback;

    // Non-streaming one-shot via streamChat with onDone capture.
    let out = '';
    await new Promise<void>((resolve) => {
      client.streamChat(
        {
          model,
          messages: [
            { role: 'system', content: 'You produce concise chat titles. Reply with 3-6 words, no quotes, no trailing punctuation.' },
            { role: 'user', content: `User: ${userMsg}\nAssistant: ${assistantMsg}\n\nTitle:` },
          ],
          auto_tool_selection: false,
          tools_to_use: [],
        },
        {
          onToken: (d) => { out += d; },
          onStatus: () => {},
          onDone: () => resolve(),
          onError: () => resolve(),
        },
      );
    });
    const cleaned = out.replace(/["'`]/g, '').replace(/[.!?]+$/g, '').trim();
    return cleaned.length > 2 && cleaned.length <= 60 ? cleaned : fallback;
  } catch {
    return fallback;
  }
}