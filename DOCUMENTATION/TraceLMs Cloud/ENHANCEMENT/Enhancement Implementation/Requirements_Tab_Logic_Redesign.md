# Requirements Tab Logic Redesign

**Feature Name:** Requirements Tab Logic Redesign  
**TDD Version:** v1.13  
**Delivery Date:** 2026-06-26  
**Last Updated:** 2026-06-26 (Post-delivery amendments: taxonomy expansion, prompt upgrade, UX relocations, fixed action bar)  
**Status:** CLOSED

---

## T-01 — Type System Extension

**Task Description:** Extend `frontend/src/types.ts` with the `ExtractedRequirement` type and supporting union types (`RequirementType`, `IssueType`, `RequirementPriority`). Augment `JiraIssueSummary` with `issueType?` and `priority?`.

**Criterion:** All downstream components and hooks can import `ExtractedRequirement` without compiler errors.

**Delivered:**
- Added `RequirementType` (10-value union), `IssueType`, `RequirementPriority` types
- Added `ExtractedRequirement` type with 8 fields: `reqId`, `summary`, `description`, `issueType`, `requirementType`, `priority`, `source`, `lowConfidence?`
- Extended `JiraIssueSummary` with `issueType?` and `priority?`
- `npm run typecheck:all` passes clean

---

## T-02 — Backend Extraction Pipeline

**Task Description:** Create the LLM extraction prompt, extend `DocumentParser` for new file types (.xlsx, .xls, .csv, .pptx), extend `JiraXrayService` to fetch issue type and priority, and add the `/api/generate/extract-requirements/stream` SSE endpoint.

**Criterion:** The endpoint streams `{ type: 'row', row: ExtractedRequirement }` events as the LLM produces NDJSON output; `DocumentParser` handles all 8 accepted file types.

**Delivered:**
- Created `src/prompts/requirement-extraction.txt` — NDJSON structured output prompt with classification rules for `issueType`, `requirementType`, `priority`, `lowConfidence`
- Extended `DocumentParser.ts`: added `parseSpreadsheet()` (.xlsx/.xls, multi-sheet with `=== Sheet: "Name" ===` separators), `parseCsv()`, `parsePptx()` (jszip-based async parser extracting `<a:t>` tags)
- Installed `xlsx` (SheetJS) for spreadsheet parsing; used `jszip` (already installed) for PPTX zip extraction
- Extended `JiraXrayService.getIssue()` and `searchByJql()` to request and map `issuetype` and `priority` fields; added `JIRA_PRIORITY_MAP` (Highest→Critical, High→High, Medium→Medium, Low/Lowest→Low)
- Added `POST /api/generate/extract-requirements/stream` — NDJSON line-buffer parser, emits `row` events as valid JSON lines arrive, emits `done` with total count

---

## T-03 — RequirementTable Component

**Task Description:** Create `frontend/src/components/RequirementTable.tsx` — a 6-column editable table (Req ID, Summary, Description, Issue Type, Requirement Type, Priority) with sticky columns, row detail panel, undo toast, and source badge chips.

**Criterion:** Component renders `ExtractedRequirement[]`, supports inline editing, emits `onUpdate` / `onDelete`, shows undo toast on delete with 5-second timer, shows Row Detail Panel slide-up for full description editing.

**Delivered:**
- `RequirementTable.tsx`: 6-column table (Req ID sticky `left:0`, Summary sticky `left:96px`, Description 1-line preview, Issue Type select, Requirement Type optgroup select, Priority colored select)
- Click-to-edit Summary inline input; Escape closes; Enter commits
- Row Detail Panel: slide-up ~200px panel for full description editing, closes on outside click or Escape
- Undo toast: 5-second timer via `undoTimerRef`, re-inserts at original index via `__undo__` marker
- Source badge chips: `upload` (teal/accent), `jira` (blue)
- `lowConfidence` `?` badge on Issue Type cell
- `(default)` italic marker for jira source + Functional type
- Priority colored selects: Critical=red, High=amber, Low=muted
- Full CSS block added to `styles.css`: `.req-table-*`, `.req-source-chip-*`, `.req-priority--*`, `.req-detail-panel`, `.req-undo-toast`, card layout media queries for <540px

---

## T-04 — State & Hook Wiring

