# Phase 1 — Persistence & Reliability

---

## Feature 1: Write Generation Record on generateAll Completion

**Task Title:** Write Generation record on generateAll completion

**Task Description:**
Add `prisma.generation.create()` call at the end of the `generateAll` flow in `generate.ts` (or routes layer). Fields: `requirementText`, `llmProvider`, `llmModel`, `status` (IN_PROGRESS → COMPLETED), `enhancement`, `scenarios`, `testCases`, `automation` (JSON blobs). Also write `status=FAILED` on any phase error.

### Delivery

| Criterion | Delivered |
|---|---|
| `prisma.generation.create()` at end of `generateAll` flow | `POST /api/generation` called from hook success path after all three phases complete |
| `requirementText`, `llmProvider`, `llmModel` | Written from live values captured in `generateAll` scope |
| `status: COMPLETED` on success | Written on success path after `onGenerateAllDone?.()` fires |
| `enhancement`, `scenarios`, `testCases`, `automation` as JSON blobs | All four fields passed to the backend; Prisma stores as `Json` columns |
| `status: FAILED` on any phase error | Written in the `catch` block with partial data sourced from live refs |
| DB write failure does not regress the UI | Both success and failure saves are fire-and-forget with silent `.catch()` |
| `totalTestCases` and `totalScenarios` derived server-side | Computed from `testCases.length` and `scenarios.length` on the backend — not trusted from the client |
| `IN_PROGRESS` at DAG start | Deferred to Phase 3 (no Generation History UI consumer exists yet — an orphan record with no cleanup path) |

### Files Changed

| File | Change |
|---|---|
| `src/routes/generation.ts` | New file — `POST /api/generation` route with Prisma write |
| `src/server.ts` | Import + `app.use('/api/generation', generationRouter)` |
| `frontend/src/api/client.ts` | `SaveGenerationPayload` type + `saveGeneration()` function |
| `frontend/src/hooks/useTraceLMMessages.ts` | `runAutomation` changed to return `AutomationAnalysis`; `saveGeneration()` called in success and catch paths of `generateAll` |

### Architectural Notes

- `generateAll` is entirely frontend-orchestrated across four separate SSE endpoints. There is no backend `generateAll` route. The `POST /api/generation` endpoint is the correct routes-layer hook point — it receives the fully assembled payload after all phases complete.
- `runAutomation` previously returned `void`. It now returns `AutomationAnalysis` so the result is capturable in `generateAll` scope without introducing a new ref.
- Only one DB write per run (not two). The `IN_PROGRESS` → `COMPLETED` lifecycle requires a Generation History UI to be meaningful; writing an `IN_PROGRESS` record now would leave permanent orphan rows on crash or tab close.

---

## Feature 2: GET /api/generation/latest — Restore Last Session on Load

**Task Title:** GET /api/generation/latest — restore last session on load

**Task Description:**
New Express route: `GET /api/generation/latest`. Returns the most recent Generation record (`ORDER BY createdAt DESC LIMIT 1`). Frontend `useTraceLMMessages` `useEffect` calls this on mount and populates all state slices (`enhancement`, `scenarios`, `testCases`, `automation`) if a record exists. Add a "Restored from last session" toast notification.

### Delivery

| Criterion | Delivered |
|---|---|
| `GET /api/generation/latest` Express route | Added to `src/routes/generation.ts` — `findFirst` with `status: 'COMPLETED'`, `orderBy: { createdAt: 'desc' }` |
| Returns most recent Generation record | Returns full record or `null`; no new `server.ts` mount needed (router already mounted) |
| Frontend `useEffect` calls on mount | Async IIFE inside the existing mount effect in `useTraceLMMessages.ts` — fires once, does not block settings restore |
| Populates `enhancement`, `scenarios`, `testCases`, `automation` | All four state slices set via setters |
| All matching refs directly assigned | `enhancementRef`, `scenariosRef`, `testCasesRef`, `requirementTextRef` all assigned directly alongside setters to prevent stale-ref on immediate Xray push |
| `requirementText` restored | `setRequirementText` + `requirementTextRef.current` both updated |
| `requirementsReviewed` set to `true` on restore | Prevents the review gate from showing on top of already-generated restored results |
| "Restored from last session" notification | `setFeedback` with test case and scenario count summary |
| Failed restore does not block app load | Entire restore block wrapped in `try/catch` with silent catch |
| Only `COMPLETED` records restored | `FAILED` partial data excluded — restoring incomplete artifacts would confuse the user |

### Files Changed

