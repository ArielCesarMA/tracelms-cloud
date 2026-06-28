import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { type Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { LLMService } from '../services/llm/LLMService';
import { LLMProviderName } from '../types';
import { getModelCapabilities } from '../services/llm/probeModelCapabilities';

interface DocSettings {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
}

export const documentsRouter = Router();

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

function loadPrompt(filename: string): string {
  return fs.readFileSync(path.join(__dirname, '../prompts', filename), 'utf8');
}

function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// POST /api/documents/generate — SSE stream producing a structured document JSON
documentsRouter.post('/generate', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;

  const { generationId, projectName, documentType = 'test-plan', settings } = req.body as {
    generationId?: string;
    projectName?: string;
    documentType?: 'test-plan' | 'test-strategy';
    settings?: DocSettings;
  };

  if (!generationId) {
    res.status(400).json({ error: 'generationId is required.' });
    return;
  }

  if (!settings?.llmApiKey) {
    res.status(400).json({ error: 'LLM API key is not configured. Set it in Settings.' });
    return;
  }

  // Load the generation record
  const generation = await prisma.generation.findFirst({
    where: { id: generationId, userId },
  });

  if (!generation) {
    res.status(404).json({ error: 'Generation not found.' });
    return;
  }

  // Build context for the prompt
  const testCases = Array.isArray(generation.testCases) ? generation.testCases : [];
  const scenarios = Array.isArray(generation.scenarios) ? generation.scenarios : [];
  const automation = generation.automation as { summary?: string; recommendedOrder?: string[]; items?: unknown[] } | null;
  const enhancement = generation.enhancement as { risks?: string[] } | null;

  const today = new Date().toISOString().split('T')[0];
  const name = projectName?.trim() || 'Project';

  const userPrompt = `
Project Name: ${name}
Date: ${today}
LLM Provider: ${generation.llmProvider}
LLM Model: ${generation.llmModel}

REQUIREMENTS (excerpt):
${generation.requirementText.slice(0, 4000)}

ENHANCEMENT ANALYSIS:
${enhancement ? JSON.stringify(enhancement, null, 2) : 'Not available.'}

SCENARIOS (${scenarios.length} total):
${JSON.stringify(scenarios.slice(0, 20), null, 2)}

TEST CASES (${testCases.length} total, all included below):
${JSON.stringify(testCases, null, 2)}

AUTOMATION ANALYSIS:
${automation ? JSON.stringify(automation, null, 2) : 'Not available.'}

Generate the ${documentType === 'test-strategy' ? 'Test Strategy' : 'IEEE 829 Test Plan'} JSON document for the project "${name}".
`.trim();

  const promptFile = documentType === 'test-strategy'
    ? 'test-strategy-generation.txt'
    : 'test-plan-generation.txt';
  const systemPrompt = loadPrompt(promptFile);

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let aborted = false;
  req.on('close', () => { aborted = true; });

  const caps = await getModelCapabilities(settings.llmModel, settings.llmProvider);
  if (caps.isReasoningModel) {
    sendSSE(res, 'model-info', { isReasoning: true });
  }

  const docLabel = documentType === 'test-strategy' ? 'test strategy' : 'test plan';
  sendSSE(res, 'status', { message: `Generating ${docLabel} document…` });

  let accumulated = '';

  try {
    const service = new LLMService(settings.llmProvider as LLMProviderName, settings.llmApiKey);
    await service.stream(
      {
        model: settings.llmModel,
        systemPrompt,
        prompt: userPrompt,
        temperature: 0.2,
      },
      (chunk) => {
        if (aborted) return;
        accumulated += chunk;
        sendSSE(res, 'chunk', { text: chunk });
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'LLM error during document generation.';
    console.error('[documents/generate] LLM stream failed —', msg);
    sendSSE(res, 'error', { message: msg });
    res.end();
    return;
  }

  if (aborted) {
    res.end();
    return;
  }

  // Parse and persist the document JSON
  let document: unknown = null;
  try {
    // Strip markdown code fences that some models add despite being instructed not to
    const cleaned = accumulated.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      document = JSON.parse(jsonMatch[0]);
    } else {
      console.warn(`[documents/generate] No JSON object found in LLM output — provider=${settings.llmProvider} model=${settings.llmModel} outputLen=${accumulated.length}`);
    }
  } catch (parseErr) {
    console.warn(`[documents/generate] JSON parse failed — provider=${settings.llmProvider} model=${settings.llmModel} outputLen=${accumulated.length} error=${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
  }

  if (document) {
    try {
      // Load existing documents object and merge the new document type
      const existing = await prisma.generation.findFirst({
        where: { id: generationId },
        select: { id: true },
      });
      if (existing) {
        const existingGen = await prisma.generation.findFirst({
          where: { id: generationId },
        });
        const existingDocs = (existingGen as unknown as { documents?: Record<string, unknown> }).documents ?? {};
        const merged = { ...existingDocs, [documentType]: document };
        await (prisma.generation.update as (args: unknown) => Promise<unknown>)({
          where: { id: generationId },
          data: { documents: merged as Prisma.InputJsonValue },
        });
      }
    } catch (err) {
      console.error('[documents/generate] Failed to persist document —', err instanceof Error ? err.message : err);
    }
  }

  sendSSE(res, 'done', { document, documentType });
  res.end();
}));

// GET /api/documents/:generationId — fetch the saved documents for a generation
documentsRouter.get('/:generationId', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;

  const generation = await prisma.generation.findFirst({
    where: { id: req.params.generationId, userId },
  });

  if (!generation) {
    res.status(404).json({ error: 'Generation not found.' });
    return;
  }

  const documents = (generation as unknown as { documents: unknown }).documents ?? null;
  res.json({ documents });
}));
