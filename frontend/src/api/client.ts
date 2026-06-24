// HTTP client — replaces vscode.postMessage / window.addEventListener('message') transport.
// Every call sends settings in the request body; no server-side session is required.

import type { Settings, ParsedFile, JiraIssueSummary, UploadDraft } from '../types';

const BASE = '/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as T & { error?: string };
  if (!res.ok || json.error) throw new Error((json as { error?: string }).error ?? `Request failed: ${path}`);
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