| File | Change |
|---|---|
| `src/routes/generation.ts` | `GET /latest` handler added to existing router |
| `frontend/src/api/client.ts` | `get<T>()` helper + `LatestGenerationRecord` type + `fetchLatestGeneration()` function |
| `frontend/src/hooks/useTraceLMMessages.ts` | Mount `useEffect` extended with async IIFE for generation restore |

### Architectural Notes

- `useTraceLMMessages` is mounted **once at the `App` root** — confirmed by inspection of `App.tsx`. No mount-guard (empty-state check) is required; the `useEffect` with `[]` deps fires exactly once on load.
- The "toast" requirement is fulfilled by `setFeedback` (the existing notification primitive). A full toast component (auto-dismiss, overlay, dismissible) is a Phase 1.x cross-cutting UI investment — scoping it to this single task would introduce a new component with one consumer. The feedback bar is visible on every tab and persists until the next user action.
- The `get<T>()` helper in `client.ts` mirrors the existing `post<T>()` pattern exactly — same error handling, same JSON parsing, same empty-response guard.

---

## Feature 3: GET /api/generation/history — List Past Generations

**Task Title:** GET /api/generation/history — list past generations

**Task Description:**
Route returns `Generation[]` ordered by `createdAt DESC`, limited to 20 rows. Each record includes: `id`, `requirementText` (first 120 chars), `llmProvider`, `llmModel`, `status`, `createdAt`. Used by the future Generation History UI (Phase 3). Wire now so the data is available without a migration later.

### Delivery

| Criterion | Delivered |
|---|---|
| `GET /api/generation/history` Express route | Added to `src/routes/generation.ts` using `findMany` with `select`, `orderBy: { createdAt: 'desc' }`, `take: 20` |
| Returns up to 20 records | Hard limit of 20 via Prisma `take: 20`; comment marks expansion point for Phase 3 cursor pagination |
| `requirementText` truncated to 120 chars | Sliced in route handler with `…` appended when truncated; field renamed `requirementPreview` in response |
| `id`, `llmProvider`, `llmModel`, `status`, `createdAt` | All five fields returned via Prisma `select` |
| JSON blob columns excluded | `enhancement`, `scenarios`, `testCases`, `automation` explicitly omitted from `select` — never fetched for a list endpoint |
| All statuses included | No `where` filter — COMPLETED and FAILED records both appear; Phase 3 UI renders status badges |
| `requirementPreview` naming | Field renamed from `requirementText` to make the 120-char truncation contract explicit at the type level |
| Frontend API client wired | `GenerationHistorySummary` type + `fetchGenerationHistory()` function added to `client.ts` |
| No hook or UI wiring | Phase 3 History UI will call `fetchGenerationHistory()` directly — hook grows only when a consumer exists |

### Files Changed

| File | Change |
|---|---|
| `src/routes/generation.ts` | `GET /history` handler added to existing router |
| `frontend/src/api/client.ts` | `GenerationHistorySummary` type + `fetchGenerationHistory()` function |

### Architectural Notes

- `select` is mandatory on this endpoint. The `enhancement`, `scenarios`, `testCases`, and `automation` columns are `Json` fields that can each be hundreds of kilobytes. Fetching all four for 20 records to discard them would pull up to 40MB from the database on every history load. Only the six display fields are selected.
- Truncation is performed in the route handler (`.slice(0, 120)`) rather than via `prisma.$queryRaw`. Raw SQL would break Prisma's type safety and require manual parameterization. For 20 rows the overhead of fetching the full `requirementText` and slicing in JS is negligible.
- The field is named `requirementPreview` (not `requirementText`) in the response shape. `GET /api/generation/latest` returns the full `requirementText`; using the same field name with a different length contract would create a silent inconsistency. The `GenerationHistorySummary` type makes the distinction enforceable at compile time.
- A `// Phase 3: add cursor/offset pagination when History UI lands` comment is placed in the route, marking the correct expansion point without prematurely building infrastructure for a UI that does not yet exist.

---

## Feature 4: Add PushRecord Prisma Model

**Feature:** Push History Persistence

**Task Title:** Add PushRecord Prisma model

**Task Description:**
New model `PushRecord`: `id` (cuid), `fingerprint` (String @unique), `xrayKey` (String), `xrayUrl` (String), `pushedAt` (DateTime), `generationId` (String?, FK to Generation). Run `prisma migrate dev`. Seed nothing — table starts empty.

### Delivery

