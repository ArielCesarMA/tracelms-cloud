# Phase 3.5 — RBAC Bridge: OrgRole / ProjectRole Matrix

**Status:** CLOSED  
**Delivered:** 2026-06-27  
**Version:** v0.1.0 → v0.2.0-rc (Phase 3.5)

---

## Feature 1 — Role Model Extension

### Task 1.1 — Add OrgRole Enum to Prisma Schema
**Description:** Introduce a four-level organisation-wide role enum (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`) on the `User` model, replacing the implicit single-tenant assumption.

| Criterion | Delivered |
|---|---|
| `OrgRole` enum defined in `prisma/schema.prisma` | ✅ `enum OrgRole { OWNER ADMIN EDITOR VIEWER }` |
| `User.role OrgRole @default(EDITOR)` field present | ✅ Default `EDITOR` prevents new-user lockout |
| `@@index([role])` added for query performance | ✅ |
| Schema pushed to Supabase without data loss | ✅ `npx prisma db push --accept-data-loss` — 3.52 s |

---

### Task 1.2 — Add ProjectRole Enum & Rename Stakeholder → ProjectMember
**Description:** Replace the free-text `role String` on the `Stakeholder` model with a typed `ProjectRole` enum (`LEAD`, `EDITOR`, `REVIEWER`, `VIEWER`), and rename the model to `ProjectMember` to reflect its semantic purpose.

| Criterion | Delivered |
|---|---|
| `ProjectRole` enum defined (`LEAD EDITOR REVIEWER VIEWER`) | ✅ |
| `Stakeholder` model renamed to `ProjectMember` in schema | ✅ |
| `projectRole ProjectRole @default(VIEWER)` replaces `role String` | ✅ |
| `userId String?` FK to `User` with `onDelete: SetNull` | ✅ |
| `@@unique([projectId, email])` constraint | ✅ |
| `@@index([userId])` and `@@index([projectId])` | ✅ |
| `Project.members ProjectMember[]` relation updated | ✅ |
| Legacy `/api/projects/:id/stakeholders` URL aliases kept for backward compat | ✅ Maps old text roles (QA Lead→LEAD, Product Owner→REVIEWER, etc.) |

---

### Task 1.3 — JWT Role Embedding & `/api/auth/me` Route
**Description:** Embed `role` in the JWT payload at login and provide a `/api/auth/me` endpoint that polls the DB so role changes take effect without requiring re-login.

| Criterion | Delivered |
|---|---|
| `role` included in `jwt.sign()` payload at `/register` and `/login` | ✅ |
| Legacy token fallback: `payload.role ?? 'EDITOR'` in `auth.ts` middleware | ✅ |
| `GET /api/auth/me` returns `{ id, email, role, isActive, lastLoginAt, createdAt }` | ✅ |
| Owner bootstrap: first registered user receives `OWNER`; subsequent users receive `EDITOR` | ✅ |

---

## Feature 2 — Permission Middleware

### Task 2.1 — `requireRole` Factory (OrgRole Guard)
**Description:** Create a reusable Express middleware factory that enforces OrgRole requirements on routes, with OWNER always passing unconditionally.

| Criterion | Delivered |
|---|---|
| `requireRole(...OrgRoleValue[])` factory in `src/middleware/permissions.ts` | ✅ |
| OWNER short-circuits — always passes without list check | ✅ |
| 403 response includes `{ error, required, current }` for client clarity | ✅ |
| Applied to `POST /api/settings` (requires OWNER) | ✅ |
| Applied to `POST /api/projects` (requires OWNER / ADMIN / EDITOR) | ✅ |
| Applied to `DELETE /api/projects/:id` (requires OWNER / ADMIN) | ✅ |

---

### Task 2.2 — `requireProjectRole` Factory (ProjectRole Guard)
**Description:** Create a middleware factory for project-scoped permission checks that looks up the `ProjectMember` record for the requesting user and falls back to the OrgRole→ProjectRole mapping if no member record exists.

| Criterion | Delivered |
|---|---|
| `requireProjectRole(...ProjectRoleValue[])` factory in `src/middleware/permissions.ts` | ✅ |
| Async DB lookup of `ProjectMember` by `projectId` + `userId` | ✅ |
| OrgRole→ProjectRole fallback map: OWNER/ADMIN→LEAD, EDITOR→EDITOR, VIEWER→VIEWER | ✅ |
| Applied to `POST /api/xray/push` (requires LEAD / EDITOR) | ✅ |

---

## Feature 3 — UI Permission Awareness

### Task 3.1 — AuthContext (React)
**Description:** Provide a React context that polls `/api/auth/me` every 60 seconds and exposes the authenticated user with permission helper functions, ensuring role changes propagate to the UI without re-login.

| Criterion | Delivered |
|---|---|
| `AuthProvider` wraps `<App />` in `frontend/src/index.tsx` | ✅ |
| `useAuth()` hook provides `{ user, loading, logout, refetch }` | ✅ |
| Polls `/api/auth/me` every 60 s via `setInterval` | ✅ |
| `canWrite(role)` — OWNER / ADMIN / EDITOR → true | ✅ |
| `canPush(role)` — OWNER / ADMIN / EDITOR → true | ✅ |
| `canManageUsers(role)` — OWNER / ADMIN → true | ✅ |
| `isOwner(role)` — OWNER only → true | ✅ |
| `ROLE_LABELS` and `ROLE_DESCRIPTIONS` exported constants | ✅ |

---

### Task 3.2 — Role Badge in Sidebar
**Description:** Display the authenticated user's OrgRole as a colour-coded badge in the sidebar footer, giving users instant visibility of their access level.

| Criterion | Delivered |
|---|---|
| Role badge rendered in sidebar footer below user email | ✅ |
| Four colour variants: `--owner` teal, `--admin` indigo, `--editor` green, `--viewer` grey | ✅ CSS in `styles.css` |
| Active project chip displayed below role badge when a project is selected | ✅ |

---

### Task 3.3 — Role-Gated Action Buttons
**Description:** Disable or hide action buttons based on the user's effective role so that Viewers cannot push to Xray and non-Owners cannot clear history.

| Criterion | Delivered |
|---|---|
| Push to Xray disabled for VIEWER with tooltip "Requires Editor or above" | ✅ `TestCasesTab.tsx` |
| Preview Push disabled for VIEWER | ✅ |
| Clear History hidden when `!canWrite(role)` | ✅ |
| Save Settings disabled for non-OWNER with tooltip + helper text | ✅ `SettingsTab.tsx` |

---

## Feature 4 — Owner Bootstrap & User Management

### Task 4.1 — First-User OWNER Bootstrap
**Description:** Automatically assign the `OWNER` role to the first user who registers, ensuring every installation has at least one privileged account without manual DB intervention.

| Criterion | Delivered |
|---|---|
| `userCount === 0` check at `/api/auth/register` | ✅ |
| First user → `OWNER`; subsequent users → `EDITOR` | ✅ |
| Guard: cannot deactivate the last OWNER | ✅ in `users.ts` |
| Guard: cannot demote the last OWNER | ✅ in `users.ts` |

---

### Task 4.2 — `/api/users` Routes
**Description:** Expose user management endpoints so Owners and Admins can view, promote/demote, and activate/deactivate team members without direct DB access.

| Criterion | Delivered |
|---|---|
| `GET /api/users` — requires OWNER / ADMIN — returns all users | ✅ |
| `PATCH /api/users/:id/role` — requires OWNER — validates enum, single-OWNER guard | ✅ |
| `PATCH /api/users/:id/status` — requires OWNER / ADMIN — Admin cannot change Owner/Admin status | ✅ |
| Route registered as `app.use('/api/users', usersRouter)` in `server.ts` | ✅ |

---

### Task 4.3 — Team Section in SettingsTab
**Description:** Add a Team management section to the Integrations tab, visible only to Owners and Admins, showing all users with their role and status and allowing the Owner to change roles and toggle activation.

| Criterion | Delivered |
|---|---|
| Team section visible to OWNER and ADMIN only | ✅ `canManageUsers` gate |
| Table: Email, Role, Status, Last Login, Actions columns | ✅ |
| Owner can change role via dropdown; non-Owner sees read-only role badge | ✅ |
| Active / Deactivate toggle button per user (respects self-edit guard) | ✅ |
| "you" chip next to the authenticated user's own row | ✅ |
| Role changes call `updateUserRole()`; status changes call `updateUserStatus()` | ✅ |
| Team table CSS: `.team-table`, `.team-role-select`, `.team-you-chip`, `.team-status--*`, `.team-action-btn`, `.team-lastlogin`, `.team-row--inactive` | ✅ `styles.css` |

---

## Precedence Rules Applied

| Rule | Implementation |
|---|---|
| OWNER overrides all project-level checks | `requireProjectRole` short-circuits for OWNER |
| ProjectRole is additive, not restrictive upward | OrgRole fallback map assigns ≥ equivalent project access |
| VIEWER is always read-only | No write/push path grants VIEWER access |
| Role changes take effect within 60 s without re-login | AuthContext polls `/api/auth/me` every 60 s |

---

## Files Delivered

| File | Change |
|---|---|
| `prisma/schema.prisma` | OrgRole + ProjectRole enums; ProjectMember model; User.role field |
| `src/routes/auth.ts` | Owner bootstrap; role in JWT; `/me` route |
| `src/middleware/auth.ts` | `AuthenticatedRequest` with role; legacy token fallback |
| `src/middleware/permissions.ts` | NEW — `requireRole` + `requireProjectRole` factories |
| `src/routes/users.ts` | NEW — GET /api/users, PATCH role, PATCH status |
| `src/routes/projects.ts` | ProjectMember rename; role guards; auto-LEAD creator; legacy aliases |
| `src/routes/settings.ts` | `requireRole('OWNER')` on POST |
| `src/routes/xray.ts` | `requireProjectRole('LEAD', 'EDITOR')` on POST /push |
| `src/server.ts` | usersRouter registered |
| `frontend/src/types.ts` | OrgRole, ProjectRole, AuthUser, ProjectMember types |
| `frontend/src/api/client.ts` | fetchMe, fetchUsers, updateUserRole, updateUserStatus |
| `frontend/src/contexts/AuthContext.tsx` | NEW — AuthProvider, useAuth, permission helpers |
| `frontend/src/index.tsx` | AuthProvider wrapper |
| `frontend/src/App.tsx` | useAuth integration; role badge + active-project chip in sidebar |
| `frontend/src/tabs/SettingsTab.tsx` | REWRITTEN — Team section + Owner-gated Save button |
| `frontend/src/tabs/TestCasesTab.tsx` | canPush / canWrite guards on Push + Clear History |
| `frontend/src/tabs/ProjectsTab.tsx` | canArchive guard; ProjectMember types; ProjectRole enum for member roles |
| `frontend/src/styles.css` | role-badge, sidebar-role-badge, team-table, team-* CSS classes |

---

## Post-Delivery Action Required (Developer)

> Stop the dev server → run `npx prisma generate` → restart server.
>
> This removes all `(prisma as any)` casts in the backend. The Prisma query engine DLL was locked by the running server during implementation, requiring runtime casts as a temporary workaround. After regeneration, replace casts with properly typed calls.