**Task Description:** Add `buildRequirementsPayload()` to `frontend/src/utils.ts`; add `streamExtractRequirements()` to `frontend/src/api/client.ts`; update `useTraceLMMessages.ts` to use SSE extraction and map Jira issues to `ExtractedRequirement[]`; update `App.tsx` state model.

**Criterion:** `parseSelectedFiles` triggers SSE extraction and incrementally populates `uploadedRequirements[]`; `pullFromJira` maps issues to `ExtractedRequirement[]`; `buildRequirementsPayload` serializes both tables + instructions into the generation payload.

**Delivered:**
- `buildRequirementsPayload(uploadedReqs, jiraReqs, instructions)` in `utils.ts` — serializes as structured plain-text with `=== Uploaded/Jira Requirements ===` sections
- `streamExtractRequirements()` in `api/client.ts` — SSE client for the new endpoint, emits `row` events via `onRow` callback
- `useTraceLMMessages`: rewrote `parseSelectedFiles` (parse → extract SSE → incremental setUploadedRequirements), rewrote `pullFromJira` (issues → ExtractedRequirement[] via mapping)
- `App.tsx`: added `uploadedRequirements`, `jiraRequirements`, `instructionText` state + refs; useEffect syncs `requirementText` from `buildRequirementsPayload` when new-style state is populated; added `handleRequirementUpdate/Delete`, `handleJiraRequirementUpdate/Delete` (with `__undo__` re-insert support); updated `clearAll`

---

## T-05 — RequirementsTab Rebuild

**Task Description:** Rebuild `frontend/src/tabs/RequirementsTab.tsx` — remove Section 1 textarea; add file drop zone (accept attribute enforced, drop handler filters by extension); Extract button with adaptive label; two independent `RequirementTable` instances; collapsible Generation Context panel; updated Generate All guard.

**Criterion:** Section 1 textarea is removed; file drop zone accepts only `.txt,.md,.docx,.pdf,.xlsx,.xls,.csv,.pptx`; Extract button shows "Extract Requirements" / "Re-extract" / "Parsing…" / "Extracting…" adaptively; Generate All disabled when both tables are empty.

**Delivered:**
- Section 1 textarea removed entirely
- Drop zone with `accept=".txt,.md,.docx,.pdf,.xlsx,.xls,.csv,.pptx"`, drag-over handler filters dropped files by extension (`.ppt`, images, etc. silently ignored)
- Browse file input with same `accept` attribute — OS file picker shows only valid types
- Extract button: adaptive label (`Extract Requirements` / `Re-extract` / `Parsing…` / `Extracting…`)
- `RequirementTable` for `uploadedRequirements[]` (Section 1) and `jiraRequirements[]` (Section 2) — two independent instances
- Collapsible Generation Context panel above Generate All — `instructionText` textarea with indicator dot when instructions are set
- Generate All disabled when both `uploadedRequirements` and `jiraRequirements` are empty
- Drop zone CSS added to `styles.css`: `.req-dropzone`, `.req-dropzone-inner`, `.req-browse-btn`, `.req-gen-context*`, `.req-extract-progress`

---

## T-06 — Test Coverage Update

**Task Description:** Update `frontend/src/tabs/__tests__/RequirementsTab.test.tsx` to match the new prop API and assert new behaviors (6-column table headers, source badge, Extract button label states, jira badge).

**Criterion:** All tests pass; `requirementText`/`parsedFiles`/`uploadDrafts`/`pulledIssues` props removed from `baseProps`; assertions cover table columns, source chips, and extract label transitions.

**Delivered:**
- `baseProps` updated: removed `requirementText`, `parsedFiles`, `pulledIssues`, `onRequirementTextChange`; added `uploadedRequirements`, `jiraRequirements`, `instructionText`, `onInstructionTextChange`, `onRequirementUpdate`, `onRequirementDelete`, `onJiraRequirementUpdate`, `onJiraRequirementDelete`
- New tests: 6-column header assertion, source badge `upload`/`jira`, Extract label "Extract Requirements" / "Re-extract", jira requirement table rendering
- Legacy tests retained: renders, Generate All button, file chip, feedback, stepper

---

## T-07 — Typecheck & Dependencies

**Task Description:** Install `xlsx` for backend DocumentParser; verify `XLSX.zip` API and switch to `jszip` if needed; run `npm run typecheck:all` and resolve all errors.

**Criterion:** `npm run typecheck:all` passes with zero errors.

