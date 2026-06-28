import { Router } from 'express';
import { GenerationStatus } from '@prisma/client';
import prisma from '../db/prisma';

export const analyticsRouter = Router();

export type ModelScore = {
  model: string;
  provider: string;
  runs: number;
  avgTokens: number;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  successRate: number;
};

// GET /api/analytics/model-scores
// Aggregates Generation rows by llmModel — runs, avg tokens, success rate.
analyticsRouter.get('/model-scores', async (_req, res) => {
  try {
    const [byModel, completedByModel] = await Promise.all([
      prisma.generation.groupBy({
        by: ['llmModel', 'llmProvider'],
        _count: { id: true },
        _avg: { totalTokens: true, promptTokens: true, completionTokens: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.generation.groupBy({
        by: ['llmModel'],
        where: { status: GenerationStatus.COMPLETED },
        _count: { id: true },
      }),
    ]);

    const completedMap = new Map(completedByModel.map((r) => [r.llmModel, r._count.id]));

    const scores: ModelScore[] = byModel.map((r) => ({
      model: r.llmModel,
      provider: r.llmProvider,
      runs: r._count.id,
      avgTokens: Math.round(r._avg.totalTokens ?? 0),
      avgPromptTokens: Math.round(r._avg.promptTokens ?? 0),
      avgCompletionTokens: Math.round(r._avg.completionTokens ?? 0),
      successRate: r._count.id > 0
        ? Math.round(((completedMap.get(r.llmModel) ?? 0) / r._count.id) * 100)
        : 0,
    }));

    res.json({ scores });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch model scores.' });
  }
});
