import { Router, Request, Response, NextFunction } from 'express';
import { JiraXrayService, XrayManualTestCase } from '../services/jira/JiraXrayService';
import { BatchProcessor, DEFAULT_BATCH_CONFIG } from '../services/jira/BatchProcessor';
import { PushHistoryStore } from '../services/storage/PushHistoryStore';
import { buildTestCaseFingerprint } from '../utils/fingerprintUtil';
import { requireProjectRole } from '../middleware/permissions';

// Full test case shape: superset of both XrayManualTestCase and the fingerprinting subset.
type PushableTestCase = XrayManualTestCase & { gherkin?: string; testData?: string; layer?: string };

export const xrayRouter = Router();

// BUG-3 fix: wrap() propagates async errors to Express global error middleware.
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

const pushHistory = new PushHistoryStore();

interface XraySettings {
  jiraUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;
  xrayClientId: string;
  xrayClientSecret: string;
  xrayBatchSize: string;
  xrayBatchDelayMs: string;
  xrayMaxRetries: string;
}

// POST /api/xray/push
xrayRouter.post('/push', requireProjectRole('LEAD', 'EDITOR'), wrap(async (req: Request, res: Response) => {
  const { testCases, retryOnlyIds, settings } = req.body as {
    testCases: PushableTestCase[];
    retryOnlyIds?: string[];
    settings: XraySettings;
  };

  if (!Array.isArray(testCases) || testCases.length === 0) {
    res.status(400).json({ error: 'Generate test cases before pushing to Xray.' });
    return;
  }

  try {
    const service = new JiraXrayService(
      settings.jiraUrl,
      settings.jiraEmail,
      settings.jiraApiToken,
      settings.jiraProjectKey,
      settings.xrayClientId,
      settings.xrayClientSecret
    );

    const processor = new BatchProcessor({
      batchSize: Math.min(100, Math.max(1, Number(settings.xrayBatchSize) || DEFAULT_BATCH_CONFIG.batchSize)),
      delayBetweenBatchesMs: Math.min(30000, Math.max(0, Number(settings.xrayBatchDelayMs) || DEFAULT_BATCH_CONFIG.delayBetweenBatchesMs)),
      maxRetries: Math.min(10, Math.max(1, Number(settings.xrayMaxRetries) || DEFAULT_BATCH_CONFIG.maxRetries))
    });

    const selected = retryOnlyIds?.length
      ? testCases.filter((tc) => retryOnlyIds.includes(tc.id))
      : testCases;

    const pushRecords = await pushHistory.getAll();
    const fingerprintByLocalId = new Map<string, string>();
    const casesToPush: typeof testCases = [];
    const preStatuses: Array<{ localId: string; success: boolean; key?: string; url?: string; message: string; isValidationError?: boolean; errorClass?: string; fixPath?: string }> = [];

    for (const tc of selected) {
      const errors = service.validateTestCase(tc);
      if (errors.length > 0) {
        preStatuses.push({
          localId: tc.id, success: false,
          message: errors.map((e) => e.error).join(' | '),
          isValidationError: true,
          errorClass: 'validation',
          fixPath: 'The LLM output is missing a required field. Regenerate test cases or check the prompt configuration.',
        });
        continue;
      }
      const fp = buildTestCaseFingerprint(tc);
      const existing = pushRecords[fp];
      if (existing?.key) {
        preStatuses.push({ localId: tc.id, success: true, key: existing.key, url: existing.url, message: 'Already pushed — skipped duplicate.', errorClass: 'duplicate' });
        continue;
      }
      fingerprintByLocalId.set(tc.id, fp);
      casesToPush.push(tc);
    }

    const progressEvents: unknown[] = [];
    const pushedStatuses = casesToPush.length > 0
      ? await processor.processBatchesWithDelay(
          casesToPush,
          (batch) => service.pushManualTestCasesDetailed(batch),
          (event) => { progressEvents.push(event); }
        )
      : [];

    const base = settings.jiraUrl.replace(/\/$/, '');
    for (const status of pushedStatuses) {
      if (!status.success || !status.key) continue;
      const fp = fingerprintByLocalId.get(status.localId);
      if (!fp) continue;
      await pushHistory.put(fp, {
        fingerprint: fp,
        key: status.key,
        url: status.url || (base ? `${base}/browse/${status.key}` : ''),
        pushedAt: new Date().toISOString()
      });
    }

    const allStatuses = [...preStatuses, ...pushedStatuses].map((s) => ({
      localId: s.localId,
      success: s.success ? 'true' : 'false',
      key: s.key ?? '',
      url: s.url || (s.key && base ? `${base}/browse/${s.key}` : ''),
      message: s.message ?? '',
      isValidationError: s.isValidationError,
      errorClass: s.errorClass ?? (s.success ? 'success' : 'permanent'),
      fixPath: s.fixPath ?? '',
    }));

    res.json({ pushed: allStatuses });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to push to Xray.' });
  }
}));

// POST /api/xray/preview
xrayRouter.post('/preview', wrap(async (req: Request, res: Response) => {
  const { testCases, settings } = req.body as {
    testCases: PushableTestCase[];
    settings: XraySettings;
  };

  if (!Array.isArray(testCases) || testCases.length === 0) {
    res.status(400).json({ error: 'Generate test cases before previewing Xray push.' });
    return;
  }

  const service = new JiraXrayService(settings.jiraUrl, settings.jiraEmail, settings.jiraApiToken, settings.jiraProjectKey, settings.xrayClientId, settings.xrayClientSecret);
  const pushRecords = await pushHistory.getAll();

  const preview = { totalCases: testCases.length, validationErrors: 0, duplicates: 0, willPush: 0, details: [] as unknown[] };

  for (const tc of testCases) {
    const errors = service.validateTestCase(tc);
    if (errors.length > 0) {
      preview.validationErrors += 1;
      preview.details.push({ id: tc.id, title: tc.title, status: 'validation-error', message: errors.map((e) => e.error).join(' | ') });
      continue;
    }
    const fp = buildTestCaseFingerprint(tc);
    if (pushRecords[fp]) {
      preview.duplicates += 1;
      preview.details.push({ id: tc.id, title: tc.title, status: 'duplicate', message: `Already pushed: ${pushRecords[fp].key}` });
    } else {
      preview.willPush += 1;
      preview.details.push({ id: tc.id, title: tc.title, status: 'valid', message: 'Ready to push' });
    }
  }

  res.json({ preview });
}));

// POST /api/xray/clear-history
xrayRouter.post('/clear-history', wrap(async (_req: Request, res: Response) => {
  await pushHistory.clear();
  res.json({ message: 'Xray push history cleared.' });
}));
