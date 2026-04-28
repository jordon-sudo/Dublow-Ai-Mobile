// src/lib/hatzClient.ts
// Thin wrapper around the Hatz AI REST API. All network calls live here.
import { fetch as expoFetch } from 'expo/fetch';
import type {
  AppItem,
  WorkflowJob,
  RunWorkflowResponse,
  PresignedUrlResponse,
} from './appsTypes';

const BASE_URL = 'https://ai.hatz.ai/v1';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  provider?: string;
  kind: 'model' | 'agent';
  raw?: any;
}

export interface AppInfo {
  id: string;
  name: string;
  description?: string;
  inputs?: AppInput[];
  raw?: any;
}

export interface AppInput {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface StreamChatRequest {
  model?: string;
  agent_id?: string;
  messages: ChatMessage[];
  tools_to_use?: string[];
  auto_tool_selection?: boolean;
  file_uuids?: string[];
}

export type StreamStatus =
  | { kind: 'thinking'; text?: string }
  | { kind: 'tool'; name?: string; text?: string }
  | { kind: 'summary'; text?: string }
  | { kind: 'writing' };

export type StreamHandlers = {
  onToken: (token: string) => void;
  onStatus?: (status: StreamStatus) => void;
  onDone: () => void;
  onError: (err: Error) => void;
};

export class HatzClient {
  constructor(private apiKey: string) {}

  private headers(extra: Record<string, string> = {}) {
    return {
      'X-API-Key': this.apiKey,
      Accept: 'application/json',
      ...extra,
    };
  }

  // ---------- Models ----------
  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${BASE_URL}/chat/models`, { headers: this.headers() });
    if (!res.ok) throw new Error(`listModels failed: ${res.status}`);
    const data = await res.json();
    const arr: any[] = Array.isArray(data) ? data : data.data ?? data.models ?? [];
    return arr.map((m) => ({
      id: m.name ?? m.id,
      label: m.display_name ?? m.label ?? m.name ?? m.id,
      provider: m.developer ?? m.provider ?? m.owner ?? 'Other',
      kind: 'model' as const,
      raw: m,
    }));
  }

  // ---------- Agents ----------
  async listAgents(): Promise<ModelInfo[]> {
    const res = await fetch(`${BASE_URL}/chat/agents`, { headers: this.headers() });
    if (!res.ok) {
      console.warn(`listAgents failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const arr: any[] = Array.isArray(data) ? data : data.data ?? data.agents ?? [];
    return arr.map((a) => ({
      id: a.id ?? a.agent_id ?? a.name,
      label: a.display_name ?? a.name ?? a.id,
      provider: a.developer ?? a.provider ?? 'My Agents',
      kind: 'agent' as const,
      raw: a,
    }));
  }

  // ---------- Apps (legacy AppInfo shape — keep for existing screens) ----------
  async listApps(): Promise<AppInfo[]> {
    const res = await fetch(`${BASE_URL}/app/list`, { headers: this.headers() });
    if (!res.ok) throw new Error(`listApps failed: ${res.status}`);
    const data = await res.json();
    const arr: any[] = Array.isArray(data) ? data : data.data ?? data.apps ?? [];
    return arr.map((a) => this.normalizeApp(a));
  }

  async getApp(appId: string): Promise<AppInfo | null> {
    const res = await fetch(`${BASE_URL}/app/${appId}`, { headers: this.headers() });
    if (!res.ok) return null;
    const data = await res.json();
    return this.normalizeApp(data);
  }

  private normalizeApp(a: any): AppInfo {
    const inputsRaw: any[] =
      a.inputs ?? a.input_schema ?? a.user_inputs ?? a.variables ?? [];
    const inputs: AppInput[] = inputsRaw
      .map((i: any) => ({
        name: i.variable_name ?? i.name ?? i.key ?? i.id,
        label: i.display_name ?? i.label ?? i.name,
        type: i.variable_type ?? i.type,
        required: i.required ?? false,
        options: i.options ?? i.choices,
        placeholder: i.placeholder ?? i.description,
      }))
      .filter((i: AppInput) => !!i.name);

    return {
      id: a.id ?? a.app_id ?? a.uuid,
      name: a.name ?? a.display_name ?? 'Untitled App',
      description: a.description ?? a.summary,
      inputs,
      raw: a,
    };
  }

