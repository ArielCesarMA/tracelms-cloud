import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { LLMService } from '../services/llm/LLMService';
import { LLMProviderName } from '../types';

export const generateRouter = Router();

// Propagates async errors to Express global error middleware.
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

interface Settings {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
}

function loadPrompt(filename: string): string {
  const promptPath = path.join(__dirname, '../prompts', filename);
  return fs.readFileSync(promptPath, 'utf8');
}

async function callLLM(settings: Settings, systemPrompt: string, userPrompt: string): Promise<string> {
  const service = new LLMService(settings.llmProvider as LLMProviderName, settings.llmApiKey);
  const response = await service.complete({
    model: settings.llmModel,
    systemPrompt,
    prompt: userPrompt,
    temperature: 0.3
  });
  return response.text;
}

// Streams LLM output, calling onChunk for each text delta.
// Returns the full accumulated text when the provider finishes.
async function callLLMStream(
  settings: Settings,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const service = new LLMService(settings.llmProvider as LLMProviderName, settings.llmApiKey);
  let accumulated = '';
  await service.stream(
    { model: settings.llmModel, systemPrompt, prompt: userPrompt, temperature: 0.3 },
    (chunk) => { accumulated += chunk; onChunk(chunk); }
  );
  return accumulated;
}

// ------------------------------------------------------------------
// SSE helpers
// ------------------------------------------------------------------

interface SseEmitter {
  send(event: Record<string, unknown>): void;
  end(): void;
}

// Opens an SSE response and returns an emitter.  Caller must always call end().
function openSse(res: Response): SseEmitter {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();
  return {
    send(event) { res.write(`data: ${JSON.stringify(event)}\n\n`); },
    end()       { res.end(); },
  };
}

function extractJson(text: string): unknown {
  // Strategy 1: content inside a ```json ... ``` or ``` ... ``` fence.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
  }

  // Strategy 2: the whole response is already valid JSON.
  try { return JSON.parse(text.trim()); } catch { /* fall through */ }

  // Strategy 3: find the first { or [ and extract the outermost JSON structure.
  const firstBrace   = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const start = firstBrace === -1 ? firstBracket
              : firstBracket === -1 ? firstBrace
              : Math.min(firstBrace, firstBracket);

  if (start !== -1) {
    try { return JSON.parse(text.slice(start)); } catch { /* fall through */ }
  }

  const preview = text.slice(0, 120).replace(/\n/g, ' ');
  throw new Error(
    `The LLM returned a response that could not be parsed as JSON. ` +
    `Check your prompt files or try a different model. Response preview: "${preview}"`
  );
}

// ------------------------------------------------------------------
// Automation batching
//
// The automation prompt receives ALL test cases. With large inputs (50+
// test cases from big documents) this creates a single prompt that can
// exceed 30,000 tokens, causing timeout on every provider.
//
// Fix: split test cases into batches of AUTOMATION_BATCH_SIZE, run each
// batch independently, then merge the results. Each batch prompt is small
// enough to complete well within any provider's timeout.
// ------------------------------------------------------------------

const AUTOMATION_BATCH_SIZE = 15;

interface AutomationItem {
  testCaseId: string;
  scenarioId: string;
  requirementRef: string;
  candidate: boolean;
  exclusionReason: string;
  feasibilityLevel: string;
  feasibility: number;
  roiLevel: string;
  roiScore: number;
  layer: string;
  priority: string;
  playwrightAutomatable: string;
  playwrightScope: string;
  blocker: string;
  notes: string;
}

