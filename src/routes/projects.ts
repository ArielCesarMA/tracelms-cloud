import { Router, Request, Response, NextFunction } from 'express';
import { ProjectRole } from '@prisma/client';
import prisma from '../db/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { requireRole, requireProjectRole } from '../middleware/permissions';

export const projectsRouter = Router();

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

const VALID_PROJECT_ROLES = ['LEAD', 'EDITOR', 'REVIEWER', 'VIEWER'] as const;

// ── Projects CRUD ─────────────────────────────────────────────────────────────

// List active projects for the authenticated user (Owner/Admin see all)
projectsRouter.get('/', wrap(async (req: Request, res: Response) => {
  const { userId, role } = (req as AuthenticatedRequest).user;
  const isPrivileged = role === 'OWNER' || role === 'ADMIN';

  const projects = await prisma.project.findMany({
    where: isPrivileged ? { status: { not: 'ARCHIVED' } } : { ownerId: userId, status: { not: 'ARCHIVED' } },
    include: {
      members: { select: { id: true, email: true, name: true, projectRole: true } },
      _count: { select: { generations: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ projects });
}));

// Get a single project
projectsRouter.get('/:id', wrap(async (req: Request, res: Response) => {
  const { userId, role } = (req as AuthenticatedRequest).user;
  const isPrivileged = role === 'OWNER' || role === 'ADMIN';

  const project = await prisma.project.findFirst({
    where: isPrivileged ? { id: req.params.id } : { id: req.params.id, ownerId: userId },
    include: {
      members: { select: { id: true, email: true, name: true, projectRole: true, createdAt: true } },
      _count: { select: { generations: true } },
    },
  });

  if (!project) { res.status(404).json({ error: 'Project not found.' }); return; }
  res.json({ project });
}));

// Create a project — Editor+ required (Viewers cannot create)
projectsRouter.post('/', requireRole('OWNER', 'ADMIN', 'EDITOR'), wrap(async (req: Request, res: Response) => {
  const { userId, email } = (req as AuthenticatedRequest).user;
  const { name, key, description } = req.body as { name: string; key: string; description?: string };

  if (!name?.trim() || !key?.trim()) {
    res.status(400).json({ error: 'name and key are required.' });
    return;
  }

  const normalized = key.trim().toUpperCase();
  const existing = await prisma.project.findFirst({ where: { key: normalized } });
  if (existing) {
    res.status(409).json({ error: `Project key "${normalized}" is already in use.` });
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      key: normalized,
      description: description?.trim() ?? '',
      status: 'ACTIVE',
      owner: email,
      ownerId: userId,
    },
    include: {
      members: true,
      _count: { select: { generations: true } },
    },
  });

  // Auto-add creator as Lead on the project
  await prisma.projectMember.create({
    data: {
      email,
      name: email,
      projectRole: 'LEAD',
      userId,
      projectId: project.id,
    },
  });

  // Re-fetch with updated members
  const fresh = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      members: { select: { id: true, email: true, name: true, projectRole: true } },
      _count: { select: { generations: true } },
    },
  });

  res.status(201).json({ project: fresh });
}));

// Update a project — Lead or Owner/Admin
projectsRouter.patch('/:id', wrap(async (req: Request, res: Response) => {
  const { userId, role } = (req as AuthenticatedRequest).user;
  const isPrivileged = role === 'OWNER' || role === 'ADMIN';

  const existing = await prisma.project.findFirst({
    where: isPrivileged ? { id: req.params.id } : { id: req.params.id, ownerId: userId },
  });
  if (!existing) { res.status(404).json({ error: 'Project not found.' }); return; }

  const { name, description, status } = req.body as {
    name?: string; description?: string; status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  };

  const updated = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description.trim() } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    include: {
      members: { select: { id: true, email: true, name: true, projectRole: true } },
      _count: { select: { generations: true } },
    },
  });

  res.json({ project: updated });
}));

// ── Approval layers ───────────────────────────────────────────────────────────

const MAX_LAYERS = 5;
const MAX_MEMBERS_PER_LAYER = 3;

type ApprovalLayerInput = {
  order: number;
  consensus: 'ANY' | 'ALL';
  members: { name?: string; email: string }[];
};

