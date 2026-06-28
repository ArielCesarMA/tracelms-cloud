# Document Generation Hub
## Delivery Record — v0.5.5

**Feature Name:** Document Generation Hub
**Version:** v0.5.5
**Delivery Date:** 2026-06-27
**TDD Reference:** `Test_Plan_Strategy_Document_Hub_TDD_v0.1.docx`
**Status:** ✅ CLOSED

---

## Feature Overview

The Document Generation Hub enables users to generate formal quality documents (IEEE 829 Test Plan and Test Strategy) from any completed generation run. The LLM takes the full generation context (requirements, enhancement, scenarios, test cases, automation analysis) and produces a structured, downloadable document. Documents can be exported as Word (.docx) or printed as PDF directly from the browser.

**v0.5.5 Amendment (2026-06-27):** Added Test Strategy document type; generic `documents Json?` DB column (replaces `testPlan Json?`); document type selector segmented control; Documents tab relocated to the Generate pipeline (step 6 after Automation, pending state when automation is empty).

---

## Tasks

### T-01 — DB Migration: Add `documents` Column

**Task Title:** Add `documents` JSON column to the `Generation` model
**Task Description:** Extend the `Generation` Prisma model with a nullable `Json` field to store all generated documents by type (`test-plan`, `test-strategy`). Initially added as `testPlan Json?`, renamed to `documents Json?` in the v0.5.5 amendment to support multiple document types in one column.

| Criterion | Delivered |
|---|---|
| `documents Json?` field in `prisma/schema.prisma` (renamed from `testPlan`) | ✅ Yes — `documents` column on `Generation` model |
| Schema pushed to Supabase database | ✅ Yes — `prisma db push` succeeded twice: initial + rename |
| No breaking changes to existing schema | ✅ Yes — nullable field, backward-compatible |
| Documents stored as `{ 'test-plan'?: ..., 'test-strategy'?: ... }` | ✅ Yes — merged object per document type |
| Prisma client regeneration deferred (DLL lock) | ✅ Noted — bounded casts applied; resolves on server restart |

---

### T-02 — LLM Prompt: Test Plan Generation

**Task Title:** Create IEEE 829 test plan generation system prompt
**Task Description:** Write a structured system prompt that instructs the LLM to produce a strict JSON document following the IEEE 829 Test Plan standard. The prompt specifies all required sections, output format, and derivation rules (no invented content; derive from provided context only).

| Criterion | Delivered |
|---|---|
| Prompt file created at `src/prompts/test-plan-generation.txt` | ✅ Yes |
| Output must be valid JSON — no markdown or prose | ✅ Yes — strict JSON only instruction |
| 10-section structure per IEEE 829 | ✅ Yes — Objectives, Scope, Approach, Environment, Entry/Exit, Deliverables, Risk, TC Summary, Automation, Sign-off |
| Derives risks from enhancement analysis | ✅ Yes — section 7.1 explicitly sources from enhancement risks |
| TC summary derives from testCases payload | ✅ Yes — count, layer, priority breakdown |
| Automation section derives from automation payload | ✅ Yes — candidates, feasibility, recommended order |
| Registered in `validate:prompts` script | ✅ Yes — 5/5 prompts now validated |

---

### T-03 — Backend Endpoint: Document Generation SSE

**Task Title:** Create `/api/documents/generate` SSE endpoint
**Task Description:** Implement a new Express route (`src/routes/documents.ts`) that accepts a `generationId` and `projectName`, loads the generation from DB, builds a context-aware prompt, streams the LLM response as Server-Sent Events, and persists the parsed test plan JSON back to the `Generation` record.

| Criterion | Delivered |
|---|---|
| `src/routes/documents.ts` created | ✅ Yes |
| `POST /api/documents/generate` SSE endpoint | ✅ Yes — streams `status`, `model-info`, `chunk`, `done`, `error` events |
| `GET /api/documents/:generationId` endpoint | ✅ Yes — returns saved test plan or null |
| Auth-gated (requires valid JWT) | ✅ Yes — user-scoped via `AuthenticatedRequest` |
| LLM stream with disconnect abort | ✅ Yes — `req.on('close')` sets `aborted` flag |
| JSON extraction from accumulated LLM output | ✅ Yes — regex `\{[\s\S]*\}` extracts and parses |
| Persist parsed test plan to DB | ✅ Yes — `prisma.generation.update` with bounded cast |
| Route mounted in `server.ts` | ✅ Yes — `app.use('/api/documents', documentsRouter)` |
| Reasoning model detection (`model-info` SSE event) | ✅ Yes — uses `getModelCapabilities` |
| Build-time type errors: zero | ✅ Yes — `npm run typecheck` passes |

---

### T-04 — Frontend Client: API + SSE Wiring