interface AutomationResult {
  summary: string;
  recommendedOrder: string[];
  items: AutomationItem[];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function mergeAutomationResults(results: AutomationResult[]): AutomationResult {
  if (results.length === 0) {
    return { summary: '', recommendedOrder: [], items: [] };
  }
  if (results.length === 1) {
    return results[0];
  }

  // Merge all items; use the first non-empty summary and recommendedOrder.
  const allItems = results.flatMap((r) => r.items ?? []);
  const summary = results.find((r) => r.summary?.trim())?.summary ?? '';
  const recommendedOrder = results.find((r) => r.recommendedOrder?.length)?.recommendedOrder ?? [];

  return { summary, recommendedOrder, items: allItems };
}

async function runAutomationBatched(
  requirements: string,
  enhancement: unknown,
  scenarios: unknown[],
  testCases: unknown[],
  settings: Settings
): Promise<AutomationResult> {
  const systemPrompt = loadPrompt('automation-analysis.txt');
  const contextPrefix = [
    `Requirements:\n${requirements}`,
    `Enhancement:\n${JSON.stringify(enhancement, null, 2)}`,
    `Scenarios:\n${JSON.stringify(scenarios, null, 2)}`
  ].join('\n\n');

  const batches = chunkArray(testCases, AUTOMATION_BATCH_SIZE);
  console.log(`[automation] ${testCases.length} test cases → ${batches.length} batch(es) of ≤${AUTOMATION_BATCH_SIZE}`);

  const batchResults = await Promise.all(
    batches.map(async (batch, idx) => {
      const batchNote = batches.length > 1
        ? `\n\n[Batch ${idx + 1} of ${batches.length} — analyze only the test cases below; other batches will be merged separately]`
        : '';
      const userPrompt = `${contextPrefix}${batchNote}\n\nTest Cases:\n${JSON.stringify(batch, null, 2)}`;
      const text = await callLLM(settings, systemPrompt, userPrompt);
      const parsed = extractJson(text) as AutomationResult;
      console.log(`[automation] batch ${idx + 1}/${batches.length} → ${parsed?.items?.length ?? 0} items`);
      return parsed;
    })
  );

  return mergeAutomationResults(batchResults);
}

// ------------------------------------------------------------------
// POST /api/generate/enhancement
// ------------------------------------------------------------------
generateRouter.post('/enhancement', wrap(async (req: Request, res: Response) => {
  const { requirements, settings } = req.body as { requirements: string; settings: Settings };

  if (!requirements?.trim()) {
    res.status(400).json({ error: 'Provide requirements text before running enhancement.' });
    return;
  }

  try {
    const systemPrompt = loadPrompt('requirement-enhancement.txt');
    const userPrompt = `Requirements:\n${requirements}`;
    const text = await callLLM(settings, systemPrompt, userPrompt);
    const enhancement = extractJson(text);
    res.json({ enhancement });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate enhancement.' });
  }
}));

// ------------------------------------------------------------------
// POST /api/generate/scenarios
// Enhancement is optional — when absent, the LLM applies its own QA
// expertise to surface gaps. This allows Scenarios to run in parallel
// with Enhancement in the Generate All DAG (Phase 1).
// ------------------------------------------------------------------
generateRouter.post('/scenarios', wrap(async (req: Request, res: Response) => {
  const { requirements, enhancement, settings } = req.body as {
    requirements: string;
    enhancement?: unknown;
    settings: Settings;
  };

  if (!requirements?.trim()) {
    res.status(400).json({ error: 'Provide requirements text before generating scenarios.' });
    return;
  }

  try {
    const systemPrompt = loadPrompt('scenario-generation.txt');
    const hasEnhancement = enhancement != null && Object.keys(enhancement as object).length > 0;
    const userPrompt = hasEnhancement
      ? `Requirements:\n${requirements}\n\nEnhancement:\n${JSON.stringify(enhancement, null, 2)}`
      : `Requirements:\n${requirements}`;
    const text = await callLLM(settings, systemPrompt, userPrompt);
    const scenarios = extractJson(text);
    res.json({ scenarios });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate scenarios.' });
  }
}));

// ------------------------------------------------------------------
// POST /api/generate/testcases
// ------------------------------------------------------------------
generateRouter.post('/testcases', wrap(async (req: Request, res: Response) => {
  const { scenarios, settings } = req.body as { scenarios: unknown[]; settings: Settings };

  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    res.status(400).json({ error: 'Generate or provide scenarios before generating test cases.' });
    return;
  }

  try {
    const systemPrompt = loadPrompt('test-case-generation.txt');
    const userPrompt = `Scenarios:\n${JSON.stringify(scenarios, null, 2)}`;
    const text = await callLLM(settings, systemPrompt, userPrompt);
    const testCases = extractJson(text);
    res.json({ testCases });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate test cases.' });
  }
}));