| Criterion | Delivered |
|---|---|
| `PushRecord` model added to schema | Added to `prisma/schema.prisma` with all specified fields |
| `id` as cuid primary key | `@id @default(cuid())` |
| `fingerprint` as unique dedup key | `String @unique` — enforces deduplication at the DB level |
| `xrayKey` and `xrayUrl` | `String` (non-nullable) — only successful pushes are recorded |
| `pushedAt` as DateTime | `DateTime @default(now())` — default added; task spec omitted it but intent is unambiguous |
| `generationId` as optional FK to Generation | `String?` with `Generation?` relation, `onDelete: SetNull` |
| `onDelete: SetNull` on FK | Push dedup history survives generation deletion — prevents re-push of already-pushed test cases |
| Back-relation on `Generation` | `pushRecords PushRecord[]` added — required by Prisma for relation declaration |
| Index on `generationId` | `@@index([generationId])` — free at schema time; avoids future migration for Phase 3 "pushes by generation" query |
| Migration executed | `20260625061414_add_push_record` applied — database in sync with schema |
| Seed unchanged | Table starts empty as specified |
| `PushHistoryStore.ts` unchanged | File-based store remains active; service migration to DB is a separate task |

### Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | `PushRecord` model added; `pushRecords PushRecord[]` back-relation added to `Generation` |
| `prisma/migrations/20260625061414_add_push_record/migration.sql` | Generated and applied by `prisma migrate dev --name add_push_record` |

### Architectural Notes

- `pushedAt` was given `@default(now())` even though the task spec omitted it. The existing `PushHistoryStore.put()` already defaults to `new Date().toISOString()` when absent, confirming the intent. Without the default, every `prisma.pushRecord.create()` call would require an explicit `pushedAt` — a runtime footgun with no benefit.
- `onDelete: SetNull` was chosen over `Cascade`. Push records are independent audit/dedup entries — their deduplication value persists beyond the generation that created them. `Cascade` would delete push history when a generation is deleted, potentially allowing a previously-pushed test case to be re-pushed to Xray.
- `@@index([generationId])` is included at schema time because the Phase 3 History UI will query "all push records for this generation." Adding the index later would require a separate migration and a full table scan until it lands.
- The Prisma Client DLL regeneration produced an `EPERM` error on Windows because the dev server held the old engine file open. The migration itself applied cleanly — the DB is fully in sync. The client regenerates correctly on the next server restart.
- `PushHistoryStore.ts` (flat-file JSON store) is intentionally untouched. Migrating the service from file to DB is a separate task with its own test coverage requirements.

---

## Feature 5: Migrate PushHistoryStore from File to DB

**Feature:** Push History Persistence

**Task Title:** Migrate PushHistoryStore from in-memory to DB

**Task Description:**
Replace the in-memory Map in `PushHistoryStore.ts` with Prisma calls: `put()` → `prisma.pushRecord.upsert(where: {fingerprint}, ...)`. `has()` → `prisma.pushRecord.findUnique()`. `getAll()` → `prisma.pushRecord.findMany()`. `clear()` → `prisma.pushRecord.deleteMany()`. Keep the public interface identical so no callers need to change.

### Delivery

| Criterion | Delivered |
|---|---|
| `put()` → Prisma upsert | `prisma.pushRecord.upsert({ where: { fingerprint }, create: {...}, update: {...} })` |
| `getAll()` → Prisma findMany | `prisma.pushRecord.findMany()` reduced to `Record<string, XrayPushRecord>` |
| `get()` → Prisma findUnique | `prisma.pushRecord.findUnique({ where: { fingerprint } })` with null→undefined mapping |
| `clear()` → Prisma deleteMany | `prisma.pushRecord.deleteMany({})` |
| `putBatch()` → Prisma transaction | `prisma.$transaction([...upserts])` — atomic batch, all-or-nothing |
| `getStats()` → Prisma aggregates | `Promise.all([count, findFirst asc, findFirst desc])` — single round trip |
| `fs` dependency removed | No file system imports — `.push-history.json` no longer written or read |
| `trim()` / `MAX_RECORDS` removed | DB handles scale natively; 5000-record cap was a flat-file limitation only |
| `xray.ts` call sites updated | 4 `await` additions: `getAll()` ×2, `put()` ×1, `clear()` ×1 |
| `clear-history` route hardened | Converted from plain handler to `wrap(async ...)` — async errors now propagate to global error middleware |
| Tests rewritten with Prisma mock | `jest.mock('fs', ...)` replaced with `jest.mock('../../../db/prisma', ...)`; all 5 tests pass |
| `has()` from task spec | Not added — no caller exists; `get()` is a superset (returns record or undefined) |

### Files Changed

