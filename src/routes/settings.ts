import { Router, Request, Response } from 'express';
import { LLMService } from '../services/llm/LLMService';
import { LLMProviderName } from '../types';

export const settingsRouter = Router();

// Test LLM connection
settingsRouter.post('/test-llm', async (req: Request, res: Response) => {
  const { llmProvider, llmModel, llmApiKey } = req.body as {
    llmProvider: string;
    llmModel: string;
    llmApiKey: string;
  };

  try {
    const service = new LLMService(llmProvider as LLMProviderName, llmApiKey);
    const result = await service.complete({
      model: llmModel,
      prompt: 'Reply with exactly: OK',
      temperature: 0
    });
    const ok = result.text.trim().length > 0;
    res.json({ ok, message: ok ? `LLM test passed for ${llmProvider} (${llmModel}).` : 'Empty response from LLM.' });
  } catch (err) {
    res.json({ ok: false, message: `LLM test failed for ${llmProvider} (${llmModel}): ${err instanceof Error ? err.message : String(err)}` });
  }
});

// Validate Jira/Xray settings shape
settingsRouter.post('/test-jira', (req: Request, res: Response) => {
  const { jiraUrl, jiraProjectKey, jiraEmail, jiraApiToken, xrayClientId, xrayClientSecret } = req.body as Record<string, string>;

  const urlOk = /^https:\/\/.+/i.test((jiraUrl ?? '').trim());
  const projectOk = Boolean((jiraProjectKey ?? '').trim());
  const emailOk = Boolean((jiraEmail ?? '').trim());
  const tokenOk = Boolean((jiraApiToken ?? '').trim());
  const xrayOk = Boolean((xrayClientId ?? '').trim()) && Boolean((xrayClientSecret ?? '').trim());
  const ok = urlOk && projectOk && emailOk && tokenOk && xrayOk;

  res.json({
    ok,
    message: ok
      ? 'Jira/Xray settings shape looks valid.'
      : 'Provide Jira URL, project key, email/token, and Xray credentials.'
  });
});