**Delivered:**
- Installed `xlsx` (SheetJS) via `npm install xlsx --save` for backend DocumentParser spreadsheet/CSV parsing
- Replaced `XLSX.zip.read()` (non-public API) with `jszip` (`JSZip.loadAsync()`) for PPTX parsing — jszip was already installed as a transitive dependency
- `parsePptx()` converted to `async` method; call site updated with `await`
- `npm run typecheck:all` → **0 errors** (backend + frontend)

---

## Architecture Upgrades

| Upgrade | Decision | Status |
|---|---|---|
| NDJSON structured output | LLM instructed to emit one JSON object per line; line-buffer parser on SSE stream; eliminates extractJson() 3-strategy fallback | Delivered |
| SSE streaming as default for extraction | `/extract-requirements/stream` uses SSE; rows append to table incrementally as LLM produces them | Delivered |
| Settings model capability check | `callLLMStream` used for extraction; respects provider/model settings already in `settingsRef` | Delivered |

---

---

## Post-Delivery Amendments

### Amendment 1 — Q9 Manual Text Entry (Stacked Inputs)

**Issue:** TDD Q9 locked decision specifies file upload and manual text entry are NOT mutually exclusive — both channels always available simultaneously, concatenated into one `rawText` before a single extraction call.

**Delivered:**
- Added `manualText: string` state + ref to `App.tsx`; passed as `manualText` / `onManualTextChange` props to `RequirementsTab`
- Added `manualTextRef` to hook Refs; rewrote `parseSelectedFiles` guard: enabled when `uploadDrafts.length > 0 OR manualText.trim()`
- Step 1: parse files (if staged) → get `combinedText`; Step 2: concatenate `[combinedText, manualText].filter(Boolean).join('\n\n')` → single `streamExtractRequirements` call → one loading state → sequential REQ-IDs → all rows land in `uploadedRequirements[]` with source badge `upload`
- Added "or type / paste" divider + `<textarea rows={3}>` stacked below drop zone in `RequirementsTab.tsx`
- CSS: `.req-manual-divider`, `.req-manual-textarea` (min-height: 72px, max-height: 240px, resize: vertical)

### Amendment 2 — Drop Zone Height Compression

**Issue:** Stacked layout felt vertically long; drop zone padding and textarea height were excessive.

**Delivered:**
- Drop zone padding: `--space-5` → `--space-3` (removes ~16px dead air)
- Manual divider margin: `--space-4/3` → `--space-3/2`
- Manual textarea: `rows=4` → `rows=3`; added `min-height: 72px`, `max-height: 240px` cap

### Amendment 3 — Extraction Prompt: Priority Bias + Implicit Requirements Gaps

**Issue:** Two gaps identified: (1) LLMs tend to use priority as an inclusion filter; (2) implicit requirements not addressed.

**Delivered (in `src/prompts/requirement-extraction.txt`):**
- Added explicit rule: "Priority is a classification label, NEVER an inclusion filter"
- Added implicit requirement extraction rule with 4 concrete examples (dashboard→storage, login→session/logout, email→notification retry, audit log→generation+retention)

### Amendment 4 — RequirementType Taxonomy Expansion

**Issue:** `Privacy` (GDPR/CCPA/HIPAA) was collapsed into `Compliance`; `Notification` (email/SMS/push/webhook) was collapsed into `Functional`/`Integration`. These are professionally distinct categories in enterprise BA practice.

**Delivered:**
- `frontend/src/types.ts`: `RequirementType` union expanded from 10 → 12 values; added `'Privacy'` and `'Notification'`
- `frontend/src/components/RequirementTable.tsx`: optgroup restructured — `Non-Functional` group renamed to `Quality` (Non-Functional, Security, Privacy); `Architecture` group now includes Notification alongside Integration, Data
- `src/prompts/requirement-extraction.txt`: full prompt rewritten as Senior BA/PM/Enterprise Architect persona; added Privacy and Notification classification rules with enterprise-grade guidance; Privacy explicitly distinguished from Compliance (operational PII protection vs regulatory certification); Notification covers delivery, escalation, retry, and threshold alerts

### Amendment 5 — Generation Instructions Relocation

**Issue:** Generation Context was embedded in the footer CTA zone — incorrect spatial hierarchy. Instructions are *input* (processing directives), not *action*. Footer must be a pure action zone.

