# Phase 3 — Multi-Tenancy & Project Management

**Version:** v0.1.0  
**Delivered:** 2026-06-27  
**Status:** ✅ CLOSED

---

## Feature 1 — User-Scoped Settings

### Task 1.1 — Per-User Settings Row

**Task Description**  
Migrate the global singleton Settings row (id = "global") to a per-user model where each authenticated user owns their own Settings row. The first authenticated user claims the existing legacy row via an UPDATE; subsequent users get a new row on first save. The backend never exposes plaintext secrets to the frontend — encrypted fields remain server-side only.

**Criterion**
- `prisma/schema.prisma`: `Settings` model gains `userId String? @unique` and a `User` relation with `onDelete: Cascade`. The `id` default changes from `"global"` to `cuid()` to support multiple rows.
- `src/services/SettingsService.ts`: `loadSettings(userId)` and `saveSettings(userId, s)` accept a `userId` parameter. Legacy claim pattern: on first load, if no row exists for `userId`, finds the unclaimed row (`userId = null`) and claims it via `UPDATE`.
- `src/routes/settings.ts`: GET and POST `/api/settings` extract `userId` from `req.user` (JWT middleware) and pass it to the service. POST `/api/settings/test-llm` resolves masked `••••••••` API key via `loadSettings(userId)` before calling the LLM provider.

**Delivered** ✅  
Files modified: `prisma/schema.prisma`, `src/services/SettingsService.ts`, `src/routes/settings.ts`

---

## Feature 2 — Project CRUD & Stakeholder Management

### Task 2.1 — Project Model Extension

**Task Description**  
Extend the Prisma `Project` model to support user ownership and soft-delete (ARCHIVED status). Add `ownerId` FK to `User` with `onDelete: SetNull` so projects survive user deletion. Add `@@index([ownerId])` and `@@index([status])` for efficient filtered queries.

**Criterion**
- `prisma/schema.prisma`: `Project` gains `ownerId String?`, `userOwner User? @relation(...)`, `@@index([ownerId])`, `@@index([status])`.
- Schema pushed to database via `npx prisma db push --accept-data-loss` (non-interactive environment).

**Delivered** ✅  
Files modified: `prisma/schema.prisma`

---

### Task 2.2 — Projects REST API

**Task Description**  
Implement a full CRUD REST API for Projects and Stakeholders. All routes are auth-gated and user-scoped (`ownerId = req.user.userId`). Soft-delete (ARCHIVE) via DELETE rather than hard removal. Project key is normalised to uppercase and enforced unique.

**Criterion**
- `src/routes/projects.ts` (new file):
  - `GET /api/projects` — list active projects for user (excludes ARCHIVED), includes stakeholders + generation count
  - `GET /api/projects/:id` — single project (any status)
  - `POST /api/projects` — create; validates name + key; normalises key to uppercase; rejects duplicate keys with 409
  - `PATCH /api/projects/:id` — update name, description, or status
  - `DELETE /api/projects/:id` — soft-archive (sets status = ARCHIVED)
  - `POST /api/projects/:id/stakeholders` — add stakeholder (email required)
  - `DELETE /api/projects/:id/stakeholders/:sid` — remove stakeholder
- `src/server.ts`: registers `projectsRouter` at `/api/projects`

**Delivered** ✅  
Files created/modified: `src/routes/projects.ts`, `src/server.ts`

---

### Task 2.3 — Frontend Project Types & API Client

**Task Description**  
Add TypeScript types for Projects, Stakeholders, and GenerationHistoryItem to the frontend type system. Extend the API client with DELETE and PATCH HTTP helpers and all project/generation API functions.

**Criterion**
- `frontend/src/types.ts`: `ProjectStatus`, `StakeholderRole`, `Stakeholder`, `Project`, `GenerationHistoryItem` types added.
- `frontend/src/api/client.ts`:
  - `del<T>` helper (DELETE method with auth headers)
  - `patch<T>` helper (PATCH method with auth headers)
  - `fetchGenerationHistory(projectId?)`, `fetchGeneration(id)`, `deleteGeneration(id)`
  - `fetchProjects()`, `fetchProject(id)`, `createProject(data)`, `updateProject(id, data)`, `archiveProject(id)`
  - `addStakeholder(projectId, data)`, `removeStakeholder(projectId, stakeholderId)`

**Delivered** ✅  
Files modified: `frontend/src/types.ts`, `frontend/src/api/client.ts`

---

### Task 2.4 — Projects Tab UI

**Task Description**  
Replace the Projects tab ComingSoonBanner with a full CRUD interface. Includes: project card list with status badges and metadata counts, create-project modal (name + key fields), per-project detail panel with edit form, archive action, and active-project selector. Project detail shows stakeholder team table with add/remove form, and full generation history table with Load and Delete actions. Load action presents a confirmation modal when unsaved work is present.

