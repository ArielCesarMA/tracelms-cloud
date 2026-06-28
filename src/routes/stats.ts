import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';

export const statsRouter = Router();

// Public — no auth required. Called from the login page before authentication.
statsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const [generationsCount, testimonials] = await Promise.all([
      prisma.generation.count({ where: { status: 'COMPLETED' } }),
      prisma.testimonial.findMany({
        where: { isVisible: true },
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          companyName: true,
          logoUrl: true,
          quote: true,
          authorName: true,
          authorTitle: true,
        },
      }),
    ]);

    res.json({ generationsCount, testimonials });
  } catch {
    // Never 500 on a public marketing endpoint — return zeroes so the login page still renders.
    res.json({ generationsCount: 0, testimonials: [] });
  }
});
