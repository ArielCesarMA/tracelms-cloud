# TraceLMs Cloud

> AI-powered test case generation platform — converts software requirements into Xray-ready test cases using LLMs, with Jira/Xray integration and team collaboration.

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma)](https://www.prisma.io/)
[![Version](https://img.shields.io/badge/version-0.1.0-1A6B6B)](https://github.com/ArielCesarMA/tracelms-cloud/releases)

---

## What It Does

TraceLMs Cloud is the SaaS port of the TraceLM VS Code extension. It takes software requirements and runs them through a 5-step AI pipeline to produce structured, traceable test assets:

1. **Requirement Enhancement** — gaps, NFRs, risks, clarifying questions
2. **Test Scenarios** — behaviour-driven scenario generation
3. **Test Cases** — detailed, Xray-compatible test cases with traceability
4. **Automation Analysis** — layer guidance (Unit / API / UI), feasibility, ROI scoring
5. **Xray Push** — deduplicated batch push to Jira/Xray with fingerprint tracking

Supports requirement input from free text, uploaded files (`.txt`, `.md`, `.docx`, `.pdf`), or Jira issue fetch.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript 5.5 |
| Backend | Node.js 20, Express 4, TypeScript 5.5 |
| Database | Supabase (PostgreSQL) via Prisma 5 |
| LLM Providers | OpenAI, Anthropic, Google Gemini, Groq |
| Streaming | Server-Sent Events (SSE) |
| Encryption | AES-256-GCM for API keys at rest |

---

## Getting Started

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **Git**
- **`.env` credentials** — provided by the repository owner (see below)

### 1. Clone the repository

```bash
git clone https://github.com/ArielCesarMA/tracelms-cloud.git
cd tracelms-cloud
```

### 2. Create the `.env` file

Create a file named `.env` at the project root. This file is **not committed** — obtain the values from the repository owner:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
ENCRYPTION_KEY=...
```

> **Security:** Never share these values over Slack, email, or any unencrypted channel. Use a password manager share (1Password, Bitwarden) to transfer them securely.

### 3. Install dependencies

```bash
# Backend (project root)
npm install

# Frontend
cd frontend && npm install && cd ..
```

### 4. Generate the Prisma client

```bash
npx prisma generate
```

### 5. Start the backend

```bash
npm run dev:watch
```

Server starts at `http://localhost:3000`.

### 6. Build and open the frontend

In a second terminal:

```bash
cd frontend && npm run build
```

Open `http://localhost:3000` in your browser and log in with the credentials created for your account by the repository owner.

---

## Development Commands

```bash
# Backend
npm run dev:watch           # Backend with nodemon auto-restart (use this, not npm run dev)

# Frontend
cd frontend && npm run dev  # Vite dev server at localhost:5173 (no backend — CSS iteration only)
cd frontend && npm run build # Compile to frontend/dist/ — served by Express at localhost:3000

# Type checking
npm run typecheck:all       # Backend + frontend tsc --noEmit

# Tests
npm test                    # Jest
npm run test:coverage       # Jest with coverage

# Linting
npm run lint
npm run lint:fix

# Database
npm run db:seed             # Seed built-in LLM providers
npm run db:migrate          # Run Prisma migrations
npm run db:studio           # Open Prisma Studio

# Build (production)
npm run build               # Build backend + frontend
npm start                   # Run compiled dist/server.js
```

---

## Architecture

Two-process model — backend and frontend communicate via HTTP and Server-Sent Events:

```
Browser (React SPA)
  └── fetch / EventSource
        └── Express backend  (src/server.ts : port 3000)
              ├── src/routes/          API route handlers
              ├── src/services/llm/    LLM provider implementations
              ├── src/services/jira/   Jira/Xray REST client
              ├── src/services/document/ File parser (.txt/.md/.docx/.pdf)
              ├── src/services/storage/  Push history dedup via fingerprints
              └── src/utils/           Encryption, fingerprint, SSE, timeout
```

**Key design decisions:**
- All generation steps stream via SSE with a 300s idle timeout per chunk
- API keys are encrypted with AES-256-GCM before storage — the backend never sends plaintext keys to the frontend
- JWT-based auth with role-based access control (OWNER / ADMIN / EDITOR / VIEWER)
- Per-project Jira project key with Xray push override

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase PostgreSQL session pooler connection string |
| `ENCRYPTION_KEY` | Yes | 32-character key for AES-256-GCM encryption of stored API keys |
| `JWT_SECRET` | Yes | Secret for signing JWT auth tokens (min 32 characters) |
| `ALLOW_REGISTRATION` | No | Set to `true` to enable the `/api/auth/register` endpoint (owner bootstrap only) |
| `ACCESS_TOKEN_EXPIRY` | No | JWT expiry duration, e.g. `8h` (default: `8h`) |

---

## Project Structure

```
tracelms-cloud/
├── src/                    Backend (Express + TypeScript)
│   ├── routes/             API route handlers
│   ├── services/           Business logic (LLM, Jira, document, storage)
│   ├── middleware/         Auth + role guards
│   ├── utils/              Encryption, SSE, fingerprint helpers
│   ├── config/             Model registry
│   ├── prompts/            LLM system prompt .txt files
│   └── server.ts           Express entry point
├── frontend/               Frontend (React + Vite + TypeScript)
│   └── src/
│       ├── tabs/           One component per tab
│       ├── components/     Shared UI components
│       ├── hooks/          useTraceLMMessages SSE hook
│       ├── api/            Typed API client
│       ├── pages/          LoginPage
│       ├── types.ts        Frontend type definitions
│       └── styles.css      Full design system (tokens, components, layout)
├── prisma/
│   ├── schema.prisma       Database schema (6 models)
│   └── seed.ts             Seeds 4 built-in LLM providers
└── DOCUMENTATION/          Internal docs and TDDs
```

---

## LLM Providers

TraceLMs Cloud supports four LLM providers out of the box. Configure API keys in **Settings → LLM Settings** after logging in:

| Provider | Models |
|---|---|
| OpenAI | GPT-4o, GPT-4o Mini, GPT-4 Turbo, o1, o3-mini |
| Anthropic | Claude Opus 4, Sonnet 4, Haiku 4 |
| Google Gemini | Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash |
| Groq | Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B |

---

## Team Access

User accounts are managed by the OWNER via **Admin → Users → Invite Member**. New members receive a temporary password and must connect to the shared backend instance (same `DATABASE_URL`). See [DOCUMENTATION/TraceLMs Cloud/TraceLMs_Cloud_Developer_Setup_Guide.docx](DOCUMENTATION/TraceLMs%20Cloud/TraceLMs_Cloud_Developer_Setup_Guide.docx) for the full onboarding walkthrough.

---

## Version

**v0.1.0** — released 2026-06-24. See [Releases](https://github.com/ArielCesarMA/tracelms-cloud/releases) for changelog.

---

## License

Internal use only. Not licensed for public distribution.
