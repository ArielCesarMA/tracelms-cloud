import { Router, Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { DocumentParser, UploadedFilePayload } from '../services/document/DocumentParser';
import type { AuthenticatedRequest } from '../middleware/auth';

export const parseRouter = Router();

// BUG-3 fix: wrap() propagates async errors to Express global error middleware.
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

// Parse rate limiter: 10 uploads / user / min (user-scoped, IP fallback)
const parseLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authed = req as AuthenticatedRequest;
    return authed.user?.userId ?? ipKeyGenerator(req.ip ?? '');
  },
  message: { error: 'Too many uploads. Please wait before uploading more files.' },
});

const parser = new DocumentParser();

parseRouter.use(parseLimiter);

parseRouter.post('/', wrap(async (req: Request, res: Response) => {
  const { files } = req.body as { files: UploadedFilePayload[] };

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: 'No files provided.' });
    return;
  }

  try {
    const parsed = await parser.parseFiles(files);

    // Surface injection warnings at the top level — frontend shows amber banner
    const warnings: string[] = [];
    for (const f of parsed) {
      if (f.clean === false && f.flaggedPatterns && f.flaggedPatterns.length > 0) {
        warnings.push(
          `"${f.name}" contains ${f.flaggedPatterns.length} suspicious pattern${f.flaggedPatterns.length > 1 ? 's' : ''}.`
        );
      }
    }

    const combinedText = parsed
      .filter((f) => !f.error)
      .map((f) => `Source: ${f.name}\n${f.text}`)
      .join('\n\n');

    res.json({
      combinedText,
      files: parsed,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to parse files.' });
  }
}));