// GET all approval layers for a project
projectsRouter.get('/:id/approval-layers', wrap(async (req: Request, res: Response) => {
  const { userId, role } = (req as AuthenticatedRequest).user;
  const isPrivileged = role === 'OWNER' || role === 'ADMIN';

  const project = await prisma.project.findFirst({
    where: isPrivileged ? { id: req.params.id } : { id: req.params.id, ownerId: userId },
  });
  if (!project) { res.status(404).json({ error: 'Project not found.' }); return; }

  const layers = await prisma.approvalLayer.findMany({
    where: { projectId: req.params.id },
    include: { members: { select: { id: true, name: true, email: true } } },
    orderBy: { order: 'asc' },
  });

  res.json({ layers });
}));

// PUT (full replace) approval layers — atomically deletes existing and inserts new
projectsRouter.put('/:id/approval-layers', wrap(async (req: Request, res: Response) => {
  const { userId, role } = (req as AuthenticatedRequest).user;
  const isPrivileged = role === 'OWNER' || role === 'ADMIN';

  const project = await prisma.project.findFirst({
    where: isPrivileged ? { id: req.params.id } : { id: req.params.id, ownerId: userId },
  });
  if (!project) { res.status(404).json({ error: 'Project not found.' }); return; }

  const { layers } = req.body as { layers: ApprovalLayerInput[] };

  if (!Array.isArray(layers)) {
    res.status(400).json({ error: 'layers must be an array.' });
    return;
  }
  if (layers.length > MAX_LAYERS) {
    res.status(400).json({ error: `Maximum ${MAX_LAYERS} approval layers allowed.` });
    return;
  }
  for (const layer of layers) {
    if (!['ANY', 'ALL'].includes(layer.consensus)) {
      res.status(400).json({ error: 'consensus must be ANY or ALL.' });
      return;
    }
    if (!Array.isArray(layer.members) || layer.members.length > MAX_MEMBERS_PER_LAYER) {
      res.status(400).json({ error: `Maximum ${MAX_MEMBERS_PER_LAYER} members per layer.` });
      return;
    }
    for (const m of layer.members) {
      if (!m.email?.trim()) {
        res.status(400).json({ error: 'Each approver must have an email.' });
        return;
      }
    }
  }

  const saved = await prisma.$transaction(async (tx) => {
    await tx.approvalLayer.deleteMany({ where: { projectId: req.params.id } });

    const created = await Promise.all(
      layers.map((layer, idx) =>
        tx.approvalLayer.create({
          data: {
            projectId: req.params.id,
            order: idx + 1,
            consensus: layer.consensus,
            members: {
              create: layer.members.map((m) => ({
                email: m.email.trim().toLowerCase(),
                name: m.name?.trim() ?? '',
              })),
            },
          },
          include: { members: { select: { id: true, name: true, email: true } } },
        })
      )
    );

    return created.sort((a, b) => a.order - b.order);
  });

  res.json({ layers: saved });
}));

// Archive a project — Owner/Admin only
projectsRouter.delete('/:id', requireRole('OWNER', 'ADMIN'), wrap(async (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const existing = await prisma.project.findFirst({ where: { id: req.params.id, ownerId: userId } });
  if (!existing) { res.status(404).json({ error: 'Project not found.' }); return; }

  await prisma.project.update({ where: { id: req.params.id }, data: { status: 'ARCHIVED' } });
  res.json({ ok: true });
}));

// ── Project Members ───────────────────────────────────────────────────────────

