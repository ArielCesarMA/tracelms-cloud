import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import prisma from '../db/prisma';

export type OrgRoleValue = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export type ProjectRoleValue = 'LEAD' | 'EDITOR' | 'REVIEWER' | 'VIEWER';

// Map OrgRole to an equivalent ProjectRole for routes with no ProjectMember record.
// Admin acts as Lead on any project they're not explicitly a member of.
const ORG_TO_PROJECT: Record<OrgRoleValue, ProjectRoleValue> = {
  OWNER:  'LEAD',
  ADMIN:  'LEAD',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
};

// ── requireRole ───────────────────────────────────────────────────────────────
// Gates a route to users whose OrgRole is in the allowedRoles list.
// OWNER always passes (rule 1).

export function requireRole(...allowedRoles: OrgRoleValue[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) { res.status(401).json({ error: 'Unauthorised.' }); return; }

    const role = (user.role as OrgRoleValue) || 'VIEWER';

    // OWNER bypasses all OrgRole checks (rule 1)
    if (role === 'OWNER') { next(); return; }

    if (!allowedRoles.includes(role)) {
      res.status(403).json({
        error: 'Insufficient permissions.',
        required: allowedRoles.join(' or '),
        current: role,
      });
      return;
    }
    next();
  };
}

// ── requireProjectRole ────────────────────────────────────────────────────────
// Gates a route to users whose effective ProjectRole is in the allowedRoles list.
// Effective role = ProjectMember.projectRole if found, else OrgRole → ProjectRole map.
// OWNER always passes (rule 1).

export function requireProjectRole(...allowedRoles: ProjectRoleValue[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) { res.status(401).json({ error: 'Unauthorised.' }); return; }

    const orgRole = (user.role as OrgRoleValue) || 'VIEWER';

    // Rule 1: OWNER overrides all
    if (orgRole === 'OWNER') { next(); return; }

    // Resolve projectId from multiple possible locations
    const body = req.body as Record<string, unknown> | undefined;
    const projectId: string | undefined =
      (body?.projectId as string) || req.params.projectId || req.params.id;

    let effectiveRole: ProjectRoleValue;

    if (projectId) {
      try {
        const member = await prisma.projectMember.findFirst({
          where: { projectId, userId: user.userId },
          select: { projectRole: true },
        });
        effectiveRole = (member?.projectRole as ProjectRoleValue) ?? ORG_TO_PROJECT[orgRole];
      } catch {
        effectiveRole = ORG_TO_PROJECT[orgRole];
      }
    } else {
      // No project context — use OrgRole → ProjectRole mapping
      effectiveRole = ORG_TO_PROJECT[orgRole];
    }

    if (!allowedRoles.includes(effectiveRole)) {
      res.status(403).json({
        error: 'Insufficient permissions.',
        required: allowedRoles.join(' or '),
        current: effectiveRole,
      });
      return;
    }
    next();
  };
}