**Delivered:**
- Removed from `req-cta-zone` in the footer
- Added as standalone `.req-instructions-panel` between Section 2 (Jira) and the footer — correct position in the user's mental flow: Load → Pull → Instruct → Gate → Generate
- Panel design: pencil icon + "Generation Instructions" label + collapsed text preview (64-char truncation with `…`) + accent dot when instructions are set + chevron toggle
- No numbered badge (not a requirement source — a processing directive)
- CSS: `.req-instructions-panel`, `.req-instructions-toggle`, `.req-instructions-label`, `.req-instructions-preview`, `.req-instructions-chevron`, `.req-instructions-textarea`
- Footer (`req-cta-zone`) is now pure action: review checkbox + Generate All button only

### Amendment 6 — Fixed Action Bar (Always-Visible CTA)

**Issue:** With many extracted requirements across File Upload, Manual Text, and Jira, the review gate and Generate All button scroll far out of view, forcing users to scroll to the bottom before they can act.

**Root cause of sticky failure:** `position: sticky` was the first attempt, but `overflow-x: hidden` on `.main-area` creates a block formatting context that silently kills sticky for all descendants — a known browser constraint with no pure-CSS workaround inside the same DOM tree.

**Delivered:**
- Removed standalone `.req-instructions-panel` from mid-page and standalone `.req-generate-footer` from page bottom
- Merged both into a single unified `.req-sticky-bar` fixed to the viewport bottom: `position: fixed; left: var(--sidebar-w); right: 0; bottom: 0; z-index: 100`
- Bar structure (top row → bottom row):
  - **Row 1 — Generation Instructions:** pencil icon + label + 64-char collapsed preview + accent dot indicator + chevron; expands inline to `req-instructions-textarea` when toggled
  - **Row 2 — CTA:** "Requirements reviewed and ready" checkbox (review gate) + "⚡ Generate All Artifacts" button, right-aligned
- `box-shadow: 0 -4px 20px rgba(0,0,0,0.1)` lifts bar visually off scrolling content
- `border-top: 1px solid var(--border)` provides clean separation from page content
- Added `.req-sticky-bar-spacer` div (height: 96px) immediately above the bar in document flow — prevents the bottom of the requirements table from being hidden behind the fixed bar
- Responsive: at ≤700px, `left: 0` overrides `left: var(--sidebar-w)` so bar spans full width when sidebar is narrow/icon-only; `.req-cta-zone` stacks vertically at this breakpoint
- CSS added/updated: `.req-sticky-bar`, `.req-sticky-instructions`, `.req-sticky-bar-spacer`; `.req-cta-zone` updated with `justify-content: flex-end` + `padding`; removed `.req-generate-footer`

---

## Files Modified / Created

| File | Change |
|---|---|
| `frontend/src/types.ts` | Added `RequirementType`, `IssueType`, `RequirementPriority`, `ExtractedRequirement`; extended `JiraIssueSummary` |
| `src/prompts/requirement-extraction.txt` | Created — NDJSON extraction system prompt |
| `src/services/document/DocumentParser.ts` | Added xlsx/csv/pptx support; jszip for PPTX; async parsePptx |
| `src/services/jira/JiraXrayService.ts` | Added issueType + priority fetch + JIRA_PRIORITY_MAP |
| `src/routes/generate.ts` | Added POST /extract-requirements/stream SSE endpoint |
| `frontend/src/components/RequirementTable.tsx` | Created — 6-column editable table component |
| `frontend/src/styles.css` | Added RequirementTable CSS + drop zone CSS + fixed action bar (`.req-sticky-bar`, `.req-sticky-instructions`, `.req-sticky-bar-spacer`) |
| `frontend/src/utils.ts` | Added `buildRequirementsPayload()` |
| `frontend/src/api/client.ts` | Added `streamExtractRequirements()` |
| `frontend/src/hooks/useTraceLMMessages.ts` | Rewrote parseSelectedFiles + pullFromJira; new setter params |
| `frontend/src/App.tsx` | Added uploadedRequirements/jiraRequirements/instructionText state; payload sync effect; new handlers |
| `frontend/src/tabs/RequirementsTab.tsx` | Full rebuild — new prop API, drop zone, two RequirementTable instances |
| `frontend/src/tabs/__tests__/RequirementsTab.test.tsx` | Updated baseProps + new test assertions |
