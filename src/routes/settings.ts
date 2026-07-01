import { Router, Request, Response, NextFunction } from 'express';
import { LLMService } from '../services/llm/LLMService';
import { LLMProviderName } from '../types';
import { loadSettings, saveSettings } from '../services/SettingsService';
import { AuthenticatedRequest } from '../middleware/auth';
import { requireRole } from '../middleware/permissions';

export const settingsRouter = Router();

// Wraps async handlers so Express 4 catches rejected promises via next(err).
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

// Load persisted settings
settingsRouter.get('/', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const settings = await loadSettings(userId);
  // Never send raw API keys to the frontend — mask them
  res.json({
    ...settings,
    llmApiKey: settings.llmApiKey ? '••••••••' : '',
    jiraApiToken: settings.jiraApiToken ? '••••••••' : '',
    xrayClientSecret: settings.xrayClientSecret ? '••••••••' : '',
  });
}));

// Save settings — Owner and Admin (global settings affect all users)
settingsRouter.post('/', requireRole('OWNER', 'ADMIN'), wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const incoming = req.body as Record<string, string>;
  // If the frontend sends the masked placeholder, reload the real value from DB
  const current = await loadSettings(userId);
  await saveSettings(userId, {
    llmProvider: incoming.llmProvider ?? current.llmProvider,
    llmModel: incoming.llmModel ?? current.llmModel,
    llmApiKey: incoming.llmApiKey === '••••••••' ? current.llmApiKey : (incoming.llmApiKey ?? ''),
    jiraUrl: incoming.jiraUrl ?? current.jiraUrl,
    jiraProjectKey: incoming.jiraProjectKey ?? current.jiraProjectKey,
    jiraEmail: incoming.jiraEmail ?? current.jiraEmail,
    jiraApiToken: incoming.jiraApiToken === '••••••••' ? current.jiraApiToken : (incoming.jiraApiToken ?? ''),
    xrayClientId: incoming.xrayClientId ?? current.xrayClientId,
    xrayClientSecret: incoming.xrayClientSecret === '••••••••' ? current.xrayClientSecret : (incoming.xrayClientSecret ?? ''),
    xrayBatchSize: incoming.xrayBatchSize ?? current.xrayBatchSize,
    xrayBatchDelayMs: incoming.xrayBatchDelayMs ?? current.xrayBatchDelayMs,
    xrayMaxRetries: incoming.xrayMaxRetries ?? current.xrayMaxRetries,
  });
  res.json({ ok: true });
}));

// Test LLM connection
settingsRouter.post('/test-llm', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { llmProvider, llmModel, llmApiKey } = req.body as {
    llmProvider: string;
    llmModel: string;
    llmApiKey: string;
  };

  if (process.env.LOG_LEVEL === 'debug') console.log(`[test-llm] provider=${llmProvider} model=${llmModel} keySet=${!!llmApiKey}`);

  if (!llmProvider || !llmModel) {
    res.json({ ok: false, message: 'Provider and model are required. Save your settings first.' });
    return;
  }

  // If frontend sent masked placeholder, load the real key from DB
  let resolvedApiKey = llmApiKey;
  if (llmApiKey === '••••••••') {
    const saved = await loadSettings(userId);
    resolvedApiKey = saved.llmApiKey;
  }

  if (!resolvedApiKey) {
    res.json({ ok: false, message: 'API key is missing. Enter and save your LLM API key first.' });
    return;
  }

  try {
    const service = new LLMService(llmProvider as LLMProviderName, resolvedApiKey);
    const result = await service.complete({
      model: llmModel,
      prompt: 'Reply with exactly: OK',
      temperature: 0
    });
    const ok = result.text.trim().length > 0;
    if (process.env.LOG_LEVEL === 'debug') console.log(`[test-llm] result ok=${ok} text="${result.text.slice(0, 40)}"`);
    res.json({ ok, message: ok ? `LLM test passed for ${llmProvider} (${llmModel}).` : 'LLM returned an empty response.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[test-llm] error:`, msg);
    res.json({ ok: false, message: `LLM test failed for ${llmProvider} (${llmModel}): ${msg}` });
  }
}));

// BUG-4 fix: actually call the Jira API to verify credentials instead of shape-checking only.
settingsRouter.post('/test-jira', wrap(async (req: Request, res: Response) => {
  const { jiraUrl, jiraProjectKey, jiraEmail, jiraApiToken, xrayClientId, xrayClientSecret } =
    req.body as Record<string, string>;

  const urlOk = /^https:\/\/.+/i.test((jiraUrl ?? '').trim());
  const projectOk = Boolean((jiraProjectKey ?? '').trim());
  const emailOk = Boolean((jiraEmail ?? '').trim());
  const tokenOk = Boolean((jiraApiToken ?? '').trim());

  if (!urlOk || !projectOk || !emailOk || !tokenOk) {
    res.json({ ok: false, message: 'Provide Jira URL (https://…), project key, email, and API token.' });
    return;
  }

  const xrayOk = Boolean((xrayClientId ?? '').trim()) && Boolean((xrayClientSecret ?? '').trim());

  // Probe Jira by calling /rest/api/3/myself — lightweight, requires valid credentials.
  const base = (jiraUrl ?? '').trim().replace(/\/$/, '');
  const credentials = Buffer.from(`${jiraEmail.trim()}:${jiraApiToken.trim()}`).toString('base64');

  try {
    const resp = await fetch(`${base}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const hint = resp.status === 401
        ? 'Invalid email or API token.'
        : resp.status === 403
        ? 'Account does not have Jira access.'
        : `Jira returned ${resp.status}.`;
      res.json({ ok: false, message: `Jira connectivity failed: ${hint}${body ? ` (${body.slice(0, 80)})` : ''}` });
      return;
    }

    const data = (await resp.json()) as { displayName?: string; emailAddress?: string };
    const who = data.displayName ?? data.emailAddress ?? 'unknown user';
    const xrayNote = xrayOk ? '' : ' (Xray credentials are missing — push to Xray will not work.)';
    if (process.env.LOG_LEVEL === 'debug') console.log(`[test-jira] connected as "${who}" xrayOk=${xrayOk}`);
    res.json({ ok: true, message: `Jira connected as ${who}.${xrayNote}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[test-jira] error:', msg);
    res.json({ ok: false, message: `Cannot reach Jira at ${base}: ${msg}` });
  }
}));
