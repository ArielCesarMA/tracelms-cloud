import { Router, Request, Response } from 'express';
import { DocumentParser, UploadedFilePayload } from '../services/document/DocumentParser';

export const parseRouter = Router();

const parser = new DocumentParser();

parseRouter.post('/', async (req: Request, res: Response) => {
  const { files } = req.body as { files: UploadedFilePayload[] };

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: 'No files provided.' });
    return;
  }

  try {
    const parsed = await parser.parseFiles(files);
    const combinedText = parsed
      .filter((f) => !f.error)
      .map((f) => `Source: ${f.name}\n${f.text}`)
      .join('\n\n');

    res.json({ combinedText, files: parsed });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to parse files.' });
  }
});
