# TraceLMs Cloud — Technical Document
## Version 0.1.0 · Released 2026-06-24

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [System Architecture](#3-system-architecture)
4. [Feature Inventory](#4-feature-inventory)
5. [Module Documentation](#5-module-documentation)
6. [Data Flow](#6-data-flow)
7. [AI Processing Pipeline](#7-ai-processing-pipeline)
8. [Database Overview](#8-database-overview)
9. [API Overview](#9-api-overview)
10. [Security Overview](#10-security-overview)
11. [UI/UX Overview](#11-uiux-overview)
12. [Known Limitations](#12-known-limitations)
13. [Technical Debt](#13-technical-debt)
14. [Risks](#14-risks)
15. [Assumptions](#15-assumptions)
16. [Dependencies](#16-dependencies)
17. [Gap Analysis](#17-gap-analysis)
18. [SaaS Roadmap](#18-saas-roadmap)
19. [Recommendations](#19-recommendations)
20. [Technical Debt Register](#20-technical-debt-register)
21. [Product Backlog](#21-product-backlog)
22. [Next Sprint Suggestions](#22-next-sprint-suggestions)

---

## 1. Executive Summary

TraceLMs Cloud is a web-based, AI-powered test case generation platform. It is the SaaS port of the TraceLM VS Code extension. The application converts software requirements — entered as free text, uploaded as documents, or pulled directly from Jira — into structured, Xray-ready test cases using large language models from four providers: OpenAI, Anthropic, Google Gemini, and Groq.

As of v0.1.0 (released 2026-06-24), the core AI generation pipeline is fully implemented and functional. The application successfully streams requirement enhancement, scenario generation, test case generation, and automation candidate analysis to the browser via Server-Sent Events. Test cases can be pushed to Jira/Xray via their REST APIs with batch processing, rate limiting, retry logic, and duplicate deduplication.

The application is in an early-release, single-tenant, configuration-only state. It has no authentication system, no multi-tenancy, no persistent generation history (the Generation model exists in the schema but is not written to), and no billing infrastructure. It is appropriate for use as a development/staging tool by a single team with direct server access. It is not yet production-ready for multi-user SaaS deployment.

---

## 2. Product Vision

### Problem Statement

Software quality engineers and QA leads spend significant time manually translating business requirements into test scenarios and Xray test cases. This process is:
- Slow — a skilled QA engineer writes 5–15 test cases per hour
- Inconsistent — coverage varies by author, experience level, and time pressure
- Disconnected — requirements in Jira are rarely linked to the test cases they generate
- Unmaintained — test suites drift as requirements change

### Target Users

- **QA Engineers and Test Leads** who own test case authorship in Jira/Xray projects
- **Software Development Teams** that use Jira and Xray as their test management layer
- **Product Managers and Business Analysts** who want to validate requirement coverage before development begins

### Value Proposition

TraceLMs Cloud reduces test case authoring time from hours to minutes by using LLMs to generate a complete set of scenarios, test cases, and automation feasibility analysis from raw requirements. The output is pushed directly to Xray, maintaining traceability between requirements and tests.

---

## 3. System Architecture

### Overview

TraceLMs Cloud uses a two-process architecture: an Express 4 backend and a React 18 SPA, communicating exclusively via HTTP fetch and Server-Sent Events (SSE). There is no WebSocket layer and no shared memory — all state lives in the browser's React state and is restored from `localStorage` on page load.

```
┌─────────────────────────────────────────────────────┐
│  Browser (React 18 SPA)                             │
│  ├── App.tsx         — root state, ref layer        │
│  ├── useTraceLMMessages.ts — all async actions      │
│  ├── api/client.ts   — typed HTTP + SSE client      │
│  └── tabs/*.tsx      — one file per sidebar tab     │
│                                                     │
│  Transport: fetch (POST) + ReadableStream (SSE)     │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP :3000
┌──────────────────▼──────────────────────────────────┐
│  Express 4 Backend (Node.js 20)                     │
│  ├── src/server.ts          — app entry, CORS       │
│  ├── src/routes/generate.ts — SSE generation        │
│  ├── src/routes/settings.ts — settings CRUD         │
│  ├── src/routes/jira.ts     — Jira issue fetch      │
│  ├── src/routes/parse.ts    — document parsing      │
│  ├── src/routes/xray.ts     — Xray push/preview     │
│  ├── src/services/llm/      — LLM provider layer    │
│  ├── src/services/jira/     — Jira + Xray REST      │
│  ├── src/services/document/ — file parser           │
│  ├── src/services/storage/  — push history          │
│  └── src/utils/             — encryption, fingerprint│
│                                                     │
│  Database: Supabase (PostgreSQL) via Prisma 5       │
└─────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | React | 18.3.1 |
| Frontend build | Vite | 5.3.1 |
| Frontend language | TypeScript | 5.5.2 |
| Backend runtime | Node.js | 20+ |
| Backend framework | Express | 4.x |
| Backend language | TypeScript | 5.5.x |
| Backend build | esbuild | 0.23.x |
| ORM | Prisma | 5.22.x |
| Database | PostgreSQL (Supabase) | — |
| LLM: OpenAI | openai SDK | latest |
| LLM: Anthropic | @anthropic-ai/sdk | latest |
| LLM: Gemini | @google/generative-ai | latest |
| LLM: Groq | openai-compatible | latest |
| Encryption | Node.js crypto (AES-256-GCM) | built-in |
| Document parsing | mammoth (docx), pdf-parse (pdf) | latest |
| Test runner | Jest | 29.5.x |
| Testing library | @testing-library/react | 16.3.x |
| Linter | ESLint | 9.x |

### SSE Streaming Protocol

All generation endpoints have a streaming variant. The wire protocol is:

```
data: {"type":"started"}\n\n
data: {"type":"chunk","text":"...","chars":N}\n\n   (0..N times)
data: {"type":"batch","current":K,"total":N}\n\n   (automation only)
data: {"type":"done","result":{...}}\n\n
data: {"type":"error","message":"..."}\n\n
```

The frontend uses `fetch` with `res.body.getReader()` to consume the stream. The backend uses `res.write()` to push events. The 5-minute idle timeout (`IDLE_MS = 300_000`) is managed per-provider.

### CORS Policy

The backend restricts CORS to `localhost:5173` (Vite dev) and `localhost:3000` (same-origin in production). No external origins are permitted.

### Socket Timeout

The Express server socket timeout is set to 11 minutes (`660_000ms`), exceeding the maximum possible 5-minute provider timeout. This prevents Nginx/Node.js from closing long-running SSE streams.

---

## 4. Feature Inventory

| Feature | Status | Notes |
|---|---|---|
| Free-text requirement input | **Complete** | Textarea with character count |
| Document upload and parsing | **Complete** | .txt, .md, .docx, .pdf supported |
| Jira issue pull (single, multiple, epic, multi-story) | **Complete** | 4 pull modes implemented |
| Jira story search | **Complete** | Text search via JQL |
| Requirement enhancement (AI) | **Complete** | SSE streaming, 6 output dimensions |
| Scenario generation (AI) | **Complete** | SSE streaming |
| Test case generation (AI) | **Complete** | SSE streaming |
| Automation analysis (AI) | **Complete** | SSE streaming + batching |
| Generate All (parallel DAG) | **Complete** | Phase 1 parallel, phases 2–3 sequential |
| Per-step retry button on failure | **Complete** | Fails at step, shows contextual retry |
| Xray push (batch + retry) | **Complete** | BatchProcessor with rate limiting |
| Xray push preview (dry-run) | **Complete** | Shows valid/duplicate/validation-error |
| Duplicate deduplication | **Complete** | SHA-256 fingerprint via PushHistoryStore |
| Xray history clear | **Complete** | Clears in-memory push history |
| CSV export | **Complete** | Test cases downloadable as CSV |
| JSON export | **Complete** | All artifacts exportable as JSON |
| Settings persistence | **Complete** | localStorage (browser session) |
| LLM connection test | **Complete** | Sends "Reply with exactly: OK" probe |
| Jira connectivity test | **Complete** | Calls /rest/api/3/myself |
| API key masking | **Complete** | Backend never returns plaintext keys |
| AES-256-GCM encryption at rest | **Complete** | All API keys encrypted in DB |
| LLM provider registry (DB) | **Partial** | Schema + seed exists; UI reads static list only |
| Projects tab | **Partial** | UI tab exists; no backend CRUD routes |
| Generation history persistence | **Partial** | Schema exists; backend does not write to Generation table |
| Stakeholder management | **Partial** | Schema exists; no UI or routes |
| Authentication / login | **Missing** | No auth layer of any kind |
| Multi-tenancy | **Missing** | Single-user only |
| Role-based access control | **Missing** | — |
| Billing / subscription | **Missing** | — |
| Audit logs | **Missing** | — |
| Email notifications | **Missing** | — |
| Requirement version history | **Missing** | — |
| Test case editing in UI | **Missing** | Read-only display only |
| Prompt management UI | **Missing** | Prompts are static files |
| Custom LLM provider add (UI) | **Missing** | LLMProvider schema ready; no UI CRUD |

---

## 5. Module Documentation

### Backend — `src/`

#### `src/server.ts`
Express application entry point. Loads `dotenv`, initialises CORS (restricted to localhost), sets JSON body limit to 50MB, socket timeout to 11 minutes, mounts five route groups, serves the static frontend from `frontend/dist`, and exposes a `/api/health` endpoint. All unhandled promise rejections are logged and result in a 500 response.

#### `src/routes/generate.ts`
The largest and most critical backend file. Implements ten route handlers: five non-streaming (POST) and five SSE streaming variants for enhancement, scenarios, test cases, automation, and an automation streaming route. Contains `extractJson` (3-strategy JSON parser that handles fenced code blocks, raw JSON, and partial extraction), `callLLM`, `callLLMStream`, `openSse`, and the automation batching system (`AUTOMATION_BATCH_SIZE = 15`, `chunkArray`, `mergeAutomationResults`, `runAutomationBatched`). All async handlers are wrapped in `wrap()` to propagate rejections to Express error middleware.

#### `src/routes/settings.ts`
Four routes: `GET /api/settings` (loads and masks secrets), `POST /api/settings` (saves with encrypted field preservation), `POST /api/settings/test-llm` (LLM connection probe), `POST /api/settings/test-jira` (calls `/rest/api/3/myself`). Secret masking: `llmApiKey`, `jiraApiToken`, `xrayClientSecret` are returned as `••••••••`. If the frontend sends that mask back on POST, the original encrypted value is preserved.

#### `src/routes/xray.ts`
Three routes: `POST /api/xray/push` (full push with dedup), `POST /api/xray/preview` (dry-run validation), `POST /api/xray/clear-history`. Uses `BatchProcessor` for rate limiting and `PushHistoryStore` for fingerprint-based deduplication. Supports `retryOnlyIds` for selective retry of failed pushes.

#### `src/routes/parse.ts`
Single route `POST /api/parse`. Accepts an array of `UploadedFilePayload` objects (base64-encoded file content with MIME type). Delegates to `DocumentParser`, returns `combinedText` (all parsed files joined) and per-file results.

#### `src/routes/jira.ts`
Two routes: `POST /api/jira/search` (JQL story search) and `POST /api/jira/pull` (four modes: `single`, `multiple`, `epic`, `multiStory`). Returns `issues[]` and `combinedText` for injection into the requirement textarea.

#### `src/services/llm/LLMService.ts`
Factory dispatcher. Constructs the correct provider (`OpenAIProvider`, `AnthropicProvider`, `GeminiProvider`, `GroqProvider`) based on `LLMProviderName`. Exposes `complete()` and `stream()`.

#### `src/services/llm/*Provider.ts`
One file per provider, each implementing the `LLMProvider` interface. Groq uses the OpenAI SDK pointed at Groq's base URL (OpenAI-compatible). Gemini uses the REST API directly (SDK was incompatible with `thinkingConfig` + `systemInstruction` in earlier builds — resolved in v0.0.5 of TraceLM VS Code). Each provider implements a `IDLE_MS = 300_000` timeout.

#### `src/services/llm/timeoutUtil.ts`
Calculates dynamic timeout per provider based on tokens-per-second (TPS) estimates. Prevents premature timeout on slow models.

#### `src/services/jira/JiraXrayService.ts`
Full Jira and Xray REST client. Implements: `getIssue`, `getIssues`, `getEpicChildren`, `searchStories`, `validateTestCase`, `pushManualTestCasesDetailed`. Handles Xray OAuth2 token exchange (client credentials flow) and Basic Auth for Jira.

#### `src/services/jira/BatchProcessor.ts`
Processes test cases in configurable batches with delay between batches and retry logic. Default config: batch size 10, delay 1000ms, max retries 3.

#### `src/services/document/DocumentParser.ts`
Parses uploaded files from base64 payloads. `.txt` and `.md` decoded from base64. `.docx` via `mammoth.extractRawText()`. `.pdf` via `pdf-parse`. Returns per-file `{ name, text, error? }`.

#### `src/services/storage/PushHistoryStore.ts`
In-memory key-value store (not persisted to DB or disk). Keys are SHA-256 fingerprints generated by `fingerprintUtil`. Stores `{ fingerprint, key, url, pushedAt }` per pushed test case. Resets on server restart.

#### `src/utils/encryption.ts`
AES-256-GCM implementation using Node.js `crypto`. `encrypt(plaintext)` returns `iv:authTag:ciphertext` (hex-encoded, colon-delimited). `decrypt()` reverses it. Key is sourced from `ENCRYPTION_KEY` environment variable (minimum 32 characters).

#### `src/utils/fingerprintUtil.ts`
Generates deterministic fingerprints from test case content (title, steps, expected result, gherkin). Uses SHA-256. Identical test cases generate the same fingerprint, enabling dedup across pushes.

#### `src/db/prisma.ts`
Exports a `PrismaClient` singleton. Used by `SettingsService` only (the only active DB consumer in v0.1.0).

#### `src/types/index.ts`
Backend shared types: `LLMProviderName` union, `TraceLMSettings`, `LLMRequest`, `LLMResponse`, `StreamChunkHandler`.

#### `src/types/pdf-parse.d.ts`
Manual type declaration for `pdf-parse` (no `@types` package exists on npm). Added in v0.1.0 CI fix.

#### `src/prompts/`
LLM system prompts as plain `.txt` files: `requirement-enhancement.txt`, `scenario-generation.txt`, `test-case-generation.txt`, `automation-analysis.txt`. Loaded at runtime via `fs.readFileSync`. Validated by `npm run validate:prompts`.

---

### Frontend — `frontend/src/`

#### `App.tsx`
Root component. Owns all React state (~25 `useState` calls) and a ref layer (~10 `useRef` calls for stable closure reads). Mounts the sidebar, renders the active tab, and wires all callbacks. Instantiates `useTraceLMMessages` with refs and setters. Implements `clearAll` callback that resets all generation state. Implements `activeTab` navigation and the stepper indicator.

#### `hooks/useTraceLMMessages.ts`
The core action layer — the web equivalent of `TraceLMPanel.ts` in the VS Code extension. All async operations (save settings, test LLM, test Jira, parse files, search/pull Jira, generate individual steps, generate all, push to Xray, preview Xray, retry, clear history) are implemented here as `useCallback` functions. The `generateAll` function implements the DAG: Enhancement + Scenarios run in `Promise.all` (Phase 1), followed sequentially by Test Cases (Phase 2) and Automation (Phase 3). Settings are persisted to and restored from `localStorage`.

#### `api/client.ts`
Typed HTTP and SSE client. `post<T>()` handles JSON fetch with error extraction. `streamPost<T>()` consumes SSE via `fetch` + `ReadableStream`, fires `onProgress` callbacks for `chunk` and `batch` events, and resolves on `done`. Exports typed functions for every backend endpoint.

#### `frontend/src/types.ts`
All frontend types: `Settings`, `ParsedFile`, `JiraIssueSummary`, `UploadDraft`, `JiraMode`, `TabKey`, `RequirementEnhancement`, `ScenarioItem`, `TestCaseItem`, `AutomationCandidateItem`, `AutomationAnalysis`, `XrayPushedIssue`, `XrayPushPreview`, `XrayPushProgress`. Also exports `defaultSettings`, `emptyEnhancement`, `llmModelsByProvider`, and `getProviderModels`.

#### `tabs/RequirementsTab.tsx`
Three requirement input sources as cards: Requirement Editor (free-text), File Upload Parsing (.txt/.md/.docx/.pdf), Pull from Jira (4 modes). Top-right header action zone with Clear All (ghost button + inline confirm guard) and Save & New (disabled placeholder). Generation CTA footer with review gate checkbox beside Generate All Artifacts button.

#### `tabs/EnhancementTab.tsx`
Displays the `RequirementEnhancement` result across six categories: Missing Functional, Missing Non-Functional, Best Practices, Market Benchmark, Risks, Clarifying Questions. Generate Enhancement button with SSE progress feedback.

#### `tabs/ScenariosTab.tsx`
Displays `ScenarioItem[]` with type badges (HP/AF/EC/EG/BR), priority, preconditions, flow steps, and expected outcome. Generate Scenarios button.

#### `tabs/TestCasesTab.tsx`
Displays `TestCaseItem[]` with Gherkin, steps, expected result, test data, layer, and priority. Per-item copy. Generate Test Cases button. CSV and JSON export.

#### `tabs/AutomationTab.tsx`
Displays `AutomationAnalysis` with per-item feasibility, ROI score, Playwright automatable flag, layer, and priority. Summary section. Recommended order list. Analyze Automation button.

#### `tabs/SettingsTab.tsx`
LLM settings (provider, model, API key), Jira settings (URL, project key, email, API token), and Xray settings (client ID, secret, batch size, delay, max retries). Save Settings, Test LLM Connection, Test Jira/Xray Connection buttons.

#### `tabs/LLMProvidersTab.tsx`
Displays the list of LLM providers and their models. UI exists; no backend CRUD routes are wired — the tab is a read-only display backed by the static `llmModelsByProvider` constant in `types.ts`, not the database `LLMProvider` table.

#### `tabs/ProjectsTab.tsx`
Projects management tab. UI exists; no backend CRUD routes are implemented. The Prisma `Project` and `Stakeholder` models exist in the schema but are not used.

#### `tabs/OutputTab.tsx`
Export hub. Allows downloading all generated artifacts (enhancement, scenarios, test cases, automation) as JSON or CSV.

#### `tabs/GuideTab.tsx`
User guide / onboarding content explaining the 5-step workflow.

#### `components/`
- `ErrorBoundary.tsx` — React error boundary wrapping App
- `StepStepper.tsx` — Visual progress stepper for Generate All phases
- `CopyButton.tsx` — Copy-to-clipboard utility
- `Tip.tsx` — Contextual tooltip/tip component

#### `frontend/src/styles.css`
Full design system as CSS custom properties. Key tokens: `--accent`, `--radius-md`, `--radius-full`, `--space-*` (4px scale), `--text-*` (font sizes), `--surface-*` (background layers), `--border`, `--sidebar-w: 220px`. All buttons inherit the global `button` rule (`border-radius: var(--radius-md)`, `padding: 8px 16px`). Responsive breakpoints at 700px (narrow mode) and 540px (icon-only sidebar).

---

## 6. Data Flow

### Requirement to Xray — End-to-End

```
1. User enters requirements
   └── Free text in Requirement Editor
   └── File upload → POST /api/parse → DocumentParser → base64 decode → mammoth/pdf-parse → text appended
   └── Jira pull → POST /api/jira/pull → JiraXrayService.getIssue(s)/getEpicChildren → text appended

2. User clicks "Generate All Artifacts"
   └── App.tsx → useTraceLMMessages.generateAll()
   └── Phase 1 (parallel):
       ├── streamPost('/generate/enhancement/stream', {requirements, settings})
       │   └── backend: loadPrompt('requirement-enhancement.txt') + callLLMStream → SSE chunks → extractJson
       └── streamPost('/generate/scenarios/stream', {requirements, settings})
           └── backend: loadPrompt('scenario-generation.txt') + callLLMStream → SSE chunks → extractJson
   └── Phase 2 (sequential after Phase 1):
       └── streamPost('/generate/testcases/stream', {scenarios, settings})
           └── backend: loadPrompt('test-case-generation.txt') + callLLMStream → SSE chunks → extractJson
   └── Phase 3 (sequential after Phase 2):
       └── streamPost('/generate/automation/stream', {requirements, enhancement, scenarios, testCases, settings})
           └── backend: chunkArray(testCases, 15) → parallel batch calls → mergeAutomationResults → SSE

3. Each SSE stream:
   └── frontend: fetch → ReadableStream → decoder → buffer → parse "data: {...}" lines
   └── chunk events → setFeedback with char count
   └── done event → setState with parsed result

4. User clicks "Push to Xray"
   └── POST /api/xray/push
   └── backend: validate each test case → buildTestCaseFingerprint → check PushHistoryStore
   └── BatchProcessor.processBatchesWithDelay → JiraXrayService.pushManualTestCasesDetailed
   └── On success: PushHistoryStore.put(fingerprint, {key, url, pushedAt})
   └── Response: {pushed: [{localId, success, key, url, message}]}
```

### Settings Flow

```
App loads → useTraceLMMessages useEffect → localStorage.getItem('tracelms-settings') → setSettings
User changes settings → React state update
User clicks Save → localStorage.setItem('tracelms-settings', JSON.stringify(settings))
Each API call sends settings in request body → backend uses them directly (stateless)
Jira/Xray test → POST /api/settings/test-jira → loads current settings from DB + merges → validates
```

Note: Settings are sent with every API call because the backend is stateless — there is no server-side session. The database `Settings` table is used only by `GET /api/settings` and `POST /api/settings` (the settings tab load/save flow). The generation routes receive settings in the request body directly.

---

## 7. AI Processing Pipeline

The generation pipeline consists of five steps, three of which run in phases:

### Step 1 — Requirement Enhancement

- **Prompt**: `src/prompts/requirement-enhancement.txt`
- **Input**: Raw requirements text
- **Output**: `RequirementEnhancement` JSON with six arrays: `missingFunctional`, `missingNonFunctional`, `bestPractices`, `marketBenchmark`, `risks`, `clarifyingQuestions`
- **Streaming**: Yes (SSE chunks, resolved on `done`)
- **Runs in**: Phase 1 (parallel with Scenarios)

### Step 2 — Scenario Generation

- **Prompt**: `src/prompts/scenario-generation.txt`
- **Input**: Requirements text. Enhancement is optional — when running in Generate All, scenarios start from requirements only (prompt handles the absent enhancement case). When run individually, current enhancement state is passed.
- **Output**: `ScenarioItem[]` with type (HP/AF/EC/EG/BR), priority, preconditions, flow, expected outcome
- **Streaming**: Yes (SSE chunks)
- **Runs in**: Phase 1 (parallel with Enhancement)

### Step 3 — Test Case Generation

- **Prompt**: `src/prompts/test-case-generation.txt`
- **Input**: `ScenarioItem[]`
- **Output**: `TestCaseItem[]` with Gherkin, steps, expected result, test data, layer, priority
- **Streaming**: Yes (SSE chunks)
- **Runs in**: Phase 2 (sequential, after Phase 1 completes)

### Step 4 — Automation Analysis

- **Prompt**: `src/prompts/automation-analysis.txt`
- **Input**: Requirements, Enhancement, Scenarios, TestCases (all four)
- **Output**: `AutomationAnalysis` with `summary`, `recommendedOrder[]`, `items[]` (feasibility, ROI, Playwright scope per test case)
- **Streaming**: Yes (SSE + batch progress events)
- **Batching**: `AUTOMATION_BATCH_SIZE = 15`. Large test case sets are split and run in parallel batches; results merged with `mergeAutomationResults`. Batch progress emitted as `{"type":"batch","current":K,"total":N}`.
- **Runs in**: Phase 3 (sequential, after Phase 2 completes)

### Phase Dependency Graph

```
Requirements Text
      │
      ├──────────────────┐  (Phase 1: Promise.all)
      ▼                  ▼
Enhancement         Scenarios
      │                  │
      └──────────┬───────┘
                 │  (Phase 2: sequential)
                 ▼
           Test Cases
                 │
                 │  (Phase 3: sequential)
                 ▼
        Automation Analysis
```

### JSON Extraction Strategy

The `extractJson()` function in `generate.ts` uses three fallback strategies:
1. Extract content inside ` ```json ``` ` or ` ``` ``` ` fenced code blocks
2. Parse the entire response as JSON
3. Find the first `{` or `[` and parse from that position

If all three fail, a descriptive error is thrown with a response preview, guiding the user to check prompt files or try a different model.

---

## 8. Database Overview

Database: PostgreSQL hosted on Supabase, accessed via Prisma 5 session pooler.

### Models

#### `Settings`
Single-row table (`id = 'global'`). Stores global connection settings for LLM, Jira, and Xray. Sensitive fields stored encrypted: `llmApiKeyEnc`, `jiraApiTokenEnc`, `xrayClientSecEnc`. Three Xray batch control fields: `xrayBatchSize` (default 10), `xrayBatchDelayMs` (default 1000), `xrayMaxRetries` (default 3).

#### `LLMProvider`
Extensible provider registry. Four built-in providers seeded via `prisma/seed.ts` (Gemini, OpenAI, Anthropic, Groq). Supports `baseUrl`, `authHeader`, `compatibility` (openai/anthropic/gemini/custom), and per-provider API key encryption. `isBuiltIn = true` prevents deletion. **Status: seeded but not actively consumed by any route in v0.1.0 — the frontend uses the static `llmModelsByProvider` constant.**

#### `LLMModel`
Child of `LLMProvider`. Stores `modelId`, `displayLabel`, `isDefault`. Unique constraint on `[providerId, modelId]`. **Status: seeded but not actively consumed in v0.1.0.**

#### `Project`
Named project with `key` (mirrors Jira project key), `status` (DRAFT/ACTIVE/ARCHIVED), `owner` email, and relations to `Stakeholder[]` and `Generation[]`. **Status: schema only, no routes implemented.**

#### `Stakeholder`
Email-keyed collaborator attached to a Project. Role field (e.g. "QA Lead", "Product Owner"). **Status: schema only, no routes or UI wired.**

#### `Generation`
Stores a full generation run: `requirementText`, `llmProvider`, `llmModel`, `status` (IN_PROGRESS/COMPLETED/FAILED/PARTIAL), and JSON blobs for `enhancement`, `scenarios`, `testCases`, `automation`. Optionally linked to a `Project`. **Status: schema only — the backend does not write to this table in v0.1.0. Generation results are lost on browser refresh.**

### Relationships

```
Project ──< Stakeholder   (cascade delete)
Project ──< Generation    (optional; nullable projectId)
LLMProvider ──< LLMModel  (cascade delete)
```

### Active Database Usage in v0.1.0

Only `SettingsService.ts` reads/writes to the database (`Settings` table via Prisma). Everything else is either in-memory (`PushHistoryStore`) or in `localStorage` (settings, generation state).

---

## 9. API Overview

All routes are mounted under `/api` prefix. No authentication middleware exists on any route.

### Settings

| Method | Route | Description |
|---|---|---|
| GET | `/api/settings` | Load global settings; API keys returned as `••••••••` |
| POST | `/api/settings` | Save settings; masked values preserved from DB |
| POST | `/api/settings/test-llm` | Probe LLM provider connectivity |
| POST | `/api/settings/test-jira` | Call `/rest/api/3/myself` to verify Jira credentials |

### Generation (non-streaming)

| Method | Route | Description |
|---|---|---|
| POST | `/api/generate/enhancement` | Generate requirement enhancement (blocking) |
| POST | `/api/generate/scenarios` | Generate scenarios (blocking) |
| POST | `/api/generate/testcases` | Generate test cases (blocking) |
| POST | `/api/generate/automation` | Automation analysis with batching (blocking) |

### Generation (SSE streaming)

| Method | Route | Description |
|---|---|---|
| POST | `/api/generate/enhancement/stream` | Stream enhancement chunks via SSE |
| POST | `/api/generate/scenarios/stream` | Stream scenario chunks via SSE |
| POST | `/api/generate/testcases/stream` | Stream test case chunks via SSE |
| POST | `/api/generate/automation/stream` | Stream automation chunks + batch events via SSE |

### Document Parsing

| Method | Route | Description |
|---|---|---|
| POST | `/api/parse` | Parse uploaded files (base64 payloads) |

### Jira

| Method | Route | Description |
|---|---|---|
| POST | `/api/jira/search` | Search Jira stories by query |
| POST | `/api/jira/pull` | Pull Jira issues (single/multiple/epic/multiStory) |

### Xray

| Method | Route | Description |
|---|---|---|
| POST | `/api/xray/push` | Push test cases to Xray with batch + dedup |
| POST | `/api/xray/preview` | Dry-run push to preview validation/duplicate status |
| POST | `/api/xray/clear-history` | Clear in-memory push history |

### System

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Health check |

**Auth requirement: None.** No route is protected by authentication or API key validation in v0.1.0.

---

## 10. Security Overview

### Implemented

- **AES-256-GCM encryption at rest** — `llmApiKey`, `jiraApiToken`, `xrayClientSecret` are encrypted before DB storage. Encryption key sourced from `ENCRYPTION_KEY` env var (minimum 32 characters required).
- **API key masking** — `GET /api/settings` returns `••••••••` instead of plaintext secrets. If the masked value is sent back on `POST /api/settings`, the backend preserves the original encrypted value.
- **CORS restriction** — Only `localhost:5173` and `localhost:3000` are permitted.
- **`.env` in `.gitignore`** — `DATABASE_URL` and `ENCRYPTION_KEY` are never committed.
- **No plaintext secrets in logs** — LLM provider names and test results logged; API key values are never logged.
- **Body size limit** — 50MB JSON limit on Express to prevent trivial payload attacks.

### Missing / Not Implemented

- **No authentication** — Any request to any route is accepted. A network-adjacent attacker who can reach port 3000 has full access.
- **No authorization / RBAC** — No concept of users, roles, or permissions.
- **No rate limiting** — The Express server has no rate limiter. An attacker could exhaust LLM API quotas or cause backend instability.
- **No input sanitization** — Requirement text is passed directly to LLM prompts. No length validation, injection protection, or content filtering.
- **No HTTPS enforcement** — The application runs on HTTP in development. No TLS configuration exists.
- **No CSRF protection** — No CSRF tokens or origin validation beyond CORS.
- **No secret rotation mechanism** — If `ENCRYPTION_KEY` changes, all existing encrypted values in the DB become unreadable.
- **Push history is in-memory** — `PushHistoryStore` resets on server restart. Duplicate protection is lost.
- **No audit log** — No record of who pushed what, when, or what settings were changed.

---

## 11. UI/UX Overview

### Navigation

Fixed left sidebar (`--sidebar-w: 220px`). Ten navigation tabs:

| Tab | Key | Purpose |
|---|---|---|
| Requirements | `requirements` | Input entry point |
| Enhancement | `enhancement` | AI-analyzed gaps and risks |
| Scenarios | `scenarios` | Generated test scenarios |
| Test Cases | `testCases` | Generated Xray-ready test cases |
| Automation | `automation` | Automation feasibility analysis |
| Integrations | `integrations` | LLM + Jira + Xray settings |
| LLM Providers | `llm-providers` | Provider registry (read-only) |
| Projects | `projects` | Project management (placeholder) |
| Output | `output` | Export all artifacts |
| Guide | `guide` | Usage documentation |

### Design System

All styling uses CSS custom properties defined in `styles.css`:

- **Colors**: `--accent` (primary brand), `--surface-1/2/3` (layered backgrounds), `--text-primary/secondary`, `--border`
- **Spacing**: `--space-1` through `--space-8` (4px scale)
- **Radius**: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`
- **Typography**: `--text-xs` through `--text-2xl`

### Button System

All buttons inherit the global `button` rule: `border-radius: var(--radius-md)`, `padding: 8px 16px`. Variants differ only in background, border, and text color — never in shape. This ensures visual consistency across all interactive elements.

### Key UX Patterns

- **Inline confirm guard** — Destructive actions (Clear All) show an inline confirmation strip with animation before executing
- **Review gate** — "Requirements reviewed and ready" checkbox beside Generate All Artifacts gates generation, providing visual confirmation
- **SSE progress feedback** — All generation actions update a feedback label with char count and phase information in real time
- **Per-step failure recovery** — Generate All tracks which phase failed and shows a contextual retry button for that specific step
- **Source cards with numbered badges** — The three requirement input sources are visually separated as numbered cards (1, 2, 3)
- **Responsive sidebar** — Collapses to narrow mode at 700px, icon-only at 540px

### Known UX Gaps

- Test cases are read-only — users cannot edit generated content in the browser
- No visual stepper for individual steps (only Generate All has a stepper)
- Projects and LLM Providers tabs are non-functional (placeholder UI)
- No empty-state illustrations — blank tabs show no guidance when data is absent

---

## 12. Known Limitations

1. **No authentication** — Any user who can access port 3000 has full control of all settings and generation.
2. **Single-tenant** — All users share the same `Settings` row in the database. Concurrent users will overwrite each other's settings.
3. **Generation state lost on refresh** — The `Generation` table is not written to. Browser refresh clears all generated artifacts.
4. **Push history resets on server restart** — `PushHistoryStore` is in-memory. Duplicate detection is lost after restart.
5. **Settings persistence is per-browser** — `localStorage` is used. Settings are not shared across browsers or devices.
6. **LLM API key stored in DB** — Encrypted, but the key resides in Supabase. If `ENCRYPTION_KEY` is compromised, all stored keys are exposed.
7. **No request cancellation** — Long-running SSE streams cannot be cancelled by the user once started.
8. **Automation batching is parallel** — Batch SSE streams run in `Promise.all`, so chunk events from different batches interleave in the frontend feedback.
9. **`vercel.json` deploys frontend only** — The Express backend is not deployable to Vercel. A separate hosting solution (Railway, Render, EC2, etc.) is required for production.

---

## 13. Technical Debt

1. **`App.tsx` is large** — ~45KB single file holding all UI state, ref layer, navigation, and tab routing. Should be split into context providers and a smaller root component.
2. **`generate.ts` is large** — ~470 lines. The automation batching logic could be extracted to a service class.
3. **Settings sent on every API call** — The stateless design simplifies architecture but sends API keys (plaintext, in the request body) on every generation request. At scale, this increases exposure surface.
4. **`LLMProvider` table is not used** — A well-designed schema exists for extensible provider management, but all routes still use the static `llmModelsByProvider` constant.
5. **No integration tests** — Test coverage is unit-only (Jest). No tests verify the full request-response cycle through Express routes.
6. **`PushHistoryStore` is not persistent** — In-memory storage for a deduplication system is fragile. Should be moved to the `Generation` table or a dedicated table.
7. **Duplicate `Settings` types** — Backend uses `AppSettings` (in `SettingsService.ts`) and `TraceLMSettings` (in `src/types/index.ts`). Frontend uses its own `Settings` type. Three slightly different shapes for the same entity.
8. **No streaming cancellation** — The SSE stream has no abort mechanism. If the user navigates away mid-generation, the server continues running the LLM call.

---

## 14. Risks

| Risk | Severity | Likelihood | Impact |
|---|---|---|---|
| LLM timeout on large documents | High | Medium | Generation fails silently; user sees no partial results |
| `ENCRYPTION_KEY` loss | Critical | Low | All encrypted values in DB become permanently unreadable |
| Supabase connection limit | Medium | Medium | Session pooler limits concurrent connections; fails under load |
| LLM provider API cost overrun | Medium | High | No rate limiting; unrestricted generation calls |
| No auth means open attack surface | Critical | High | Any network access yields full control |
| Server restart loses push history | Medium | High | Duplicate test cases re-pushed on any restart |
| JSON parsing failure on LLM output | Medium | Medium | LLM returns valid text but not valid JSON; extractJson fails |
| Frontend state loss on refresh | High | High | All generated artifacts disappear without server-side persistence |

---

## 15. Assumptions

1. The application runs on a single trusted machine (developer laptop or private server) with no external network exposure.
2. A single user operates the tool at any given time.
3. `ENCRYPTION_KEY` is at least 32 characters and is stored securely outside the repository.
4. `DATABASE_URL` points to a Supabase session pooler connection string.
5. LLM API keys are valid and have sufficient quota for generation runs.
6. Jira Cloud (not Server) is the target Jira deployment.
7. Xray Cloud (not Server) is the target Xray deployment, using the OAuth2 client credentials flow.
8. The frontend is served as a static build from `frontend/dist` by the Express server in production.

---

## 16. Dependencies

### Critical External Services

| Service | Purpose | Criticality | Notes |
|---|---|---|---|
| Supabase | PostgreSQL database | Critical | Required for settings persistence; generation is degraded without it |
| LLM provider (1 of 4) | AI generation | Required | At least one of OpenAI/Anthropic/Gemini/Groq must be configured |
| Jira Cloud | Requirement pull + test push | Optional | Generation works without Jira; push to Xray requires it |
| Xray Cloud | Test case push destination | Optional | Push requires Xray OAuth2 credentials |

### npm Dependencies (Backend)

| Package | Purpose |
|---|---|
| express | HTTP server and routing |
| cors | CORS middleware |
| dotenv | Environment variable loading |
| @prisma/client | Database ORM |
| openai | OpenAI + Groq provider |
| @anthropic-ai/sdk | Anthropic provider |
| @google/generative-ai | Gemini provider |
| mammoth | .docx parsing |
| pdf-parse | .pdf parsing |
| docx | (listed; not confirmed used in v0.1.0) |
| pptxgenjs | (listed; not confirmed used in v0.1.0) |

### npm Dependencies (Frontend)

| Package | Purpose |
|---|---|
| react, react-dom | UI framework |
| vite | Build + dev server |
| typescript | Type checking |
| @testing-library/react | Component testing |
| jest | Test runner |

---

## 17. Gap Analysis

### Core Functionality Gaps

1. **Generation results are not persisted** — The `Generation` model is fully designed but never written to. Every browser refresh loses all generated content. This is the single most impactful UX gap.
2. **Test case editing** — Users cannot correct AI-generated test case text in the browser. Any errors require re-generation.
3. **Prompt management** — System prompts are static files. Changing prompt behavior requires a backend deploy.

### SaaS Infrastructure Gaps

4. **No authentication** — Blocking gap for any multi-user or externally accessible deployment.
5. **No multi-tenancy** — All data (settings, push history) is shared. Multiple users corrupt each other's state.
6. **No billing** — Cannot charge for usage, enforce quotas, or track cost per user.
7. **No audit log** — No record of what was generated, by whom, or when.
8. **No email/notification system** — Stakeholder review workflows (designed in schema) cannot be notified.

### Scalability Concerns

9. **In-memory push history** — Resets on restart; cannot scale across multiple backend instances.
10. **Stateless settings design** — Sending settings (including API keys) on every request is workable at low scale but increases attack surface and payload size.
11. **No queue for long-running generation** — Under concurrent load, all generation runs compete for LLM API rate limits with no queuing or prioritization.

### Security Gaps

12. **No rate limiting** — Open to quota exhaustion attacks.
13. **No input validation** — Requirements text length is unchecked; a malicious prompt could influence LLM output.
14. **No HTTPS enforcement** — All traffic (including API keys in request bodies) is unencrypted in transit.

### UX Friction

15. **No empty-state guidance** — Tabs with no data show blank content with no call-to-action.
16. **No cancellation** — Users cannot stop a generation mid-stream.
17. **Projects/LLM Providers tabs are dead** — They appear in the sidebar but do nothing, which is confusing.

---

## 18. SaaS Roadmap

The phases below are derived from the gap analysis above, ordered by value delivered and dependency chain.

---

### Phase 1 — Persistence & Reliability (Weeks 1–3)

The most impactful gap: generated content is lost on refresh. Fixing this transforms the tool from a demo into a usable product.

**Deliverables:**
- Write to `Generation` table on `generateAll` completion (backend `generate.ts` → Prisma)
- Load last generation on page load (GET `/api/generation/latest`)
- Persist `PushHistoryStore` to the database (new `PushRecord` model or extend `Generation`)
- Remove dead Projects/LLM Providers tabs from sidebar (or stub with "Coming Soon" banner)

**Why first:** Every other feature builds on persisted state. Without this, no other UX improvement matters — users lose their work on every refresh.

---

### Phase 2 — Authentication & Single-User Security (Weeks 3–5)

Adds basic protection before any external network exposure.

**Deliverables:**
- Simple email/password auth with bcrypt + JWT (no third-party auth provider required at this stage)
- Middleware protecting all `/api` routes
- Login page (minimal React component)
- HTTPS enforcement via reverse proxy configuration (Nginx or Caddy)
- Rate limiting middleware (express-rate-limit, per-IP and per-user)
- Input validation for requirement text (max length, sanitization)

**Why second:** Auth is a prerequisite for every subsequent SaaS feature (multi-tenancy, billing, audit). A minimal email/password system ships quickly and protects the application from open access.

---

### Phase 3 — Multi-Tenancy & Project Management (Weeks 5–9)

Activates the existing `Project`, `Stakeholder`, and `Generation` schema for real use.

**Deliverables:**
- User model in Prisma; foreign keys on `Project` and `Generation`
- Project CRUD routes (`/api/projects`) and working Projects tab UI
- Generation history per project (list + detail view)
- Settings scoped per user (replace single-row `Settings` with per-user settings)
- Stakeholder invite and role assignment UI

**Why third:** The schema for this already exists. Activating it with proper auth in place (Phase 2) turns TraceLMs Cloud from a single-person tool into a team tool.

---

### Phase 4 — AI Quality & Prompt Management (Weeks 9–12)

Improves generation quality and makes prompts manageable without code deploys.

**Deliverables:**
- Prompt management UI — view and edit system prompts from the browser (stored in DB, not files)
- Per-project prompt customization (override default prompts for a specific project)
- Test case editing — allow users to edit generated test case content inline before pushing
- Generation feedback loop — thumbs up/down per test case to fine-tune prompt behavior over time
- Model scoring — track which LLM provider + model produces the best results for this team's requirements

**Why fourth:** Once users have persistent history (Phase 1) and can collaborate (Phase 3), the next lever is output quality. Prompt control and inline editing are the two highest-friction remaining QA workflow gaps.

---

### Phase 5 — Market Differentiators (Weeks 12+)

Features that create meaningful competitive advantage in the AI-powered QA tooling market.

**1. Bi-directional Requirement Traceability**
Link generated test cases back to specific requirement clauses or Jira story sections. When a requirement changes, surface which test cases are stale. This is the gap that generic test management tools cannot fill — it requires understanding the AI-generated connection between requirement text and test outcomes.

**2. Regression Impact Analysis**
Given a new requirement or a diff between two requirement versions, automatically identify which existing test cases still cover the changed behavior and which are invalidated. Output a suggested "regression test run" targeted to the change.

**3. Stakeholder-Driven Approval Workflow**
Activate the `Stakeholder` model: notify stakeholders by email when a generation is complete, allow them to approve or comment on individual test cases in a lightweight review UI before Xray push. This closes the QA-PM-Dev triad loop that currently requires Jira comments or meetings.

**4. LLM Cost Analytics Dashboard**
Track tokens used and estimated cost per generation run, per project, per provider. Surface cost-vs-quality tradeoffs across providers. This positions TraceLMs Cloud as the only AI test generation tool that actively helps teams manage their LLM spend.

**5. Requirement Quality Score**
Before generation, analyze the submitted requirements and produce a quality score (completeness, ambiguity, testability). Display specific suggestions for improving the requirements themselves, not just generating tests from them. This positions the tool upstream of QA — in the requirements authoring phase.

---

## 19. Recommendations

### R1 — Persist Generation Results Immediately

**Business value:** Users lose all work on browser refresh. Fixing this is the difference between a demo and a product.
**Technical complexity:** Low. The `Generation` model and Prisma client exist. Requires one `prisma.generation.create()` call at `generateAll` completion and one `GET /api/generation/latest` route.
**Estimated effort:** Small (1–2 days)
**Priority:** High
**Dependencies:** None
**Risks:** If `projectId` is required, need to create a default project first.
**Expected user impact:** Zero rework after accidental browser close. Sessions feel persistent and trustworthy.

---

### R2 — Add Authentication Before Any Network Exposure

**Business value:** Without auth, the application is open to anyone who can reach port 3000. LLM API keys in the DB are at risk.
**Technical complexity:** Medium. Requires a User model, bcrypt hashing, JWT issuance/validation, an auth middleware, a login page, and localStorage token storage.
**Estimated effort:** Medium (1 week)
**Priority:** High
**Dependencies:** Must be implemented before any public URL is shared.
**Risks:** JWT secret management; refresh token handling for long sessions.
**Expected user impact:** Secure access with email/password login.

---

### R3 — Add HTTPS via Reverse Proxy

**Business value:** API keys travel in request bodies on every generation call. Without TLS, they are plaintext on the wire.
**Technical complexity:** Low. Nginx or Caddy with Let's Encrypt handles this without application code changes.
**Estimated effort:** Small (hours, infrastructure only)
**Priority:** High
**Dependencies:** Requires a domain name and server with public IP.
**Risks:** Certificate renewal automation must be configured.
**Expected user impact:** All traffic encrypted in transit.

---

### R4 — Persist Push History to Database

**Business value:** Duplicate detection resets on every server restart, causing test cases to be re-pushed to Xray.
**Technical complexity:** Low. Replace `PushHistoryStore` in-memory map with a Prisma model (`PushRecord` or a field on `Generation`).
**Estimated effort:** Small (1 day)
**Priority:** Medium
**Dependencies:** R1 (persistent generation) is a natural companion.
**Risks:** None significant.
**Expected user impact:** Deduplication survives server restarts and deployments.

---

### R5 — Activate Test Case Editing

**Business value:** AI output is not always perfect. Users currently have no way to correct a generated test case without re-running generation.
**Technical complexity:** Medium. Requires replacing read-only display components with editable fields and wiring state updates back to the test case array.
**Estimated effort:** Medium (3–5 days)
**Priority:** Medium
**Dependencies:** R1 (persistence needed for edits to survive refresh).
**Risks:** UI complexity — editing Gherkin in a textarea vs. a structured editor.
**Expected user impact:** Reduces rework. Users can accept 90% of output and fix the remaining 10% without full regeneration.

---

### R6 — Add Rate Limiting

**Business value:** Protects LLM API quotas from abuse and prevents backend instability under load.
**Technical complexity:** Low. `express-rate-limit` is a drop-in middleware.
**Estimated effort:** Small (hours)
**Priority:** High
**Dependencies:** None
**Risks:** Misconfigured limits could block legitimate heavy users.
**Expected user impact:** Invisible when not triggered; prevents runaway costs.

---

### R7 — Remove Placeholder Tabs Until Functional

**Business value:** Projects and LLM Providers tabs are in the sidebar but do nothing. This creates confusion and erodes trust.
**Technical complexity:** Trivial. Either remove from sidebar or add a "Coming Soon" banner.
**Estimated effort:** Small (< 1 hour)
**Priority:** High
**Dependencies:** None
**Risks:** None.
**Expected user impact:** Cleaner navigation; no dead-end clicks.

---

### R8 — Move Settings to Server-Side Session

**Business value:** Sending API keys in every request body increases exposure surface. A server-side session token would eliminate repeated key transmission.
**Technical complexity:** Medium. Requires session management (Redis or DB-backed) and session middleware.
**Estimated effort:** Medium (1 week)
**Dependencies:** R2 (auth) — sessions make most sense after login exists.
**Priority:** Medium
**Risks:** Session expiry handling; stateful backend complicates horizontal scaling.
**Expected user impact:** Invisible — improves security posture without user-visible change.

---

## 20. Technical Debt Register

| ID | Description | Location | Severity | Effort |
|---|---|---|---|---|
| TD-1 | `App.tsx` is ~45KB single file | `frontend/src/App.tsx` | Medium | Large |
| TD-2 | `generate.ts` is ~470 lines; automation batching should be a service | `src/routes/generate.ts` | Low | Medium |
| TD-3 | Three slightly different Settings type shapes | BE types, FE types, SettingsService | Low | Small |
| TD-4 | `LLMProvider` table exists but routes use static constant | `frontend/src/types.ts` | Medium | Medium |
| TD-5 | No integration tests for Express routes | `src/**/__tests__/` | Medium | Large |
| TD-6 | `PushHistoryStore` is in-memory | `src/services/storage/` | High | Small |
| TD-7 | No streaming cancellation (AbortController) | `api/client.ts`, `generate.ts` | Medium | Medium |
| TD-8 | `docx` and `pptxgenjs` in package.json — usage unconfirmed | `package.json` | Low | Small |

---

## 21. Product Backlog

Ordered by Phase from the roadmap:

### Phase 1 (Persistence)
- [ ] Write `Generation` record on `generateAll` completion
- [ ] `GET /api/generation/latest` — restore last session on load
- [ ] Persist `PushHistoryStore` to database
- [ ] Remove/stub non-functional sidebar tabs

### Phase 2 (Auth & Security)
- [ ] `User` Prisma model with email + password hash
- [ ] `POST /api/auth/login` — issue JWT
- [ ] Auth middleware for all `/api` routes
- [ ] Login page component
- [ ] `express-rate-limit` on all generate endpoints
- [ ] Input length validation on requirements text
- [ ] HTTPS reverse proxy configuration guide

### Phase 3 (Multi-Tenancy)
- [ ] Project CRUD routes + Projects tab UI
- [ ] Stakeholder invite + email notification
- [ ] Per-user settings row (replace global `id='global'`)
- [ ] Generation history list view per project

### Phase 4 (AI Quality)
- [ ] Prompt management UI — DB-stored prompts, editable in browser
- [ ] Test case inline editing before Xray push
- [ ] Per-test-case feedback (thumbs up/down)
- [ ] Per-project prompt customization

### Phase 5 (Differentiators)
- [ ] Bi-directional requirement traceability
- [ ] Regression impact analysis on requirement change
- [ ] Stakeholder approval workflow
- [ ] LLM cost analytics dashboard
- [ ] Requirement quality score pre-generation

---

## 22. Next Sprint Suggestions

Based on the current state of v0.1.0, the following tasks are recommended for the next development sprint (approximately 1 week):

### Priority 1 — Immediate Impact, Low Effort

1. **Persist generation results to the `Generation` table** — One `prisma.generation.create()` call at the end of `generateAll` in `generate.ts` (or in the routes layer). Add `GET /api/generation/latest` to restore on load. Estimated: 1–2 days.

2. **Remove non-functional sidebar tabs** — Add a `COMING_SOON` banner to Projects and LLM Providers tabs, or remove them from the `TabKey` union and sidebar rendering. Estimated: < 1 hour.

3. **Add `express-rate-limit`** — 10 requests per minute per IP on all `/api/generate/*` routes. Estimated: 2 hours.

4. **Persist push history to database** — Add a `PushRecord` Prisma model (or a JSONB field on `Settings`), replace the in-memory map, and migrate `PushHistoryStore` to write/read from DB. Estimated: 1 day.

### Priority 2 — Foundation for Next Phase

5. **Start `User` model and login route** — Even a simple email/password auth with JWT prepares the codebase for multi-tenancy and is a pre-requisite for every subsequent SaaS feature. Estimated: 3–4 days.

---

*This document was generated by the `/TraceBlueprint` skill on 2026-06-24 for TraceLMs Cloud v0.1.0.*
*Maintained as a living document — update with each release.*