// Add a member — Lead or Owner/Admin
projectsRouter.post('/:id/members', requireProjectRole('LEAD', 'EDITOR'), wrap(async (req: Request, res: Response) => {
  const { userId: requesterId, role } = (req as AuthenticatedRequest).user;
  const isPrivileged = role === 'OWNER' || role === 'ADMIN';

  const project = await prisma.project.findFirst({
    where: isPrivileged ? { id: req.params.id } : { id: req.params.id, ownerId: requesterId },
  });
  if (!project) { res.status(404).json({ error: 'Project not found.' }); return; }

  const { email, name, projectRole } = req.body as { email: string; name?: string; projectRole?: string };
  if (!email?.trim()) { res.status(400).json({ error: 'email is required.' }); return; }
  if (projectRole && !VALID_PROJECT_ROLES.includes(projectRole as typeof VALID_PROJECT_ROLES[number])) {
    res.status(400).json({ error: `projectRole must be one of: ${VALID_PROJECT_ROLES.join(', ')}` });
    return;
  }

  // Link to User account if one exists with this email
  const existingUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  const member = await prisma.projectMember.create({
    data: {
      email: email.trim().toLowerCase(),
      name: name?.trim() ?? '',
      projectRole: (projectRole ?? 'VIEWER') as ProjectRole,
      projectId: req.params.id,
      ...(existingUser ? { userId: existingUser.id } : {}),
    },
  });

  res.status(201).json({ member });
}));

// Remove a member — Lead or Owner/Admin
projectsRouter.delete('/:id/members/:mid', requireProjectRole('LEAD'), wrap(async (req: Request, res: Response) => {
  const { userId: requesterId, role } = (req as AuthenticatedRequest).user;
  const isPrivileged = role === 'OWNER' || role === 'ADMIN';

  const project = await prisma.project.findFirst({
    where: isPrivileged ? { id: req.params.id } : { id: req.params.id, ownerId: requesterId },
  });
  if (!project) { res.status(404).json({ error: 'Project not found.' }); return; }

  const member = await prisma.projectMember.findFirst({
    where: { id: req.params.mid, projectId: req.params.id },
  });
  if (!member) { res.status(404).json({ error: 'Member not found.' }); return; }

  await prisma.projectMember.delete({ where: { id: req.params.mid } });
  res.json({ ok: true });
}));

// ── Legacy stakeholder URL aliases (backward compat with Phase 3 frontend) ────
projectsRouter.post('/:id/stakeholders', requireProjectRole('LEAD', 'EDITOR'), wrap(async (req: Request, res: Response) => {
  const { userId: requesterId, role } = (req as AuthenticatedRequest).user;
  const isPrivileged = role === 'OWNER' || role === 'ADMIN';

  const project = await prisma.project.findFirst({
    where: isPrivileged ? { id: req.params.id } : { id: req.params.id, ownerId: requesterId },
  });
  if (!project) { res.status(404).json({ error: 'Project not found.' }); return; }

  const { email, name, role: memberRole } = req.body as { email: string; name?: string; role?: string };
  if (!email?.trim()) { res.status(400).json({ error: 'email is required.' }); return; }

  // Map legacy free-text role to ProjectRole enum
  const projectRoleMap: Record<string, string> = {
    'QA Lead': 'LEAD',
    'Product Owner': 'REVIEWER',
    'Developer': 'EDITOR',
    'Observer': 'VIEWER',
  };
  const projectRole = ((memberRole && projectRoleMap[memberRole]) ?? memberRole ?? 'VIEWER') as ProjectRole;

  const existingUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  const member = await prisma.projectMember.create({
    data: {
      email: email.trim().toLowerCase(),
      name: name?.trim() ?? '',
      projectRole,
      projectId: req.params.id,
      ...(existingUser ? { userId: existingUser.id } : {}),
    },
  });

  res.status(201).json({ stakeholder: member, member });
}));

projectsRouter.delete('/:id/stakeholders/:sid', requireProjectRole('LEAD'), wrap(async (req: Request, res: Response) => {
  const { userId: requesterId, role } = (req as AuthenticatedRequest).user;
  const isPrivileged = role === 'OWNER' || role === 'ADMIN';

  const project = await prisma.project.findFirst({
    where: isPrivileged ? { id: req.params.id } : { id: req.params.id, ownerId: requesterId },
  });
  if (!project) { res.status(404).json({ error: 'Project not found.' }); return; }

  const member = await prisma.projectMember.findFirst({
    where: { id: req.params.sid, projectId: req.params.id },
  });
  if (!member) { res.status(404).json({ error: 'Member not found.' }); return; }

  await prisma.projectMember.delete({ where: { id: req.params.sid } });
  res.json({ ok: true });
}));
