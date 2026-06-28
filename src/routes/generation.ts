import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import { AuthenticatedRequest } from '../middleware/auth';

export const generationRouter = Router();

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

type SaveGenerationBody = {
  requirementText: string;
  llmProvider: string;
  llmModel: string;
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL';
  enhancement: unknown;
  scenarios: unknown[] | null;
  testCases: unknown[] | null;
  automation: unknown;
  projectId?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

generationRouter.post('/', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { requirementText, llmProvider, llmModel, status, enhancement, scenarios, testCases, automation, projectId, promptTokens, completionTokens, totalTokens } =
    req.body as SaveGenerationBody;

  if (!requirementText || !llmProvider || !llmModel) {
    res.status(400).json({ error: 'requirementText, llmProvider, and llmModel are required.' });
    return;
  }

  const record = await prisma.generation.create({
    data: {
      requirementText,
      llmProvider,
      llmModel,
      status,
      userId,
      projectId: projectId ?? undefined,
      enhancement: enhancement ?? undefined,
      scenarios: scenarios != null ? (scenarios as Prisma.InputJsonValue) : undefined,
      testCases: testCases != null ? (testCases as Prisma.InputJsonValue) : undefined,
      automation: automation ?? undefined,
      totalTestCases: Array.isArray(testCases) ? testCases.length : 0,
      totalScenarios: Array.isArray(scenarios) ? scenarios.length : 0,
      promptTokens: promptTokens ?? 0,
      completionTokens: completionTokens ?? 0,
      totalTokens: totalTokens ?? 0,
    },
  });

  res.status(201).json({ id: record.id });
}));

generationRouter.get('/latest', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const generation = await prisma.generation.findFirst({
    where: { status: 'COMPLETED', userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ generation: generation ?? null });
}));

// Phase 3: cursor/offset pagination will be added when History UI pagination lands.
generationRouter.get('/history', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const projectId = req.query.projectId as string | undefined;

  const where: Record<string, unknown> = { userId };
  if (projectId) where.projectId = projectId;

  const records = await prisma.generation.findMany({
    where,
    select: {
      id: true,
      requirementText: true,
      llmProvider: true,
      llmModel: true,
      status: true,
      totalTestCases: true,
      totalScenarios: true,
      projectId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const generations = records.map((r) => ({
    id: r.id,
    requirementPreview: r.requirementText.length > 80
      ? r.requirementText.slice(0, 80) + '…'
      : r.requirementText,
    llmProvider: r.llmProvider,
    llmModel: r.llmModel,
    status: r.status,
    totalTestCases: r.totalTestCases,
    totalScenarios: r.totalScenarios,
    projectId: r.projectId,
    hasDocuments: (r as unknown as { documents?: unknown }).documents !== null && (r as unknown as { documents?: unknown }).documents !== undefined,
    createdAt: r.createdAt.toISOString(),
  }));

  res.json({ generations });
}));

// Load full generation record by id (used by Projects tab history restore)
generationRouter.get('/:id', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const generation = await prisma.generation.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!generation) {
    res.status(404).json({ error: 'Generation not found.' });
    return;
  }
  res.json({ generation });
}));

// Link a generation to a project (Option C — post-save project assignment)
generationRouter.patch('/:id/project', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { projectId } = req.body as { projectId: string };

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required.' });
    return;
  }

  const generation = await prisma.generation.findFirst({ where: { id: req.params.id, userId } });
  if (!generation) {
    res.status(404).json({ error: 'Generation not found.' });
    return;
  }

  const project = await prisma.project.findFirst({ where: { id: projectId } });
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  await prisma.generation.update({ where: { id: req.params.id }, data: { projectId } });
  res.json({ ok: true });
}));

// Patch test cases on a generation record (inline editing — Phase 4)
generationRouter.patch('/:id/testcases', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const { testCases } = req.body as { testCases?: unknown };

  if (!Array.isArray(testCases)) {
    res.status(400).json({ error: 'testCases must be an array.' });
    return;
  }

  const generation = await prisma.generation.findFirst({ where: { id: req.params.id, userId } });
  if (!generation) {
    res.status(404).json({ error: 'Generation not found.' });
    return;
  }

  await prisma.generation.update({
    where: { id: req.params.id },
    data: { testCases: testCases as Prisma.InputJsonValue, totalTestCases: testCases.length },
  });

  res.json({ ok: true });
}));

// Soft-delete a generation record
generationRouter.delete('/:id', wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const existing = await prisma.generation.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Generation not found.' });
    return;
  }
  await prisma.generation.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));