// ------------------------------------------------------------------
// POST /api/generate/automation
// ------------------------------------------------------------------
generateRouter.post('/automation', wrap(async (req: Request, res: Response) => {
  const { requirements, enhancement, scenarios, testCases, settings } = req.body as {
    requirements: string;
    enhancement: unknown;
    scenarios: unknown[];
    testCases: unknown[];
    settings: Settings;
  };

  if (!requirements?.trim()) {
    res.status(400).json({ error: 'Provide requirements text before analyzing automation candidates.' });
    return;
  }

  if (!Array.isArray(testCases) || testCases.length === 0) {
    res.status(400).json({ error: 'Generate test cases before running automation analysis.' });
    return;
  }

  try {
    const analysis = await runAutomationBatched(
      requirements,
      enhancement,
      Array.isArray(scenarios) ? scenarios : [],
      testCases,
      settings
    );
    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to analyze automation candidates.' });
  }
}));

// ==================================================================
// SSE Streaming routes
//
// Mirror the non-streaming routes above but push incremental output
// to the client via Server-Sent Events.  Wire protocol:
//
//   data: {"type":"started"}\n\n
//   data: {"type":"chunk","text":"...","chars":N}\n\n   (0..N times)
//   data: {"type":"done","result":{...}}\n\n
//
// On error:
//   data: {"type":"error","message":"..."}\n\n
//
// Automation also emits per-batch progress:
//   data: {"type":"batch","current":K,"total":N}\n\n
// ==================================================================

// POST /api/generate/enhancement/stream
generateRouter.post('/enhancement/stream', wrap(async (req: Request, res: Response) => {
  const { requirements, settings } = req.body as { requirements: string; settings: Settings };
  const sse = openSse(res);
  if (!requirements?.trim()) {
    sse.send({ type: 'error', message: 'Provide requirements text before running enhancement.' });
    sse.end(); return;
  }
  try {
    sse.send({ type: 'started' });
    const systemPrompt = loadPrompt('requirement-enhancement.txt');
    let chars = 0;
    const text = await callLLMStream(settings, systemPrompt, `Requirements:\n${requirements}`, (chunk) => {
      chars += chunk.length;
      sse.send({ type: 'chunk', text: chunk, chars });
    });
    const enhancement = extractJson(text);
    sse.send({ type: 'done', result: { enhancement } });
  } catch (err) {
    sse.send({ type: 'error', message: err instanceof Error ? err.message : 'Failed to generate enhancement.' });
  } finally {
    sse.end();
  }
}));

// POST /api/generate/scenarios/stream
generateRouter.post('/scenarios/stream', wrap(async (req: Request, res: Response) => {
  const { requirements, enhancement, settings } = req.body as {
    requirements: string; enhancement?: unknown; settings: Settings;
  };
  const sse = openSse(res);
  if (!requirements?.trim()) {
    sse.send({ type: 'error', message: 'Provide requirements text before generating scenarios.' });
    sse.end(); return;
  }
  try {
    sse.send({ type: 'started' });
    const systemPrompt = loadPrompt('scenario-generation.txt');
    const hasEnhancement = enhancement != null && Object.keys(enhancement as object).length > 0;
    const userPrompt = hasEnhancement
      ? `Requirements:\n${requirements}\n\nEnhancement:\n${JSON.stringify(enhancement, null, 2)}`
      : `Requirements:\n${requirements}`;
    let chars = 0;
    const text = await callLLMStream(settings, systemPrompt, userPrompt, (chunk) => {
      chars += chunk.length;
      sse.send({ type: 'chunk', text: chunk, chars });
    });
    const scenarios = extractJson(text);
    sse.send({ type: 'done', result: { scenarios } });
  } catch (err) {
    sse.send({ type: 'error', message: err instanceof Error ? err.message : 'Failed to generate scenarios.' });
  } finally {
    sse.end();
  }
}));