**Task Title:** Add document generation client functions and type definitions
**Task Description:** Extend `frontend/src/api/client.ts` with `streamGenerateDocument()` (SSE reader for the backend document endpoint) and `fetchTestPlan()`. Add `TestPlanDocument` and related types to `frontend/src/types.ts`. Add `'documents'` to the `TabKey` union.

| Criterion | Delivered |
|---|---|
| `streamGenerateDocument()` added to `client.ts` | ✅ Yes — full SSE event reader |
| `fetchTestPlan()` added to `client.ts` | ✅ Yes — `GET /api/documents/:id` |
| `TestPlanDocument`, `TestPlanSection`, `TestPlanSubsection` types | ✅ Yes — in `frontend/src/types.ts` |
| `'documents'` added to `TabKey` union | ✅ Yes |
| `GenerationHistoryItem.hasTestPlan` optional field | ✅ Yes — backend computes from `testPlan !== null` |
| Zero frontend type errors | ✅ Yes — `typecheck:frontend` passes |

---

### T-05 — DocumentPreviewPanel (inline in DocumentsTab)

**Task Title:** Build an inline structured document preview
**Task Description:** Implement a `DocumentPreview` component within `DocumentsTab` that renders the structured `TestPlanDocument` JSON as a readable formatted document, with section headings, subsections, and a meta-information header block showing title, version, date, project, and preparer.

| Criterion | Delivered |
|---|---|
| Section headings with numbered ID prefix | ✅ Yes — `.doc-section__num` prefix badge |
| Subsections indented under parent section | ✅ Yes — `.doc-section__subsections` with margin-left |
| Meta header block (title, version, date, project, preparer) | ✅ Yes — `<dl>` grid in `.doc-preview__header` |
| Print-ready: sidebar and controls hidden in `@media print` | ✅ Yes — CSS print overrides in `styles.css` |
| Design-system tokens only — no hardcoded colors | ✅ Yes — uses `var(--accent)`, `var(--text-*)`, `var(--surface-*)` |

---

### T-06 — docxGenerator: Client-Side Word Export

**Task Title:** Implement Word document export using `docx` v9.7.1
**Task Description:** Create `frontend/src/utils/docxGenerator.ts` using the `docx` npm package (v9.7.1 per TDD spec) to generate a properly formatted Word document from the `TestPlanDocument` JSON. Export via `Packer.toBlob()` + `URL.createObjectURL()`. Document includes styled title, meta block, section headings with underlines, and subsection structure.

| Criterion | Delivered |
|---|---|
| `docx@9.7.1` installed in `frontend/` | ✅ Yes — `npm install docx@9.7.1` |
| `exportTestPlanDocx(plan)` exported from util | ✅ Yes |
| Title styled with accent color | ✅ Yes — `color: '0D9488'` (accent teal) |
| Sections as Heading 1, subsections as Heading 2 | ✅ Yes — `HeadingLevel.HEADING_1 / HEADING_2` |
| US Letter page size (12240×15840 DXA) | ✅ Yes — explicit in section properties |
| Download filename: `{ProjectName}_TestPlan_v{version}.docx` | ✅ Yes |
| Font: Calibri (Office-safe) | ✅ Yes — in styles.default |
| Zero prod vulnerabilities in frontend after install | ✅ Yes — `npm audit --omit=dev` shows 0 |

---

### T-07 — UnsavedBanner: Unsaved Document Warning

**Task Title:** Warn user when a document has been generated but not yet exported
**Task Description:** Implement an `UnsavedBanner` component that renders a yellow warning strip above the document preview when a test plan has been generated but not yet downloaded as .docx or printed as PDF. The banner is dismissed once the user exports the document via either method.

| Criterion | Delivered |
|---|---|
| Banner renders when `!isExported && testPlan !== null` | ✅ Yes |
| Banner includes Download .docx and Print / PDF quick-action buttons | ✅ Yes |
| Banner dismissed on export | ✅ Yes — `setIsExported(true)` on both actions |
| Yellow warning color (`#fefce8` background, `#fde047` border) | ✅ Yes — distinct from error red; uses amber palette |
| Does not appear on print (`@media print`) | ✅ Yes — `.doc-unsaved-banner` hidden in print CSS |

---

### T-08 — DocumentsTab + App.tsx Integration

**Task Title:** Wire up Documents tab in sidebar and main content area
**Task Description:** Create the full `DocumentsTab` component, import it into `App.tsx`, add "Documents" to the Workspace sidebar section between Projects and Output, and wire up `activeProjectId` / `activeProjectName` props for project-scoped generation filtering. The tab self-fetches its own generation history using `fetchGenerationHistory()`.

