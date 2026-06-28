import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../db/prisma';
import { AuthenticatedRequest } from '../middleware/auth';

export const authRouter = Router();

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

const BCRYPT_COST = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters');
  return secret;
}

function tokenExpiry(): string {
  return process.env.ACCESS_TOKEN_EXPIRY ?? '8h';
}

// ── POST /api/auth/register ────────────────────────────────────────────────
// Owner bootstrap: the first registered user is auto-assigned OrgRole OWNER.
// All subsequent users default to EDITOR (never VIEWER — avoids lockout).

authRouter.post('/register', wrap(async (req, res) => {
  if (process.env.ALLOW_REGISTRATION !== 'true') {
    res.status(403).json({ error: 'Registration is disabled. Set ALLOW_REGISTRATION=true to enable.' });
    return;
  }

  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  if (!password || password.length < 12) {
    res.status(400).json({ error: 'Password must be at least 12 characters.' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Registration failed. This account may already exist.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  // Check if this is the very first user — if so, they become the OWNER.
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? 'OWNER' : 'EDITOR';

  const user = await prisma.user.create({
    data: { email, passwordHash, role },
  });

  if (role === 'OWNER') {
    console.log(`[auth] First user registered (${email}) — assigned OrgRole: OWNER`);
  }

  res.status(201).json({ userId: user.id, email: user.email, role: user.role });
}));

// ── POST /api/auth/login ───────────────────────────────────────────────────

authRouter.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const DUMMY_HASH = '$2b$12$invalidsaltinvalidsaltinvalidsa.invalidhashvalue000000000';

  const match = user
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.compare(password, DUMMY_HASH).then(() => false);

  if (!user || !match || !user.isActive) {
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const secret = getJwtSecret();
  const expiresIn = tokenExpiry();
  // Include role in JWT so middleware can gate routes without a DB lookup per request.
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role ?? 'EDITOR' },
    secret,
    { expiresIn } as jwt.SignOptions
  );

  const decoded = jwt.decode(token) as { exp?: number };
  const expiresAt = decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;

  res.json({ token, expiresAt });
}));

// ── GET /api/auth/me ───────────────────────────────────────────────────────
// Returns the current user's profile including role, sourced from DB (not just JWT)
// so role changes take effect on the next poll without requiring re-login.

authRouter.get('/me', wrap(async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorised.' }); return; }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
  if (!user.isActive) { res.status(403).json({ error: 'Account deactivated.' }); return; }

  res.json({ user });
}));
