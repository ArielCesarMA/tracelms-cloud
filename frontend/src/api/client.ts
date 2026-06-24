// HTTP client — replaces vscode.postMessage / window.addEventListener('message') transport.
// Every call sends settings in the request body; no server-side session is required.

import type { Settings, ParsedFile, JiraIssueSummary, UploadDraft } from '../types';

const BASE = '/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Cannot reach the backend server. Make sure it is running on port 3000. (${err instanceof Error ? err.message : String(err)})`);
  }

  const text = await res.text();

  if (!text.trim()) {
    throw new Error(`Backend returned an empty response for ${path}. The server may have crashed — check the backend terminal.`);
  }

  let json: T & { error?: string };
  try {
    json = JSON.parse(text) as T & { error?: string };
  } catch {
    const preview = text.slice(0, 120).replace(/\n/g, ' ');
    throw new Error(`Backend returned non-JSON for ${path}. Got: "${preview}"`);
  }

  if (!res.ok || json.error) {
    throw new Error((json as { error?: string }).error ?? `Request failed (${res.status}): ${path}`);
  }
  return json;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function testLlm(settings: Settings): Promise<{ ok: boolean; message: string }> {
  return post('/settings/test-llm', settings);
}

export async function testJira(settings: Settings): Promise<{ ok: boolean; message: string }> {
  return post('/settings/test-jira', settings);
}

// ── Document parsing ──────────────────────────────────────────────────────────

export async function parseFiles(files: UploadDraft[]): Promise<{ combinedText: string; files: ParsedFile[] }> {
  return post('/parse', { files });
}

// ── Jira ──────────────────────────────────────────────────────────────────────

export async function searchStories(query: string, settings: Settings): Promise<{ stories: JiraIssueSummary[] }> {
  return post('/jira/search', { query, settings });
}

export async function pullFromJira(
  mode: string,
  payload: Record<string, string>,
  settings: Settings
): Promise<{ issues: JiraIssueSummary[]; combinedText: string }> {
  return post('/jira/pull', { mode, payload, settings });
}

// ── SSE streaming client ──────────────────────────────────────────────────────
//
// Wire protocol from the backend streaming routes:
//   data: {"type":"started"}\n\n
//   data: {"type":"chunk","text":"...","chars":N}\n\n
//   data: {"type":"batch","current":K,"total":N}\n\n   (automation only)
//   data: {"type":"done","result":{...}}\n\n
//   data: {"type":"error","message":"..."}\n\n

type SseChunkEvent = { type: 'chunk'; text: string; chars: number };
type SseBatchEvent = { type: 'batch'; current: number; total: number };

export type SseProgressEvent = SseChunkEvent | SseBatchEvent;

// Calls a streaming generate endpoint, fires onProgress for each event, and
// resolves with the final result object from the "done" event.
export async function streamPost<T>(
  path: string,
  body: unknown,
  onProgress?: (event: SseProgressEvent) => void
): Promise<T> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Cannot reach the backend server. Make sure it is running on port 3000. (${err instanceof Error ? err.message : String(err)})`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let errMsg: string | undefined;
    try { errMsg = (JSON.parse(text) as { error?: string }).error; } catch { /* ignore */ }
    throw new Error(errMsg ?? `Request failed (${res.status}): ${path}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Server-Sent Events not supported in this environment.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE events are separated by double-newline
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      for (const line of block.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = JSON.parse(line.slice(6)) as
          | { type: 'started' }
          | SseChunkEvent
          | SseBatchEvent
          | { type: 'done'; result: T }
          | { type: 'error'; message: string };
        if (payload.type === 'chunk' || payload.type === 'batch') {
          onProgress?.(payload);
        } else if (payload.type === 'done') {
          try { reader.cancel(); } catch { /* ignore */ }
          return payload.result;
        } else if (payload.type === 'error') {
          try { reader.cancel(); } catch { /* ignore */ }
          throw new Error(payload.message);
        }
      }
    }
  }

  throw new Error('SSE stream ended without a completion event. The server may have crashed — check the backend terminal.');
}

// ── Generation ────────────────────────────────────────────────────────────────

export async function generateEnhancement(requirements: string, settings: Settings): Promise<{ enhancement: unknown }> {
  return post('/generate/enhancement', { requirements, settings });
}

export async function generateScenarios(requirements: string, enhancement: unknown, settings: Settings): Promise<{ scenarios: unknown }> {
  return post('/generate/scenarios', { requirements, enhancement, settings });
}

export async function generateTestCases(scenarios: unknown[], settings: Settings): Promise<{ testCases: unknown }> {
  return post('/generate/testcases', { scenarios, settings });
}

export async function generateAutomation(
  requirements: string,
  enhancement: unknown,
  scenarios: unknown[],
  testCases: unknown[],
  settings: Settings
): Promise<{ analysis: unknown }> {
  return post('/generate/automation', { requirements, enhancement, scenarios, testCases, settings });
}

// ── Streaming variants ────────────────────────────────────────────────────────

export async function streamEnhancement(
  requirements: string,
  settings: Settings,
  onProgress?: (e: SseProgressEvent) => void
): Promise<{ enhancement: unknown }> {
  return streamPost('/generate/enhancement/stream', { requirements, settings }, onProgress);
}

export async function streamScenarios(
  requirements: string,
  enhancement: unknown,
  settings: Settings,
  onProgress?: (e: SseProgressEvent) => void
): Promise<{ scenarios: unknown }> {
  return streamPost('/generate/scenarios/stream', { requirements, enhancement, settings }, onProgress);
}

export async function streamTestCases(
  scenarios: unknown[],
  settings: Settings,
  onProgress?: (e: SseProgressEvent) => void
): Promise<{ testCases: unknown }> {
  return streamPost('/generate/testcases/stream', { scenarios, settings }, onProgress);
}

export async function streamAutomation(
  requirements: string,
  enhancement: unknown,
  scenarios: unknown[],
  testCases: unknown[],
  settings: Settings,
  onProgress?: (e: SseProgressEvent) => void
): Promise<{ analysis: unknown }> {
  return streamPost('/generate/automation/stream', { requirements, enhancement, scenarios, testCases, settings }, onProgress);
}

// ── Xray ──────────────────────────────────────────────────────────────────────

export async function pushToXray(testCases: unknown[], retryOnlyIds: string[], settings: Settings): Promise<{ pushed: unknown[] }> {
  return post('/xray/push', { testCases, retryOnlyIds, settings });
}

export async function previewXrayPush(testCases: unknown[], settings: Settings): Promise<{ preview: unknown }> {
  return post('/xray/preview', { testCases, settings });
}

export async function clearXrayHistory(): Promise<{ message: string }> {
  return post('/xray/clear-history', {});
}