  async runApp(opts: {
    appId: string;
    inputs: Record<string, any>;
    model?: string;
    fileUuids?: string[];
  }): Promise<string> {
    const body: Record<string, any> = { inputs: opts.inputs, stream: false };
    if (opts.model) body.model = opts.model;
    if (opts.fileUuids?.length) body.file_uuids = opts.fileUuids;
    const res = await expoFetch(`${BASE_URL}/app/${opts.appId}/query`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`runApp ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return (
      data?.content ??
      data?.message ??
      data?.output ??
      data?.choices?.[0]?.message?.content ??
      JSON.stringify(data, null, 2)
    );
  }

  // ---------- Apps / Workflows (raw AppItem shape — new screens) ----------
  /**
   * List apps and workflows with full schema. Supports server-side name
   * filter and pagination. Returns the raw AppItem union used by the
   * Apps/Workflows tabbed screen.
   */
  async listAppsRaw(opts?: {
    name?: string;
    limit?: number;
    offset?: number;
  }): Promise<AppItem[]> {
    const params = new URLSearchParams();
    if (opts?.name) params.set('name', opts.name);
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    if (opts?.offset != null) params.set('offset', String(opts.offset));
    const qs = params.toString();
    const url = `${BASE_URL}/app/list${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`listAppsRaw failed: ${res.status}`);
    const data = await res.json();
    const arr: any[] = Array.isArray(data) ? data : data.data ?? data.apps ?? [];
    return arr as AppItem[];
  }

  /** Full schema (including user_inputs) for a single app or workflow. */
  async getAppRaw(appId: string): Promise<AppItem> {
    const res = await fetch(`${BASE_URL}/app/${appId}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`getAppRaw ${res.status}`);
    return (await res.json()) as AppItem;
  }

  // ---------- Workflows ----------
  async runWorkflow(
    appId: string,
    inputs: Record<string, unknown>,
    isDraftApp = false,
  ): Promise<RunWorkflowResponse> {
    const res = await expoFetch(`${BASE_URL}/workflows/run`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ app_id: appId, inputs, is_draft_app: isDraftApp }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`runWorkflow ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as RunWorkflowResponse;
  }

  async getJobStatus(jobId: string): Promise<WorkflowJob> {
    const res = await fetch(`${BASE_URL}/workflows/${jobId}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`getJobStatus ${res.status}`);
    return (await res.json()) as WorkflowJob;
  }

  async getWorkflowPresignedUrl(
    jobId: string,
    stepId: string,
    expiresIn = 3600,
  ): Promise<PresignedUrlResponse> {
    const res = await expoFetch(`${BASE_URL}/workflows/presigned-url`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ job_id: jobId, step_id: stepId, expires_in: expiresIn }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`getWorkflowPresignedUrl ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as PresignedUrlResponse;
  }

 // ---------- File upload ----------
  /**
   * Upload a file. Pass scopeType='workflow' and scopeId=<app_id> when
   * uploading for a workflow input. Omit both for the legacy behavior
   * used by the chat composer.
   */
  async uploadFile(
    file: { uri: string; name: string; type: string },
    opts?: { scopeType?: 'workflow' | 'agent' | 'app'; scopeId?: string },
  ): Promise<string> {
    const form = new FormData();
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    if (opts?.scopeType) form.append('scope_type', opts.scopeType);
    if (opts?.scopeId) form.append('scope_id', opts.scopeId);

    const res = await fetch(`${BASE_URL}/files/upload`, {
      method: 'POST',
      headers: this.headers(), // Do NOT set Content-Type; let fetch set the boundary.
      body: form,
    });

    const headerDump: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headerDump[k] = v;
    });
    const text = await res.text();
    console.log('[HatzClient.uploadFile] status', res.status);
    console.log('[HatzClient.uploadFile] headers', headerDump);
    console.log('[HatzClient.uploadFile] body', text);

    if (!res.ok) throw new Error(`uploadFile ${res.status}: ${text.slice(0, 200)}`);

    // Try multiple locations for the UUID, in priority order.
    const locationHdr =
      headerDump['location'] ||
      headerDump['x-file-id'] ||
      headerDump['x-file-uuid'];
    if (locationHdr) {
      const parts = locationHdr.split('/').filter(Boolean);
      return parts[parts.length - 1];
    }
    if (text) {
      try {
        const json = JSON.parse(text);
        const uuid =
          json?.file_uuid ??
          json?.uuid ??
          json?.id ??
          json?.data?.id ??
          json?.data?.file_uuid;
        if (uuid) return uuid;
      } catch {
        /* not JSON */
      }
    }
    throw new Error('uploadFile: could not locate file UUID in response. See console logs.');
  }

  // ---------- Chat streaming ----------
  async streamChat(req: StreamChatRequest, handlers: StreamHandlers): Promise<void> {
    try {
      const body = {
        ...(req.agent_id ? { agent_id: req.agent_id } : { model: req.model }),
        messages: req.messages,
        stream: true,
        ...(req.tools_to_use?.length ? { tools_to_use: req.tools_to_use } : {}),
        ...(typeof req.auto_tool_selection === 'boolean'
          ? { auto_tool_selection: req.auto_tool_selection }
          : {}),
        ...(req.file_uuids?.length ? { file_uuids: req.file_uuids } : {}),
      };

      const res = await expoFetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: this.headers({
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        }),
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`streamChat ${res.status}: ${text.slice(0, 200)}`);
      }

      const reader = (res.body as any).getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let inThinking = false;
      let sawContent = false;

      const handleContent = (msg: string) => {
        let text = msg;
        while (text.length > 0) {
          if (inThinking) {
            const end = text.indexOf('</thinking>');
            if (end === -1) {
              const inner = text.replace(/<[^>]+>/g, '').trim();
              if (inner) handlers.onStatus?.({ kind: 'thinking', text: inner.slice(-120) });
              text = '';
            } else {
              const inner = text.slice(0, end).replace(/<[^>]+>/g, '').trim();
              if (inner) handlers.onStatus?.({ kind: 'thinking', text: inner.slice(-120) });
              text = text.slice(end + '</thinking>'.length);
              inThinking = false;
            }
          } else {
            const start = text.indexOf('<thinking>');
            if (start === -1) {
              if (text.length) {
                if (!sawContent) handlers.onStatus?.({ kind: 'writing' });
                sawContent = true;
                handlers.onToken(text);
              }
              text = '';
            } else {
              const before = text.slice(0, start);
              if (before.length) {
                if (!sawContent) handlers.onStatus?.({ kind: 'writing' });
                sawContent = true;
                handlers.onToken(before);
              }
              text = text.slice(start + '<thinking>'.length);
              inThinking = true;
            }
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const payload = rawLine.trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const evt = JSON.parse(payload);
            const type = evt?.type;
            const msg = typeof evt?.message === 'string' ? evt.message : '';

            if (type === 'content' && msg) {
              handleContent(msg);
              continue;
            }
            if (type === 'thinking') {
              handlers.onStatus?.({ kind: 'thinking', text: msg });
              continue;
            }
            if (type === 'summary') {
              handlers.onStatus?.({ kind: 'summary', text: msg });
              continue;
            }
            if (type === 'tool_call' || type === 'tool' || type === 'tool_use') {
              handlers.onStatus?.({
                kind: 'tool',
                name: evt?.name ?? evt?.tool ?? undefined,
                text: msg,
              });
              continue;
            }

            const delta = evt?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
              if (!sawContent) handlers.onStatus?.({ kind: 'writing' });
              sawContent = true;
              handlers.onToken(delta);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      }

      handlers.onDone();
    } catch (err: any) {
      handlers.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
}