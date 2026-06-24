import { Router, Request, Response, NextFunction } from 'express';
import { JiraXrayService } from '../services/jira/JiraXrayService';

export const jiraRouter = Router();

// BUG-3 fix: wrap() propagates async errors to Express global error middleware.
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

interface JiraSettings {
  jiraUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;
  xrayClientId: string;
  xrayClientSecret: string;
}

function createService(s: JiraSettings): JiraXrayService {
  return new JiraXrayService(s.jiraUrl, s.jiraEmail, s.jiraApiToken, s.jiraProjectKey, s.xrayClientId, s.xrayClientSecret);
}

// POST /api/jira/search
jiraRouter.post('/search', wrap(async (req: Request, res: Response) => {
  const { query, settings } = req.body as { query: string; settings: JiraSettings };
  try {
    const service = createService(settings);
    const stories = await service.searchStories(query ?? '');
    res.json({ stories });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to search Jira stories.' });
  }
}));

// POST /api/jira/pull
jiraRouter.post('/pull', wrap(async (req: Request, res: Response) => {
  const { mode, payload, settings } = req.body as {
    mode: string;
    payload: Record<string, string>;
    settings: JiraSettings;
  };

  try {
    const service = createService(settings);
    let issues: Awaited<ReturnType<typeof service.getIssues>>;

    if (mode === 'single') {
      const key = payload?.singleIssueKey?.trim() ?? '';
      issues = key ? [await service.getIssue(key)] : [];
    } else if (mode === 'multiple') {
      const keys = (payload?.multipleIssueKeys ?? '').split(',').map((k) => k.trim()).filter(Boolean);
      issues = await service.getIssues(keys);
    } else if (mode === 'epic') {
      issues = await service.getEpicChildren(payload?.epicKey?.trim() ?? '');
    } else if (mode === 'multiStory') {
      const keys = (payload?.selectedStoryKeys ?? '').split(',').map((k) => k.trim()).filter(Boolean);
      issues = await service.getIssues(keys);
    } else {
      issues = [];
    }

    const combinedText = issues
      .map((issue) => `[${issue.key}] ${issue.summary}\n${issue.description || 'No description provided.'}`)
      .join('\n\n');

    res.json({ issues, combinedText });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to pull Jira issues.' });
  }
}));