// POST /api/generate/testcases/stream
generateRouter.post('/testcases/stream', wrap(async (req: Request, res: Response) => {
  const { scenarios, settings } = req.body as { scenarios: unknown[]; settings: Settings };
  const sse = openSse(res);
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    sse.send({ type: 'error', message: 'Generate or provide scenarios before generating test cases.' });
    sse.end(); return;
  }
  try {
    sse.send({ type: 'started' });
    const systemPrompt = loadPrompt('test-case-generation.txt');
    let chars = 0;
    const text = await callLLMStream(settings, systemPrompt, `Scenarios:\n${JSON.stringify(scenarios, null, 2)}`, (chunk) => {
      chars += chunk.length;
      sse.send({ type: 'chunk', text: chunk, chars });
    });
    const testCases = extractJson(text);
    sse.send({ type: 'done', result: { testCases } });
  } catch (err) {
    sse.send({ type: 'error', message: err instanceof Error ? err.message : 'Failed to generate test cases.' });
  } finally {
    sse.end();
  }
}));

// POST /api/generate/automation/stream
//
// Automation batches test cases; streams per-batch progress events so
// the client can show "Batch 2 of 5" even before any text chunks flow.
generateRouter.post('/automation/stream', wrap(async (req: Request, res: Response) => {
  const { requirements, enhancement, scenarios, testCases, settings } = req.body as {
    requirements: string; enhancement: unknown;
    scenarios: unknown[]; testCases: unknown[]; settings: Settings;
  };
  const sse = openSse(res);
  if (!requirements?.trim()) {
    sse.send({ type: 'error', message: 'Provide requirements text before analyzing automation candidates.' });
    sse.end(); return;
  }
  if (!Array.isArray(testCases) || testCases.length === 0) {
    sse.send({ type: 'error', message: 'Generate test cases before running automation analysis.' });
    sse.end(); return;
  }
  try {
    sse.send({ type: 'started' });
    const systemPrompt = loadPrompt('automation-analysis.txt');
    const contextPrefix = [
      `Requirements:\n${requirements}`,
      `Enhancement:\n${JSON.stringify(enhancement, null, 2)}`,
      `Scenarios:\n${JSON.stringify(Array.isArray(scenarios) ? scenarios : [], null, 2)}`,
    ].join('\n\n');

    const batches = chunkArray(testCases, AUTOMATION_BATCH_SIZE);
    console.log(`[automation/stream] ${testCases.length} test cases → ${batches.length} batch(es)`);

    let totalChars = 0;
    const batchResults = await Promise.all(
      batches.map(async (batch, idx) => {
        sse.send({ type: 'batch', current: idx + 1, total: batches.length });
        const batchNote = batches.length > 1
          ? `\n\n[Batch ${idx + 1} of ${batches.length} — analyze only the test cases below; other batches will be merged separately]`
          : '';
        const userPrompt = `${contextPrefix}${batchNote}\n\nTest Cases:\n${JSON.stringify(batch, null, 2)}`;
        const text = await callLLMStream(settings, systemPrompt, userPrompt, (chunk) => {
          totalChars += chunk.length;
          sse.send({ type: 'chunk', text: chunk, chars: totalChars });
        });
        const parsed = extractJson(text) as AutomationResult;
        return parsed;
      })
    );

    const analysis = mergeAutomationResults(batchResults);
    sse.send({ type: 'done', result: { analysis } });
  } catch (err) {
    sse.send({ type: 'error', message: err instanceof Error ? err.message : 'Failed to analyze automation candidates.' });
  } finally {
    sse.end();
  }
}));
