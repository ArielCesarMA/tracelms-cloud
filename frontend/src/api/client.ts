// HTTP client — replaces vscode.postMessage / window.addEventListener('message') transport.
// Every call sends settings in the request body; no server-side session is required.

import type { Settings, ParsedFile, JiraIssueSummary, UploadDraft, ExtractedRequirement, Project, ProjectMember, GenerationHistoryItem, AuthUser, OrgRole, TokenUsage, ModelScore } from '../types';

const BASE = '/api';

const TOKEN_KEY = 'tracelms-token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(path: string): Promise<T> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: 'GET', headers: authHeaders() });
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

  if (res.status === 401) {
    clearAuthToken();
    window.location.reload();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok || json.error) {
    throw new Error((json as { error?: string }).error ?? `Request failed (${res.status}): ${path}`);
  }
  return json;
}

async function del<T>(path: string): Promise<T> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() });
  } catch (err) {
    throw new Error(`Cannot reach the backend server. Make sure it is running on port 3000. (${err instanceof Error ? err.message : String(err)})`);
  }
  const text = await res.text();
  if (!text.trim()) throw new Error(`Backend returned an empty response for ${path}.`);
  let json: T & { error?: string };
  try { json = JSON.parse(text) as T & { error?: string }; } catch {
    throw new Error(`Backend returned non-JSON for ${path}.`);
  }
  if (res.status === 401) { clearAuthToken(); window.location.reload(); throw new Error('Session expired.'); }
  if (!res.ok || json.error) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status}): ${path}`);
  return json;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Cannot reach the backend server. Make sure it is running on port 3000. (${err instanceof Error ? err.message : String(err)})`);
  }
  const text = await res.text();
  if (!text.trim()) throw new Error(`Backend returned an empty response for ${path}.`);
  let json: T & { error?: string };
  try { json = JSON.parse(text) as T & { error?: string }; } catch {
    throw new Error(`Backend returned non-JSON for ${path}.`);
  }
  if (res.status === 401) { clearAuthToken(); window.location.reload(); throw new Error('Session expired.'); }
  if (!res.ok || json.error) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status}): ${path}`);
  return json;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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

  if (res.status === 401) {
    clearAuthToken();
    window.location.reload();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok || json.error) {
    throw new Error((json as { error?: string }).error ?? `Request failed (${res.status}): ${path}`);
  }
  return json;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Cannot reach the backend server. Make sure it is running on port 3000. (${err instanceof Error ? err.message : String(err)})`);
  }
  const text = await res.text();
  if (!text.trim()) throw new Error(`Backend returned an empty response for ${path}.`);
  let json: T & { error?: string };
  try { json = JSON.parse(text) as T & { error?: string }; } catch {
    throw new Error(`Backend returned non-JSON for ${path}.`);
  }
  if (res.status === 401) { clearAuthToken(); window.location.reload(); throw new Error('Session expired.'); }
  if (!res.ok || json.error) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status}): ${path}`);
  return json;
}

// Re-export for convenience
export type { Project, ProjectMember, GenerationHistoryItem, AuthUser };

// ── Public stats (login page — no auth required) ──────────────────────────────

export type PublicTestimonial = {
  id: string;
  companyName: string;
  logoUrl: string;
  quote: string;
  authorName: string;
  authorTitle: string;
};

export async function getPublicStats(): Promise<{ generationsCount: number; testimonials: PublicTestimonial[] }> {
  try {
    const res = await fetch('/api/stats', { method: 'GET' });
    if (!res.ok) return { generationsCount: 0, testimonials: [] };
    return res.json() as Promise<{ generationsCount: number; testimonials: PublicTestimonial[] }>;
  } catch {
    return { generationsCount: 0, testimonials: [] };
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<{ token: string; expiresAt: string | null }> {
  // login is a public route — bypass post() which adds the auth header
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new Error(`Cannot reach the backend server. (${err instanceof Error ? err.message : String(err)})`);
  }
  const text = await res.text();
  let json: { token?: string; expiresAt?: string | null; error?: string };
  try { json = JSON.parse(text) as typeof json; } catch { throw new Error('Unexpected response from server.'); }
  if (!res.ok || json.error) throw new Error(json.error ?? `Login failed (${res.status})`);
  return { token: json.token!, expiresAt: json.expiresAt ?? null };
}

export async function register(email: string, password: string): Promise<{ userId: string; email: string }> {
  return post('/auth/register', { email, password });
}

export async function fetchMe(): Promise<{ user: AuthUser }> {
  return get('/auth/me');
}

// ── User management (Owner/Admin) ─────────────────────────────────────────────

export async function fetchUsers(): Promise<{ users: AuthUser[] }> {
  return get('/users');
}

export async function updateUserRole(userId: string, role: OrgRole): Promise<{ user: AuthUser }> {
  return patch(`/users/${userId}/role`, { role });
}

export async function updateUserStatus(userId: string, isActive: boolean): Promise<{ user: AuthUser }> {
  return patch(`/users/${userId}/status`, { isActive });
}

export async function inviteUser(email: string, role: OrgRole, temporaryPassword: string): Promise<{ user: AuthUser }> {
  return post('/users/invite', { email, role, temporaryPassword });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function testLlm(settings: Settings): Promise<{ ok: boolean; message: string }> {
  return post('/settings/test-llm', settings);
}

export async function testJira(settings: Settings): Promise<{ ok: boolean; message: string }> {
  return post('/settings/test-jira', settings);
}

// ── Document parsing ──────────────────────────────────────────────────────────

export async function parseFiles(files: UploadDraft[]): Promise<{ combinedText: string; files: ParsedFile[]; warnings?: string[] }> {
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

type SseChunkEvent     = { type: 'chunk'; text: string; chars: number };
type SseBatchEvent     = { type: 'batch'; current: number; total: number };
export type SseModelInfoEvent = { type: 'model-info'; isReasoning: boolean };

export type SseProgressEvent = SseChunkEvent | SseBatchEvent | SseModelInfoEvent;

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
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
          | SseModelInfoEvent
          | { type: 'done'; result: T }
          | { type: 'error'; message: string };
        if (payload.type === 'chunk' || payload.type === 'batch' || payload.type === 'model-info') {
          onProgress?.(payload);
        } else if (payload.type === 'done') {
          const donePayload = payload as { type: 'done'; result: T; usage?: TokenUsage };
          try { reader.cancel(); } catch { /* ignore */ }
          return { ...donePayload.result, usage: donePayload.usage };
        } else if (payload.type === 'error') {
          try { reader.cancel(); } catch { /* ignore */ }
          throw new Error(payload.message);
        }
      }
    }
  }

  throw new Error('SSE stream ended without a completion event. The server may have crashed — check the backend terminal.');
}

// ── Requirement extraction (SSE row stream) ───────────────────────────────────

export async function streamExtractRequirements(
  rawText: string,
  settings: Settings,
  onRow: (row: ExtractedRequirement) => void
): Promise<{ total: number }> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}/generate/extract-requirements/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, settings }),
    });
  } catch (err) {
    throw new Error(`Cannot reach the backend server. Make sure it is running on port 3000. (${err instanceof Error ? err.message : String(err)})`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let errMsg: string | undefined;
    try { errMsg = (JSON.parse(text) as { error?: string }).error; } catch { /* ignore */ }
    throw new Error(errMsg ?? `Request failed (${res.status}): extract-requirements/stream`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Server-Sent Events not supported in this environment.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      for (const line of block.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = JSON.parse(line.slice(6)) as
          | { type: 'started' }
          | { type: 'row'; row: ExtractedRequirement }
          | { type: 'done'; total: number }
          | { type: 'error'; message: string };
        if (payload.type === 'row') {
          onRow(payload.row);
        } else if (payload.type === 'done') {
          try { reader.cancel(); } catch { /* ignore */ }
          return { total: payload.total };
        } else if (payload.type === 'error') {
          try { reader.cancel(); } catch { /* ignore */ }
          throw new Error(payload.message);
        }
      }
    }
  }
  return { total: 0 };
}

// ── Vision image extraction ───────────────────────────────────────────────────

export async function extractImageRequirements(
  imageBase64: string,
  mimeType: string,
  settings: Settings
): Promise<ExtractedRequirement[]> {
  const data = await post<{ requirements: ExtractedRequirement[] }>(
    '/generate/extract-image-requirements',
    { imageBase64, mimeType, settings }
  );
  return data.requirements ?? [];
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

export async function streamNfrEnrichment(
  requirements: ExtractedRequirement[],
  settings: Settings,
  onProgress?: (e: SseProgressEvent) => void,
): Promise<{ requirements: ExtractedRequirement[]; usage?: TokenUsage }> {
  return streamPost('/generate/enrich-nfr/stream', { requirements, settings }, onProgress);
}

export async function streamEnhancement(
  requirements: string,
  settings: Settings,
  onProgress?: (e: SseProgressEvent) => void,
  projectId?: string | null,
): Promise<{ enhancement: unknown; usage?: TokenUsage }> {
  return streamPost('/generate/enhancement/stream', { requirements, settings, projectId }, onProgress);
}

export async function streamScenarios(
  requirements: string,
  enhancement: unknown,
  settings: Settings,
  onProgress?: (e: SseProgressEvent) => void,
  projectId?: string | null,
): Promise<{ scenarios: unknown; usage?: TokenUsage }> {
  return streamPost('/generate/scenarios/stream', { requirements, enhancement, settings, projectId }, onProgress);
}

export async function streamTestCases(
  scenarios: unknown[],
  settings: Settings,
  onProgress?: (e: SseProgressEvent) => void,
  projectId?: string | null,
): Promise<{ testCases: unknown; usage?: TokenUsage }> {
  return streamPost('/generate/testcases/stream', { scenarios, settings, projectId }, onProgress);
}

export async function streamAutomation(
  requirements: string,
  enhancement: unknown,
  scenarios: unknown[],
  testCases: unknown[],
  settings: Settings,
  onProgress?: (e: SseProgressEvent) => void,
  projectId?: string | null,
): Promise<{ analysis: unknown; usage?: TokenUsage }> {
  return streamPost('/generate/automation/stream', { requirements, enhancement, scenarios, testCases, settings, projectId }, onProgress);
}

// ── Generation record ─────────────────────────────────────────────────────────

export type SaveGenerationPayload = {
  requirementText: string;
  llmProvider: string;
  llmModel: string;
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL';
  enhancement: unknown;
  scenarios: unknown[] | null;
  testCases: unknown[] | null;
  automation: unknown;
  projectId?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export async function saveGeneration(payload: SaveGenerationPayload): Promise<{ id: string }> {
  return post('/generation', payload);
}

export async function linkGenerationToProject(generationId: string, projectId: string): Promise<{ ok: boolean }> {
  return patch(`/generation/${encodeURIComponent(generationId)}/project`, { projectId });
}

export type LatestGenerationRecord = {
  id: string;
  requirementText: string;
  llmProvider: string;
  llmModel: string;
  status: string;
  enhancement: unknown;
  scenarios: unknown;
  testCases: unknown;
  automation: unknown;
  totalTestCases: number;
  totalScenarios: number;
  createdAt: string;
};

export async function fetchLatestGeneration(): Promise<{ generation: LatestGenerationRecord | null }> {
  return get('/generation/latest');
}

export async function fetchGenerationHistory(projectId?: string): Promise<{ generations: GenerationHistoryItem[] }> {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return get(`/generation/history${qs}`);
}

export async function fetchGeneration(id: string): Promise<{ generation: LatestGenerationRecord }> {
  return get(`/generation/${id}`);
}

export async function deleteGeneration(id: string): Promise<{ ok: boolean }> {
  return del(`/generation/${id}`);
}

export async function patchGenerationTestCases(
  generationId: string,
  testCases: import('../types').TestCaseItem[],
): Promise<{ ok: boolean }> {
  return patch(`/generation/${generationId}/testcases`, { testCases });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<{ projects: Project[] }> {
  return get('/projects');
}

export async function fetchProject(id: string): Promise<{ project: Project }> {
  return get(`/projects/${id}`);
}

export async function createProject(data: { name: string; key: string; description?: string }): Promise<{ project: Project }> {
  return post('/projects', data);
}

export async function updateProject(id: string, data: {
  name?: string; description?: string; status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'; jiraProjectKey?: string;
}): Promise<{ project: Project }> {
  return patch(`/projects/${id}`, data);
}

export async function archiveProject(id: string): Promise<{ ok: boolean }> {
  return del(`/projects/${id}`);
}

export async function fetchApprovalLayers(projectId: string): Promise<{ layers: import('../types').ApprovalLayer[] }> {
  return get(`/projects/${projectId}/approval-layers`);
}

export async function saveApprovalLayers(
  projectId: string,
  layers: import('../types').ApprovalLayer[]
): Promise<{ layers: import('../types').ApprovalLayer[] }> {
  return put(`/projects/${projectId}/approval-layers`, { layers });
}

export async function addStakeholder(projectId: string, data: { email: string; name?: string; role?: string }): Promise<{ stakeholder: ProjectMember; member: ProjectMember }> {
  return post(`/projects/${projectId}/stakeholders`, data);
}

export async function removeStakeholder(projectId: string, stakeholderId: string): Promise<{ ok: boolean }> {
  return del(`/projects/${projectId}/stakeholders/${stakeholderId}`);
}

// ── Prompt Templates ──────────────────────────────────────────────────────────

export async function fetchPrompts(projectId?: string | null): Promise<{ templates: import('../types').PromptTemplate[] }> {
  return get(projectId ? `/prompts?projectId=${encodeURIComponent(projectId)}` : '/prompts');
}

export async function updatePrompt(id: string, content: string, projectId?: string | null): Promise<{ template: import('../types').PromptTemplate }> {
  return put(`/prompts/${id}`, { content, ...(projectId ? { projectId } : {}) });
}

export async function resetPrompt(id: string): Promise<{ template: import('../types').PromptTemplate }> {
  return post(`/prompts/reset/${id}`, {});
}

export async function fetchModelScores(): Promise<{ scores: ModelScore[] }> {
  return get('/analytics/model-scores');
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

// ── Document Generation Hub ───────────────────────────────────────────────────

export type TestPlanDocument = import('../types').TestPlanDocument;
export type TestStrategyDocument = import('../types').TestStrategyDocument;
export type GeneratedDocument = import('../types').GeneratedDocument;
export type GeneratedDocuments = import('../types').GeneratedDocuments;
export type DocumentType = import('../types').DocumentType;

export type DocGenProgressEvent =
  | { event: 'status'; data: { message: string } }
  | { event: 'chunk'; data: { text: string } }
  | { event: 'model-info'; data: { isReasoning: boolean } }
  | { event: 'done'; data: { document: GeneratedDocument | null; documentType: DocumentType } }
  | { event: 'error'; data: { message: string } };

export async function streamGenerateDocument(
  generationId: string,
  projectName: string,
  documentType: DocumentType,
  settings: Pick<Settings, 'llmProvider' | 'llmModel' | 'llmApiKey'>,
  onEvent: (e: DocGenProgressEvent) => void,
): Promise<GeneratedDocument | null> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${BASE}/documents/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ generationId, projectName, documentType, settings }),
    });
  } catch (err) {
    throw new Error(`Cannot reach the backend server. (${err instanceof Error ? err.message : String(err)})`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let errMsg: string | undefined;
    try { errMsg = (JSON.parse(text) as { error?: string }).error; } catch { /* ignore */ }
    throw new Error(errMsg ?? `Document generation failed (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Server-Sent Events not supported.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      let eventName = 'message';
      let dataLine = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataLine = line.slice(6);
      }
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine) as Record<string, unknown>;
        const e = { event: eventName, data: parsed } as DocGenProgressEvent;
        onEvent(e);
        if (eventName === 'done') {
          try { reader.cancel(); } catch { /* ignore */ }
          return (parsed as { document: GeneratedDocument | null }).document;
        }
        if (eventName === 'error') {
          try { reader.cancel(); } catch { /* ignore */ }
          throw new Error((parsed as { message?: string }).message ?? 'Document generation error');
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== 'Document generation error') continue;
        throw parseErr;
      }
    }
  }

  return null;
}

export async function fetchDocuments(generationId: string): Promise<{ documents: GeneratedDocuments | null }> {
  return get(`/documents/${generationId}`);
}