| Criterion | Delivered |
|---|---|
| `frontend/src/tabs/DocumentsTab.tsx` created | ✅ Yes |
| Self-fetching generation history (no App.tsx state added) | ✅ Yes — `useEffect` + `fetchGenerationHistory` inside tab |
| Generation selector filtered to completed runs (TC count > 0) | ✅ Yes — `completedGenerations.filter(g => g.totalTestCases > 0)` |
| Generation metadata card (TCs, scenarios, model, status) | ✅ Yes — `.doc-hub__gen-meta` below selector |
| Load Saved button for restoring persisted test plans | ✅ Yes — `fetchTestPlan()` call |
| Stream status + raw chunk preview during generation | ✅ Yes — spinner + `pre.doc-hub__stream-preview` |
| Reasoning model awareness ("Reasoning model active…" message) | ✅ Yes — `model-info` event handler |
| "Documents" sidebar entry in Workspace section | ✅ Yes — `ti-file-type-doc` icon, between Projects and Output |
| `{activeTab === 'documents'}` panel in `App.tsx` | ✅ Yes |
| ProjectsTab: doc badge in generation history row | ✅ Yes — `.proj-doc-badge` with `ti-file-type-doc` icon |
| CSS design system classes — all new classes use existing tokens | ✅ Yes — no hardcoded colors except amber warning palette |
| `npm run typecheck:all` → 0 errors | ✅ Yes |
| `npm run validate:prompts` → 5/5 pass | ✅ Yes |
| `prisma db push` → schema synced | ✅ Yes |

---

## Files Created / Modified

| File | Action | Purpose |
|---|---|---|
| `prisma/schema.prisma` | Modified | Added `testPlan Json?` to `Generation` model |
| `src/prompts/test-plan-generation.txt` | Created | IEEE 829 structured JSON prompt |
| `src/routes/documents.ts` | Created | Backend SSE + GET endpoints |
| `src/server.ts` | Modified | Mounted `documentsRouter` at `/api/documents` |
| `src/routes/generation.ts` | Modified | Added `hasTestPlan` to history response |
| `scripts/validate-prompts.cjs` | Modified | Registered `test-plan-generation.txt` |
| `frontend/src/types.ts` | Modified | Added `TestPlanDocument` types, `'documents'` TabKey, `hasTestPlan` on history item |
| `frontend/src/api/client.ts` | Modified | Added `streamGenerateDocument()`, `fetchTestPlan()` |
| `frontend/src/utils/docxGenerator.ts` | Created | Client-side `.docx` export utility |
| `frontend/src/tabs/DocumentsTab.tsx` | Created | Full Documents Hub tab UI |
| `frontend/src/tabs/ProjectsTab.tsx` | Modified | Added `hasTestPlan` doc badge in generation history |
| `frontend/src/App.tsx` | Modified | Imported DocumentsTab, added sidebar entry + tab panel |
| `frontend/src/styles.css` | Modified | Added ~200 lines of Document Hub CSS + print overrides |
| `frontend/package.json` | Modified | Added `docx@9.7.1` dependency |

---

## Quality Gate

| Check | Result |
|---|---|
| Backend type-check (`npm run typecheck`) | ✅ 0 errors |
| Frontend type-check (`npm run typecheck:frontend`) | ✅ 0 errors |
| Prompt validation (`npm run validate:prompts`) | ✅ 5/5 pass |
| DB schema push (`prisma db push`) | ✅ Synced |
| Frontend prod audit (`npm audit --omit=dev`) | ✅ 0 vulnerabilities |
| Prisma client regeneration | ⚠ Deferred (DLL lock — server running) — bounded casts applied; regenerate on server restart |

---

## Post-Deployment Steps Required

Before testing in production:

1. **Stop the dev server** (Ctrl+C in the backend terminal)
2. Run `npx prisma generate` to regenerate Prisma client with the new `testPlan` field
3. Restart the dev server: `npm run dev:watch`
4. The bounded casts in `src/routes/documents.ts` and `src/routes/generation.ts` will then be resolvable natively — remove them in the next sprint if desired (they are safe either way)

---

## Architecture Notes

- **No server-side document rendering** — DOCX is generated entirely in the browser using `docx@9.7.1` `Packer.toBlob()`. This keeps the server stateless and avoids file storage concerns.
- **PDF via `window.print()`** — Print CSS hides the app sidebar and all controls, leaving only the document preview visible. No PDF library dependency required.
- **Streaming preserved end-to-end** — The test plan generation uses the same SSE pattern as the 5 generate tabs. The JSON is extracted from the full accumulated text after streaming completes (not mid-stream), ensuring valid parse even if the LLM outputs trailing whitespace.
- **`hasTestPlan` badge** — Computed server-side in the history endpoint. Once the Prisma client is regenerated, the cast is removed and `r.testPlan !== null` works natively. The badge in ProjectsTab gives users a visual indicator without navigating to the Documents tab.

