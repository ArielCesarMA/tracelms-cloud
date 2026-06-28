import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { PromptStep } from '@prisma/client';
import prisma from '../db/prisma';

export const promptsRouter = Router();

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

const VALID_STEPS = Object.values(PromptStep);

const STEP_FILES: Record<PromptStep, string> = {
  ENHANCEMENT: 'requirement-enhancement.txt',
  SCENARIOS:   'scenario-generation.txt',
  TEST_CASES:  'test-case-generation.txt',
  AUTOMATION:  'automation-analysis.txt',
};

function readDefaultFile(step: PromptStep): string {
  const filePath = path.join(__dirname, '../prompts', STEP_FILES[step]);
  return fs.readFileSync(filePath, 'utf8');
}

// GET /api/prompts?step=ENHANCEMENT&projectId=xxx
// Returns global templates plus project-scoped overrides when projectId is provided.
promptsRouter.get('/', wrap(async (req: Request, res: Response) => {
  const stepFilter = req.query.step as string | undefined;
  const projectId = req.query.projectId as string | undefined;

  if (stepFilter && !VALID_STEPS.includes(stepFilter as PromptStep)) {
    res.status(400).json({ error: `Invalid step. Must be one of: ${VALID_STEPS.join(', ')}` });
    return;
  }

  const baseWhere = stepFilter ? { step: stepFilter as PromptStep } : {};

  const [globalTemplates, projectTemplates] = await Promise.all([
    prisma.promptTemplate.findMany({
      where: { ...baseWhere, projectId: null },
      orderBy: [{ step: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, step: true, content: true, isDefault: true, isActive: true, projectId: true, updatedAt: true },
    }),
    projectId
      ? prisma.promptTemplate.findMany({
          where: { ...baseWhere, projectId },
          orderBy: [{ step: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, name: true, step: true, content: true, isDefault: true, isActive: true, projectId: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);

  res.json({ templates: [...globalTemplates, ...projectTemplates] });
}));

// PUT /api/prompts/:id
// Without projectId: global override — isDefault prompts become inactive and a new custom row is created.
// With projectId: project-scoped override — upsert a project-specific row without touching global templates.
promptsRouter.put('/:id', wrap(async (req: Request, res: Response) => {
  const { content, projectId } = req.body as { content?: string; projectId?: string };

  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content is required and must be a non-empty string.' });
    return;
  }

  const template = await prisma.promptTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) {
    res.status(404).json({ error: 'Prompt template not found.' });
    return;
  }

  // Project-scoped override path
  if (projectId) {
    const existing = await prisma.promptTemplate.findFirst({
      where: { step: template.step, projectId, isActive: true },
    });
    if (existing) {
      const updated = await prisma.promptTemplate.update({
        where: { id: existing.id },
        data: { content: content.trim() },
      });
      res.json({ template: updated });
    } else {
      const created = await prisma.promptTemplate.create({
        data: {
          name: template.name,
          step: template.step,
          content: content.trim(),
          isDefault: false,
          isActive: true,
          projectId,
        },
      });
      res.json({ template: created });
    }
    return;
  }

  // Global override path (existing behavior)
  if (template.isDefault) {
    await prisma.$transaction([
      prisma.promptTemplate.update({ where: { id: template.id }, data: { isActive: false } }),
      prisma.promptTemplate.create({
        data: {
          name: template.name,
          step: template.step,
          content: content.trim(),
          isDefault: false,
          isActive: true,
          projectId: null,
        },
      }),
    ]);
    const updated = await prisma.promptTemplate.findFirst({
      where: { step: template.step, isDefault: false, isActive: true, projectId: null },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ template: updated });
  } else {
    const updated = await prisma.promptTemplate.update({
      where: { id: req.params.id },
      data: { content: content.trim() },
    });
    res.json({ template: updated });
  }
}));

// POST /api/prompts/reset/:id
// Project-scoped override: deletes only the project-scoped row (restores to global).
// Global custom override: deletes all global custom rows, reactivates the seed default.
promptsRouter.post('/reset/:id', wrap(async (req: Request, res: Response) => {
  const template = await prisma.promptTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) {
    res.status(404).json({ error: 'Prompt template not found.' });
    return;
  }

  // Project-scoped override: just delete it
  if (template.projectId) {
    await prisma.promptTemplate.delete({ where: { id: template.id } });
    // Return the active global template for this step so the frontend can update its state
    const globalActive = await prisma.promptTemplate.findFirst({
      where: { step: template.step, isActive: true, projectId: null },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ template: globalActive });
    return;
  }

  // Global custom override: restore seed default
  const originalContent = readDefaultFile(template.step);

  await prisma.$transaction([
    prisma.promptTemplate.deleteMany({ where: { step: template.step, isDefault: false, projectId: null } }),
    prisma.promptTemplate.updateMany({
      where: { step: template.step, isDefault: true },
      data: { content: originalContent, isActive: true },
    }),
  ]);

  const restored = await prisma.promptTemplate.findFirst({
    where: { step: template.step, isDefault: true },
  });

  res.json({ template: restored });
}));