| File | Change |
|---|---|
| `src/services/storage/PushHistoryStore.ts` | Full rewrite — `fs` replaced with Prisma; all methods made `async`; `trim()` / `MAX_RECORDS` removed |
| `src/routes/xray.ts` | 4 `await` additions at call sites; `clear-history` handler converted to `wrap(async ...)` |
| `src/services/storage/__tests__/PushHistoryStore.test.ts` | Full rewrite — `fs` mock replaced with typed Prisma mock; 2 tests added (unknown fingerprint, getAll shape); all 5 pass |

### Architectural Notes

- **Sync vs async interface**: Prisma calls are inherently async — "keep the interface identical" cannot be honoured literally without introducing a write-through cache with a startup race condition (a silent dedup bypass window on every server restart). The correct resolution is making methods `async` and adding `await` at call sites. Four `await` additions in `xray.ts` is the correct cost of moving to an async data source; the alternative risks duplicate Xray issues after a server restart.
- **`has()` not implemented**: The task spec lists `has() → prisma.pushRecord.findUnique()`. The current codebase has no `has()` method and no caller that would use one. `get()` returns `XrayPushRecord | undefined` — a superset of a boolean. Adding `has()` with no consumer would be dead code.
- **`trim()` removed**: The 5000-record `MAX_RECORDS` cap existed because an unbounded in-memory dictionary plus synchronous file writes becomes slow. A Postgres table with an indexed `fingerprint` column handles millions of records efficiently. The cap was a flat-file implementation detail, not a domain rule.
- **`putBatch()` uses `$transaction`**: Individual upserts in a loop would create N round trips. A Prisma interactive transaction wraps all upserts into one atomic operation — if any upsert fails, none are committed.
- **`clear-history` route**: Previously `(_req, res) => { pushHistory.clear(); res.json(...) }` — a plain synchronous handler that swallowed the async `clear()` Promise silently. Converted to `wrap(async (_req, res) => { await pushHistory.clear(); ... })` so any DB error propagates to the global error middleware instead of hanging the response.

---

## Feature 6: Add 'Coming Soon' Banner to Projects and LLM Providers Tabs

**Feature:** UX Cleanup — Dead Tabs

**Task Title:** Add 'Coming Soon' banner to Projects and LLM Providers tabs

**Task Description:**
Replace the empty tab bodies in `ProjectsTab.tsx` and `LLMProvidersTab.tsx` with a centered banner: icon + heading 'This feature is coming soon' + optional timeline hint. Use existing `--surface-2`, `--text-secondary` tokens. Do NOT remove the tabs from the sidebar — their slot is reserved for Phase 3 (Projects) and Phase 4 (LLM Providers).

### Delivery

| Criterion | Delivered |
|---|---|
| `ProjectsTab` body replaced with banner | Verbose bullet list and schema note removed; `ComingSoonBanner` renders icon + heading + Phase 3 timeline hint |
| `LLMProvidersTab` banner added | Live provider table preserved; `coming-soon-note` replaced with `ComingSoonBanner` for custom provider section |
| Heading: "This feature is coming soon" | Rendered as `<h3>` inside `ComingSoonBanner` — consistent hierarchy across both tabs |
| Timeline hint for Projects | "Planned for Phase 3 — Projects & Multi-tenancy" |
| Timeline hint for LLM Providers | "Custom provider management planned for Phase 4 — LLM Provider Management" |
| `--surface-2` and `--text-secondary` tokens used | Applied via existing `.coming-soon-block` and `.coming-soon-note-text` CSS classes — no new styles added |
| Tabs remain in sidebar | Neither tab removed from sidebar nav; slots reserved for Phase 3 and Phase 4 |
| Shared `ComingSoonBanner` component extracted | `frontend/src/components/ComingSoonBanner.tsx` — single deletion point when features ship |
| No new CSS | Existing `.coming-soon-block`, `.coming-soon-icon-lg`, `.coming-soon-note-text` classes reused exactly |
| `LLMProvidersTab` provider table kept | Live reference data (4 providers, URLs, models, free tier, status) retained — removing it would be a UX regression |

### Files Changed

| File | Change |
|---|---|
| `frontend/src/components/ComingSoonBanner.tsx` | New component — `icon`, `hint?` props; renders `.coming-soon-block` structure |
| `frontend/src/tabs/ProjectsTab.tsx` | Bullet list and schema note removed; `ComingSoonBanner` inserted |
| `frontend/src/tabs/LLMProvidersTab.tsx` | `coming-soon-note` div replaced with `ComingSoonBanner`; provider table unchanged |

