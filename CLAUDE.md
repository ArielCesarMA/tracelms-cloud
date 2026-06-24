# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## What This Is

TraceLMs Cloud is a web-based AI-powered test generation platform. It converts software
requirements into Xray-ready test cases using LLMs, integrates with Jira and Xray via
REST API, and processes requirement documents (.txt, .md, .docx, .pdf). It is the
SaaS port of the TraceLM VS Code extension.

## Tech Stack

- **Frontend:** React 18, Vite 5, TypeScript 5.5 — `frontend/`
- **Backend:** Node.js 20, Express 4, TypeScript 5.5 — `src/`
- **Database:** Supabase (PostgreSQL) via Prisma 5 — `prisma/`
- **LLM Providers:** OpenAI, Anthropic, Google Gemini, Groq
- **Streaming:** Server-Sent Events (SSE) with 300s idle timeout
- **Encryption:** AES-256-GCM for API keys at rest — `src/utils/encryption.ts`

## Commands

```bash
# Development
npm run dev:watch           # Backend with nodemon auto-restart
cd frontend && npm run dev  # Frontend Vite dev server (separate terminal)

# Build
npm run build               # Build both backend and frontend
npm run build:backend       # esbuild → dist/server.js
npm run build:frontend      # Vite → frontend/dist/

# Type checking
npm run typecheck           # Backend tsc --noEmit
npm run typecheck:frontend  # Frontend tsc --noEmit
npm run typecheck:all       # Both

# Database
npm run db:seed             # Seed 4 built-in LLM providers
npm run db:migrate          # Run Prisma migrations
npm run db:studio           # Open Prisma Studio

# Tests
npm test                    # Jest
npm run test:coverage       # Jest with coverage

# Linting
npm run lint
npm run lint:fix

# Validation
npm run validate:prompts    # Validate LLM prompt files in src/prompts/
```

## Architecture

Two-process model — backend and frontend communicate via HTTP + SSE:

```
Browser (React SPA)
  └── fetch / EventSource
        └── Express backend (src/server.ts)
              ├── src/routes/            — API route handlers
              ├── src/services/llm/      — LLM provider implementations
              ├── src/services/jira/     — Jira/Xray REST client
              ├── src/services/document/ — File parser (.txt/.md/.docx/.pdf)
              ├── src/services/storage/  — Push history dedup via fingerprints
              ├── src/db/prisma.ts       — Prisma client singleton
              └── src/utils/            — Encryption, fingerprint, SSE, timeout
```

**Backend** (`src/`):
- `src/server.ts` — Express app entry point, mounts all routes, loads dotenv
- `src/routes/generate.ts` — SSE streaming endpoints for all 5 generation steps
- `src/routes/settings.ts` — `GET /api/settings` and `POST /api/settings` with encrypted field handling
- `src/routes/jira.ts` — Jira issue fetch and story search
- `src/routes/parse.ts` — Document parsing endpoint
- `src/routes/xray.ts` — Xray push endpoint
- `src/services/llm/LLMService.ts` — Provider dispatcher (factory by provider name)
- `src/services/llm/*Provider.ts` — OpenAI, Anthropic, Gemini, Groq implementations
- `src/services/llm/timeoutUtil.ts` — TPS-based dynamic timeout calculation
- `src/services/SettingsService.ts` — Load/save settings with AES-256-GCM encryption
- `src/types/index.ts` — Shared backend types
- `src/types/pdf-parse.d.ts` — Type declaration for pdf-parse (no @types package exists)

**Frontend** (`frontend/src/`):
- `App.tsx` — Root component, all React state, message handlers, SSE consumers
- `frontend/src/tabs/` — One file per tab: Requirements, Enhancement, Scenarios, TestCases, Automation, SettingsTab (Integrations), LLMProviders, Projects, Output, Guide
- `frontend/src/components/` — StepStepper, CopyButton, ErrorBoundary, Tip
- `frontend/src/hooks/useTraceLMMessages.ts` — SSE and fetch orchestration hook
- `frontend/src/api/client.ts` — Typed API client
- `frontend/src/types.ts` — Frontend type definitions
- `frontend/src/styles.css` — Full design system (tokens, components, layout)

**Database** (`prisma/`):
- `prisma/schema.prisma` — 6 models: Settings, LLMProvider, LLMModel, Project, Stakeholder, Generation
- `prisma/seed.ts` — Seeds 4 built-in providers with models
- `src/db/prisma.ts` — `new PrismaClient()` singleton

## Environment Variables

Required in `.env` (root level — never commit this file):

```
DATABASE_URL="postgresql://..."   # Supabase session pooler connection string
ENCRYPTION_KEY="..."              # 32-character key for AES-256-GCM
```

## Key Conventions

- **Secrets** — API keys and tokens are encrypted with AES-256-GCM before DB storage. The backend never sends plaintext secrets to the frontend — masked as `(••••••••)`. If the frontend sends `(••••••••)` back on POST, the backend preserves the existing encrypted value.
- **SSE streaming** — All generation steps stream via SSE. Each provider uses `IDLE_MS = 300_000` (5 min idle timeout), resetting on every chunk received.
- **LLM providers** — Adding a new provider requires: new `*Provider.ts` implementing `LLMProvider` interface, a `case` in `LLMService.ts`, an entry in `timeoutUtil.ts` TPS map, and seeding in `prisma/seed.ts`.
- **Design tokens** — All UI uses CSS custom properties in `styles.css`. Never hardcode colors or spacing. Key tokens: `--accent`, `--radius-md`, `--space-*`, `--text-*`, `--surface-*`, `--border`.
- **Button system** — All buttons inherit the global `button` rule (`--radius-md`, `padding: 8px 16px`). Variants differ only in `background`, `border-color`, and `color` — never in shape.
- **Sidebar layout** — Fixed `--sidebar-w: 220px` left sidebar. Main area uses `width: calc(100vw - var(--sidebar-w))`. Responsive breakpoints: 700px (narrow), 540px (icon-only).
- **Tests** — Live in `src/**/__tests__/` (backend) and `frontend/src/**/__tests__/` (frontend). Pre-existing `@testing-library` type errors in test files are known noise — exclude from FAIL status in CI.
- **Prompt files** — LLM system prompts live in `src/prompts/` as `.txt` files, validated by `npm run validate:prompts`.

## Claude Skills Available

| Skill | Purpose |
|---|---|
| `/TraceDesign` | UI/UX design authority — layout, hierarchy, tokens, new components |
| `/TraceFixIssue` | Engineering authority — bugs, errors, regressions, broken builds |
| `/TraceBlueprint` | CTO-level — full technical documentation and SaaS roadmap |
| `/TraceAudit` | Quality gate — type-check, bundle size, security scan, Prisma validate, env guard |

## Current Version

`v0.1.0` — released 2026-06-24. See [GitHub Releases](https://github.com/ArielCesarMA/tracelms-cloud/releases).