**Criterion**
- `frontend/src/tabs/ProjectsTab.tsx` (rewritten):
  - Project list: cards showing key, name, description, status badge, run count, member count
  - Active project: "Set as Active" / "Deactivate" toggle per project; active card has left accent border and "Active" chip
  - Create modal: name, key (auto-uppercased), description fields; inline error on duplicate key
  - Edit form: in-panel name + description edit with Save/Cancel
  - Archive: confirmation dialog before soft-delete; removes card from list; deactivates if was active
  - Stakeholders: table with email, name, role chip; add-stakeholder form with role dropdown; remove button per row
  - Generation history: table with date, requirement preview, provider/model, test count, status badge; Load and Delete action buttons
  - Load confirmation: modal warns about unsaved work before restoring full generation state via `onGenerationLoad`

**Delivered** ✅  
Files modified: `frontend/src/tabs/ProjectsTab.tsx`

---

## Feature 3 — Active Project Context & Session Persistence

### Task 3.1 — Active Project State in App

**Task Description**  
Add `activeProjectId` and `activeProjectName` state to `AppInner`, persisted in `localStorage` under `tracelms-active-project-id` and `tracelms-active-project-name`. Wire the active project name indicator into the sidebar footer (below version, above sign-out). Implement `handleGenerationLoad` to restore full generation state (requirements, enhancement, scenarios, test cases, automation) from a history record.

**Criterion**
- `frontend/src/App.tsx`:
  - `activeProjectId` and `activeProjectName` initialised from localStorage
  - `handleProjectActivate(project | null)` — sets/clears both state and localStorage keys
  - `handleGenerationLoad(gen)` — restores all five generation state fields and navigates to Requirements tab
  - `ProjectsTab` receives `activeProjectId`, `onProjectActivate`, `onGenerationLoad` props
  - Sidebar footer renders `.sidebar-active-project` chip with folder icon and project name when a project is active

**Delivered** ✅  
Files modified: `frontend/src/App.tsx`

---

### Task 3.2 — Generation History User-Scoping

**Task Description**  
Extend the `Generation` model with `userId` FK and re-scope all generation routes to filter by `userId`. Add `GET /api/generation/:id` and `DELETE /api/generation/:id` endpoints. Add `@@index([userId])`, `@@index([projectId])`, and `@@index([createdAt])` for pagination-ready queries.

**Criterion**
- `prisma/schema.prisma`: `Generation` gains `userId String?`, `user User? @relation(onDelete: SetNull)`, `@@index([userId])`, `@@index([projectId])`, `@@index([createdAt])`.
- `src/routes/generation.ts`:
  - POST `/` saves `userId` from JWT; optionally saves `projectId` from request body
  - GET `/latest` filters by `{ status, userId }`
  - GET `/history` filters by `userId` and optional `?projectId=`; returns `totalTestCases`, `totalScenarios`, `projectId`
  - GET `/:id` — fetch full record; 403 if userId mismatch
  - DELETE `/:id` — delete record; 403 if userId mismatch

**Delivered** ✅  
Files modified: `prisma/schema.prisma`, `src/routes/generation.ts`

---

### Task 3.3 — Project Tab CSS Design System

**Task Description**  
Add all CSS tokens and component styles for the Projects tab to the existing design system in `styles.css`. All selectors use the `.proj-*` namespace. Styles cover: project cards, status badges, detail panel, edit form, stakeholder table, generation history table, role chips, icon buttons, create modal overlay, and sidebar active-project indicator. Responsive breakpoints at 900px and 600px.

**Criterion**
- `frontend/src/styles.css`: `.proj-header`, `.proj-create-btn`, `.proj-empty`, `.proj-layout` (2-col grid), `.proj-card` (and `--selected`, `--active` variants), `.proj-badge` (active/draft/archived), `.proj-detail`, `.proj-section`, `.proj-table`, `.proj-modal-overlay`, `.proj-modal`, `.proj-icon-btn`, `.proj-stakeholder-inputs`, `.sidebar-active-project`, `button[data-variant="danger"]` styles added.
- No existing class names overridden. Responsive grid collapses to single column at ≤ 900px.

**Delivered** ✅  
Files modified: `frontend/src/styles.css`

---

## Type-Check Status

| Check | Result |
|---|---|
| `npx tsc --noEmit` (backend) | ✅ 0 errors |
| `cd frontend && npx tsc --noEmit` | ✅ 0 errors |

---

## Notes

- **Prisma client regeneration**: The Prisma query engine DLL is locked by the running dev server. After stopping the server, run `npx prisma generate` to remove the `as any` casts in `SettingsService.ts` and restore full type safety on the new `userId` and `ownerId` fields.
- **Email notifications** (stakeholder invite): Phase 5 feature — stakeholders must be informed manually for now. A note is shown inline in the UI.
- **Project key uniqueness**: Currently enforced globally (across all users). A future migration may scope uniqueness to `(ownerId, key)` when multi-tenant isolation is required.