### Architectural Notes

- **`ComingSoonBanner` is extracted as a shared component** rather than inlined in each tab. When Phase 3 and Phase 4 ship, removal is a single import deletion per tab — no hunting across files for ad-hoc JSX. This is the direct application of the future-proof layout principle.
- **`LLMProvidersTab` kept the provider table** (partial replacement, not full). The table answers a question users have immediately: "Which providers can I use?" It is live reference data, not a placeholder. Full replacement would delete useful content and require rebuilding it in Phase 4 from scratch. The two-zone layout (table = what works today, banner = what's coming) requires zero redesign when the custom provider form lands.
- **No new CSS written**. The existing `.coming-soon-block` (centered column, `--surface-2` background, `--radius-lg` border, `--space-4` padding), `.coming-soon-icon-lg` (40px opacity-0.5 icon), and `.coming-soon-note-text` (italic `--text-muted` hint) classes in `styles.css` cover the full spec. Extending the system — not duplicating it.
- **Icon format follows existing pattern** (emoji, rendered inside `.coming-soon-icon-lg`). Switching to SVG would be a design-system-level decision applicable to all coming-soon states at once, not scoped to this task.

---

## Feature 7: Add Empty-State Illustrations to Blank Generation Tabs

**Feature:** UX Cleanup — Dead Tabs

**Task Title:** Add empty-state illustrations to blank generation tabs

**Task Description:**
Enhancement, Scenarios, TestCases, Automation tabs show blank content before generation. Add an empty-state component: icon + heading + sub-text ('Run generation to see results here'). Use the existing `Tip.tsx` component pattern. Consistent with the design system — no new tokens required.

### Delivery

| Criterion | Delivered |
|---|---|
| Empty-state shown in Enhancement tab | `<EmptyState icon="🔍" title="No Enhancement Analysis Yet" .../>` — replaces inline block |
| Empty-state shown in Scenarios tab | `<EmptyState icon="📋" title="No Test Scenarios Yet" .../>` — replaces inline block |
| Empty-state shown in TestCases tab | `<EmptyState icon="🧪" title="No Test Cases Yet" .../>` — replaces inline block |
| Empty-state shown in Automation tab | `<EmptyState icon="🤖" title="No Automation Analysis Yet" .../>` — replaces inline block |
| Shared `EmptyState` component extracted | `frontend/src/components/EmptyState.tsx` — `icon`, `title`, `action`, `tip?` props; mirrors `Tip.tsx` pattern |
| No new CSS tokens | All classes (`empty-state`, `empty-state-icon`, `empty-state-title`, `empty-state-action`, `empty-state-tip`) already existed in `styles.css` |
| Zero visual change | Rendering is pixel-identical before and after — pure structural extraction |
| Per-tab specific action text preserved | Tab-specific messages kept over generic spec text — each tells the user exactly what button to press and which step comes first |
| `tip?` is optional | Prop is optional; component renders without it — forward-compatible if a future tab needs no tip |

### Files Changed

| File | Change |
|---|---|
| `frontend/src/components/EmptyState.tsx` | New component — `icon`, `title`, `action`, `tip?` props |
| `frontend/src/tabs/EnhancementTab.tsx` | Inline `div.empty-state` block replaced with `<EmptyState>` |
| `frontend/src/tabs/ScenariosTab.tsx` | Inline `div.empty-state` block replaced with `<EmptyState>` |
| `frontend/src/tabs/TestCasesTab.tsx` | Inline `div.empty-state` block replaced with `<EmptyState>` |
| `frontend/src/tabs/AutomationTab.tsx` | Inline `div.empty-state` block replaced with `<EmptyState>`; stale closing `</div>` removed |

### Architectural Notes

- **All four tabs already had empty states** when this task was implemented — the task description was written before the inline blocks were added. The deliverable shifted from "add empty states" to "extract to a shared component" — the correct engineering move regardless.
- **`EmptyState` is not wrapped in `memo`**. It is a stateless presentational leaf — `memo` adds reconciliation overhead with no benefit when the component has no expensive children and props change whenever the parent re-renders anyway. Mirrors the `Tip.tsx` pattern exactly.
- **Per-tab action text is preserved** over the task spec's generic `'Run generation to see results here'`. Specific messages pass the affordance test — a first-time user knows exactly what button to press and which step prerequisite applies. Generic text does not.
- **Single deletion point** — when a tab gains real content, removing `<EmptyState>` is one line. Any future empty-state style change (e.g., swap emoji for SVG icons) is made in one file rather than four.
