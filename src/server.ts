import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { settingsRouter } from './routes/settings';
import { parseRouter } from './routes/parse';
import { generateRouter } from './routes/generate';
import { jiraRouter } from './routes/jira';
import { xrayRouter } from './routes/xray';
import { generationRouter } from './routes/generation';
import { authRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { usersRouter } from './routes/users';
import { documentsRouter } from './routes/documents';
import { promptsRouter } from './routes/prompts';
import { analyticsRouter } from './routes/analytics';
import { authMiddleware } from './middleware/auth';
import { requireRole } from './middleware/permissions';

// ── Process-level safety net ───────────────────────────────────────────────
// Node 15+ crashes on unhandled rejections — log and keep the server alive.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const app = express();
const PORT = process.env.PORT ?? 3000;

// BUG-6 fix: restrict CORS to known local origins and the production domain.
// Add your production URL to ALLOWED_ORIGINS when deploying.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',  // Vite dev server
  'http://localhost:3000',  // Express serving its own frontend
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];
if (process.env.FRONTEND_URL) {
  ALLOWED_ORIGINS.push(process.env.FRONTEND_URL);
}
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (same-origin, curl, Postman)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} is not allowed.`));
    }
  },
  credentials: true,
}));
// 27 MB cap — prevents oversized document payloads from reaching LLM routes
app.use(express.json({ limit: '27mb' }));

// ── Rate limiters ──────────────────────────────────────────────────────────
// Login: 5 attempts per 15 minutes per IP (brute force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// Generation: 5 requests per minute per IP (LLM cost protection — Phase 2.5 TDD)
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit reached. Please wait before generating again.' },
});

// ── Auth middleware ────────────────────────────────────────────────────────
// Protects all /api/* routes except /api/health and /api/auth/*.
app.use('/api', authMiddleware);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() });
});

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/parse', parseRouter);
app.use('/api/generate', generateLimiter, generateRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/xray', xrayRouter);
app.use('/api/generation', generationRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/users', usersRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/analytics', analyticsRouter);
// Owner-only: global settings write is guarded at the route level inside settingsRouter.
// Xray + generate routes are guarded at route level via requireProjectRole.

// ── Frontend (production) ──────────────────────────────────────────────────
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// ── Global error middleware ────────────────────────────────────────────────
// Must be defined AFTER all routes. Catches errors passed via next(err) and
// any unhandled async throws in Express 4 route handlers.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Express error]', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
});

// ── Server with extended socket timeout ───────────────────────────────────
// Node's default socket timeout (no timeout) means a slow LLM call keeps the
// TCP connection open indefinitely. Set a server-level timeout slightly above
// the maximum LLM timeout (10 min) so Express can send a proper 503 instead
// of a silent connection drop.
const server = app.listen(PORT, () => {
  console.log(`TraceLMs Cloud server running on http://localhost:${PORT}`);
});
server.setTimeout(660_000); // 11 minutes — just above the 10-minute LLM ceiling

export default app;