---

---

## Amendment — v0.5.5 (2026-06-27)

### A-01 — Test Strategy Document Type

**Task Title:** Add Test Strategy as a second document type
**Task Description:** Extend the hub to support a second LLM-generated document: an organization-level Test Strategy covering test levels, types, tools, metrics, defect management, and risk-based approach.

| Criterion | Delivered |
|---|---|
| `src/prompts/test-strategy-generation.txt` created | ✅ Yes — 10-section structure per industry standard |
| `documentType` parameter accepted in `POST /api/documents/generate` | ✅ Yes — routes to correct prompt |
| `documents` field stores both doc types under their `documentType` key | ✅ Yes — merge strategy; existing docs preserved |
| `TestStrategyDocument` type added to `frontend/src/types.ts` | ✅ Yes |
| `DocumentType`, `GeneratedDocument`, `GeneratedDocuments` union types added | ✅ Yes |
| `validate:prompts` → 6/6 pass | ✅ Yes |

### A-02 — Document Type Selector in DocumentsTab

**Task Title:** Add segmented control to switch between document types
**Task Description:** Add a segmented button control (Test Plan / Test Strategy) above the generation selector. Switching type clears the current preview and triggers generation/load for the selected type.

| Criterion | Delivered |
|---|---|
| `.doc-hub__type-selector` segmented control rendered | ✅ Yes — two buttons, active state highlights selection |
| Switching type clears current doc + error state | ✅ Yes |
| Generate button label reflects selected type | ✅ Yes — "Generate Test Plan (IEEE 829)" / "Generate Test Strategy" |
| Load Saved restores only the matching document type from DB | ✅ Yes — `documents?.[documentType]` lookup |
| CSS classes: `.doc-hub__type-selector`, `.doc-hub__type-btn`, `.doc-hub__type-btn.active` | ✅ Yes — in `styles.css` |

### A-03 — Sidebar Pipeline Placement

**Task Title:** Move Documents to the Generate pipeline as step 6
**Task Description:** Relocate the Documents sidebar entry from the Workspace section into the Generate pipeline, after Automation (step 5). It renders with a pending state when no automation data exists, guiding users to complete the pipeline first.

| Criterion | Delivered |
|---|---|
| Documents removed from `workspaceItems` array | ✅ Yes |
| Documents added to `generateItems` as step 6 | ✅ Yes — `{ key: 'documents', label: 'Documents', icon: 'ti-file-type-doc', isPending: !automation?.items.length }` |
| Pending state (muted + no count) when automation is empty | ✅ Yes — `isPending` flag drives `sidebar-item--pending` CSS class |
| `npm run typecheck:all` → 0 errors | ✅ Yes |

### A-04 — Rename `hasTestPlan` → `hasDocuments`

**Task Title:** Align history item badge field with generic documents column
**Task Description:** Rename `hasTestPlan` to `hasDocuments` across the backend history route, frontend types, API client, and ProjectsTab badge, reflecting that the column now stores any document type.

| Criterion | Delivered |
|---|---|
| `src/routes/generation.ts`: `hasDocuments` from `documents` field | ✅ Yes |
| `frontend/src/types.ts`: `GenerationHistoryItem.hasDocuments` | ✅ Yes |
| `frontend/src/tabs/ProjectsTab.tsx`: badge uses `hasDocuments` | ✅ Yes |

### Amendment Files Modified

| File | Action | Purpose |
|---|---|---|
| `prisma/schema.prisma` | Modified | Renamed `testPlan Json?` → `documents Json?` |
| `src/prompts/test-strategy-generation.txt` | Created | Test Strategy 10-section structured JSON prompt |
| `src/routes/documents.ts` | Modified | Accept `documentType`, route to prompt, save to `documents` field |
| `src/routes/generation.ts` | Modified | `hasDocuments` from `documents` field |
| `frontend/src/types.ts` | Modified | `TestStrategyDocument`, `DocumentType`, `GeneratedDocuments`, `hasDocuments` |
| `frontend/src/api/client.ts` | Modified | `streamGenerateDocument` with `documentType`, `fetchDocuments` |
| `frontend/src/tabs/DocumentsTab.tsx` | Modified | Type selector, updated all doc refs |
| `frontend/src/App.tsx` | Modified | Documents moved to `generateItems` as step 6 with `isPending` |
| `frontend/src/tabs/ProjectsTab.tsx` | Modified | `hasDocuments` badge |
| `frontend/src/styles.css` | Modified | `.doc-hub__type-selector` / `.doc-hub__type-btn` CSS |
| `scripts/validate-prompts.cjs` | Modified | Registered `test-strategy-generation.txt` → 6/6 |

---

*Delivery record prepared by TraceLMs Cloud Engineering · 2026-06-27*
