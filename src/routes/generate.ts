import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { LLMService } from '../services/llm/LLMService';
import { LLMProviderName } from '../types';

export const generateRouter = Router();

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

function extractJson(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1].trim() : text.trim();
  return JSON.parse(raw);
}

// ------------------------------------------------------------------
// POST /api/generate/enhancement
// ------------------------------------------------------------------
generateRouter.post('/enhancement', async (req: Request, res: Response) => {
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
});

// ------------------------------------------------------------------
// POST /api/generate/scenarios
// ------------------------------------------------------------------
generateRouter.post('/scenarios', async (req: Request, res: Response) => {
  const { requirements, enhancement, settings } = req.body as {
    requirements: string;
    enhancement: unknown;
    settings: Settings;
  };

  if (!requirements?.trim()) {
    res.status(400).json({ error: 'Provide requirements text before generating scenarios.' });
    return;
  }

  try {
    const systemPrompt = loadPrompt('scenario-generation.txt');
    const userPrompt = `Requirements:\n${requirements}\n\nEnhancement:\n${JSON.stringify(enhancement, null, 2)}`;
    const text = await callLLM(settings, systemPrompt, userPrompt);
    const scenarios = extractJson(text);
    res.json({ scenarios });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate scenarios.' });
  }
});

// ------------------------------------------------------------------
// POST /api/generate/testcases
// ------------------------------------------------------------------
generateRouter.post('/testcases', async (req: Request, res: Response) => {
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
});

// ------------------------------------------------------------------
// POST /api/generate/automation
// ------------------------------------------------------------------
generateRouter.post('/automation', async (req: Request, res: Response) => {
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

  try {
    const systemPrompt = loadPrompt('automation-analysis.txt');
    const userPrompt = [
      `Requirements:\n${requirements}`,
      `Enhancement:\n${JSON.stringify(enhancement, null, 2)}`,
      `Scenarios:\n${JSON.stringify(scenarios, null, 2)}`,
      `Test Cases:\n${JSON.stringify(testCases, null, 2)}`
    ].join('\n\n');
    const text = await callLLM(settings, systemPrompt, userPrompt);
    const analysis = extractJson(text);
    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to analyze automation candidates.' });
  }
});
