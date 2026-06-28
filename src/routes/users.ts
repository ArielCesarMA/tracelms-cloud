import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { requireRole } from '../middleware/permissions';

export const usersRouter = Router();

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

const VALID_ORG_ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const;
type OrgRoleValue = typeof VALID_ORG_ROLES[number];

// ── GET /api/users ─────────────────────────────────────────────────────────
// Owner and Admin can list all users.

usersRouter.get('/', requireRole('OWNER', 'ADMIN'), wrap(async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ users });
}));

// ── PATCH /api/users/:id/role ──────────────────────────────────────────────
// Owner only — change any user's role. Guards: cannot demote last OWNER.

usersRouter.patch('/:id/role', requireRole('OWNER'), wrap(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body as { role?: OrgRoleValue };
  const requesterId = (req as AuthenticatedRequest).user.userId;

  if (!role || !VALID_ORG_ROLES.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${VALID_ORG_ROLES.join(', ')}` });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) { res.status(404).json({ error: 'User not found.' }); return; }

  // Guard: cannot demote the last OWNER
  if (target.role === 'OWNER' && role !== 'OWNER') {
    const ownerCount = await prisma.user.count({ where: { role: 'OWNER' } });
    if (ownerCount <= 1) {
      res.status(400).json({ error: 'Cannot demote the last Owner. Promote another user first.' });
      return;
    }
  }

  // Guard: only one OWNER allowed in Phase 3.5 (Phase 6 allows multi-Owner)
  if (role === 'OWNER' && target.role !== 'OWNER') {
    const existingOwner = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    if (existingOwner && existingOwner.id !== requesterId) {
      res.status(400).json({ error: 'An Owner already exists. Transfer ownership by first demoting the current Owner.' });
      return;
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, role: true, isActive: true },
  });

  res.json({ user: updated });
}));

// ── PATCH /api/users/:id/status ───────────────────────────────────────────
// Owner and Admin — deactivate/reactivate users.
// Admin cannot deactivate Owner or other Admins.

usersRouter.patch('/:id/status', requireRole('OWNER', 'ADMIN'), wrap(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body as { isActive?: boolean };
  const requester = (req as AuthenticatedRequest).user;

  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'isActive must be a boolean.' });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) { res.status(404).json({ error: 'User not found.' }); return; }

  // Admin cannot deactivate Owner or other Admins
  if (requester.role === 'ADMIN' && (target.role === 'OWNER' || target.role === 'ADMIN')) {
    res.status(403).json({ error: 'Admin cannot change the status of Owner or Admin accounts.' });
    return;
  }

  // Guard: cannot deactivate the last OWNER
  if (target.role === 'OWNER' && !isActive) {
    const ownerCount = await prisma.user.count({ where: { role: 'OWNER' } });
    if (ownerCount <= 1) {
      res.status(400).json({ error: 'Cannot deactivate the last Owner account.' });
      return;
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive },
    select: { id: true, email: true, role: true, isActive: true },
  });

  res.json({ user: updated });
}));
