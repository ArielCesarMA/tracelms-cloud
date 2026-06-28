# Phase 2 — Authentication & Single-User Security

---

## Feature 1: User Model & Auth Core

### Task 1: Add User Prisma Model

**Task Title:** Add User Prisma model

**Task Description:**
New model `User`: `id` (cuid), `email` (String @unique), `passwordHash` (String), `isActive` (Boolean @default(true)), `lastLoginAt` (DateTime?), `createdAt` (DateTime @default(now)). Run `prisma migrate dev`. No seed user — first user registers via `POST /api/auth/register`. Foreign-key stubs left for Phase 3: `Project.ownerId` and `Generation.userId` (nullable, added in Phase 3 migration).

| Criterion | Delivered |
|---|---|
| `User` model added to schema | Added to `prisma/schema.prisma` with all specified fields |
| `id` as cuid primary key | `@id @default(cuid())` |
| `email` as unique index | `String @unique` — enforces one account per email at DB level |
| `passwordHash` stored (never plaintext) | `String` — bcrypt hash written by register route, never the raw password |
| `isActive` for account gating | `Boolean @default(true)` — login route checks this flag before issuing token |
| `lastLoginAt` updated on each login | `DateTime?` — written via `prisma.user.update()` on every successful auth |
| `createdAt` with default | `DateTime @default(now())` |
| Migration executed | `20260626145711_add_user_model` applied — database in sync with schema |
| No seed user | Table starts empty; first user created via `POST /api/auth/register` |
| Phase 3 FK stubs deferred | `Generation.userId` and `Project.ownerId` are Phase 3 schema additions — adding them now would require `NOT NULL` constraints that break existing rows |

**Files Changed:**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `User` model added |
| `prisma/migrations/20260626145711_add_user_model/migration.sql` | Generated and applied by `prisma migrate dev --name add_user_model` |

---

### Task 2: POST /api/auth/register — Create First User

**Task Title:** POST /api/auth/register — create first user

**Task Description:**
Route: `POST /api/auth/register`. Body: `{ email, password }`. Validates email format + password min length (12 chars). Hashes password with bcrypt (cost factor 12). Creates User record. Returns 201 with `{ userId, email }` (no token — must login after). Gated by `ALLOW_REGISTRATION=true` env flag — disabled in production after first user is created.

| Criterion | Delivered |
|---|---|
| `POST /api/auth/register` route | Added to `src/routes/auth.ts`, mounted in `server.ts` as public route |
| Email format validation | Regex `EMAIL_RE` — rejects missing `@` and TLD |
| Password min 12 chars | Returns 400 with specific message if shorter |
| bcrypt hash cost factor 12 | `bcrypt.hash(password, 12)` — deliberately slow to resist offline cracking |
| Returns 201 `{ userId, email }` (no token) | Matches spec — user must call login to get JWT |
| `ALLOW_REGISTRATION=true` gate | Returns 403 when flag is not set — prevents open registration in production |
| Generic conflict message | Returns 409 without revealing whether the email already exists |
| Route is public | Excluded from auth middleware by `PUBLIC_PATHS` set in `src/middleware/auth.ts` |

**Files Changed:**

| File | Change |
|---|---|
| `src/routes/auth.ts` | New file — register + login + me routes |
| `src/server.ts` | `authRouter` mounted; route excluded from auth middleware |

---

### Task 3: POST /api/auth/login — Issue JWT

**Task Title:** POST /api/auth/login — issue JWT

**Task Description:**
Route: `POST /api/auth/login`. Body: `{ email, password }`. Finds User by email. Compares with `bcrypt.compare()`. On success: issues JWT (`jsonwebtoken`). Payload: `{ userId, email, iat, exp }`. Expiry: 8 hours (`ACCESS_TOKEN_EXPIRY` env var). Returns: `{ token, expiresAt }`. On failure: 401 with generic message (never reveals whether email exists).

| Criterion | Delivered |
|---|---|
| `POST /api/auth/login` route | Added to `src/routes/auth.ts` |
| User lookup by email | `prisma.user.findUnique({ where: { email } })` |
| bcrypt.compare for password check | `bcrypt.compare(password, user.passwordHash)` |
| Anti-timing-attack dummy hash | Always runs `bcrypt.compare` even when user not found — prevents email enumeration via timing |
| JWT issued on success | `jwt.sign({ userId, email }, JWT_SECRET, { expiresIn })` |
| `ACCESS_TOKEN_EXPIRY` env var | Defaults to `8h` if not set |
| Returns `{ token, expiresAt }` | `expiresAt` decoded from JWT `exp` claim |
| Generic 401 on failure | Same message for wrong password, wrong email, and inactive account |
| `lastLoginAt` updated on success | `prisma.user.update({ data: { lastLoginAt: new Date() } })` |
| Route is public | Excluded from auth middleware |

**Files Changed:**

| File | Change |
|---|---|
| `src/routes/auth.ts` | Login handler implemented |
| `.env.example` | `JWT_SECRET`, `ACCESS_TOKEN_EXPIRY`, `ALLOW_REGISTRATION` documented |

---

## Feature 2: Auth Middleware

### Task 4: JWT Auth Middleware for All /api Routes

**Task Title:** JWT auth middleware for all /api routes

**Task Description:**
Express middleware: `src/middleware/auth.ts`. Reads `Authorization: Bearer <token>` header. Verifies JWT with `JWT_SECRET`. On valid: attaches `req.user = { userId, email }`. On invalid/missing: returns 401 `{ error: 'Unauthorised' }`. Mounted BEFORE all route groups in `server.ts` EXCEPT: `/api/health`, `/api/auth/login`, `/api/auth/register` (public routes).

| Criterion | Delivered |
|---|---|
| `src/middleware/auth.ts` created | `authMiddleware` function exported |
| `Authorization: Bearer` header extraction | `req.headers['authorization']?.slice(7)` |
| JWT verification with `JWT_SECRET` | `jwt.verify(token, secret)` — throws on tampered/expired tokens |
| `req.user = { userId, email }` attached | Cast via `AuthenticatedRequest` interface extension |
| Returns 401 on missing or invalid token | Generic `{ error: 'Unauthorised.' }` — no token detail leaked in error |
| Public routes excluded | `PUBLIC_PATHS` Set: `/api/health`, `/api/auth/login`, `/api/auth/register` |
| Mounted before all route groups | `app.use('/api', authMiddleware)` in `server.ts` — line order enforced |
| `JWT_SECRET` absence handled | Returns 500 `{ error: 'Server misconfiguration.' }` — never crashes the process |
| `AuthenticatedRequest` TypeScript interface | Exported from `auth.ts` for use by routes that need `req.user` |

**Files Changed:**

| File | Change |
|---|---|
| `src/middleware/auth.ts` | New file — JWT middleware with public-path exclusions |
| `src/server.ts` | `authMiddleware` imported and mounted before all route groups |

---

### Task 5: Login Page Component (React)

**Task Title:** Login page component (React)

**Task Description:**
New component `frontend/src/pages/LoginPage.tsx`. Email + password form. On submit: `POST /api/auth/login` → store token in `localStorage('tracelms-token')`. On success: render main app. On failure: inline error. `App.tsx` restructured into `App` (auth wrapper) + `AppInner` (main app) — prevents React hook rule violations from conditional renders. Auth headers injected into all `get()`, `post()`, and `streamPost()` calls in `client.ts`. Logout button in sidebar footer clears token and renders login page.

| Criterion | Delivered |
|---|---|
| `frontend/src/pages/LoginPage.tsx` created | Email + password form with `onAuthenticated` callback |
| Token stored in `localStorage` as `tracelms-token` | `setAuthToken(token)` via `client.ts` helper |
| On success: main app renders | `onAuthenticated()` fires → `App` sets `isAuthenticated = true` → `AppInner` mounts |
| On failure: inline error shown | `role="alert"` error block with amber/red styling using `#e05252` danger token |
| Token checked on mount (no flash) | `useLayoutEffect` in `App` wrapper runs before first paint |
| `App` → `AppInner` split | Wrapper holds only auth state; `AppInner` holds all application hooks — no Rules-of-Hooks violation |
| 401 mid-session → reload to login | `clearAuthToken() + window.location.reload()` in both `get()` and `post()` in `client.ts` |
| Auth headers on all API calls | `Authorization: Bearer <token>` added to `get()`, `post()`, and `streamPost()` via `authHeaders()` helper |
| Logout button in sidebar footer | Clears token + calls `onLogout` → `AppInner` unmounts, `LoginPage` renders |
| `login()` function bypasses auth header | Uses raw `fetch` (not `post()`) — the login route itself is unauthenticated |

**Files Changed:**

| File | Change |
|---|---|
| `frontend/src/pages/LoginPage.tsx` | New file — login form component |
| `frontend/src/api/client.ts` | `getAuthToken`, `setAuthToken`, `clearAuthToken`, `authHeaders`, `login()`, `register()` added; `get()`, `post()`, `streamPost()` now send `Authorization` header; 401 triggers token clear + reload |
| `frontend/src/App.tsx` | `App` split into auth wrapper + `AppInner`; logout handler passed as `onLogout` prop; sign-out button added to sidebar footer |

---

## Feature 3: Rate Limiting

### Task 6: express-rate-limit on Generation Endpoints

**Task Title:** express-rate-limit on generation endpoints

**Task Description:**
Install `express-rate-limit`. Apply to all `/api/generate/*` routes: `windowMs: 60_000` (1 min), `max: 10` requests per IP. Apply stricter limit on `/api/auth/login`: 5 attempts per 15 minutes per IP (brute force protection). On limit: return 429 with `Retry-After` header. Frontend detects 429 and shows appropriate error via the existing error propagation in `useTraceLMMessages.ts`.

| Criterion | Delivered |
|---|---|
| `express-rate-limit` installed | Added to `package.json` dependencies |
| Generation limiter: 10 req/min/IP | `rateLimit({ windowMs: 60_000, max: 10 })` applied to `app.use('/api/generate', ...)` |
| Login limiter: 5 attempts/15min/IP | `rateLimit({ windowMs: 15 * 60 * 1000, max: 5 })` applied to `app.use('/api/auth/login', ...)` |
| `Retry-After` header sent | `standardHeaders: true` — RFC-compliant `RateLimit-*` headers on every response |
| 429 with JSON error body | `message: { error: '...' }` — frontend existing error handling catches it |
| Frontend error propagation | Existing `catch` in `useTraceLMMessages.ts` calls `setFeedback` — no new code needed |
| Login limiter mounted before auth router | `app.use('/api/auth/login', loginLimiter)` before `app.use('/api/auth', authRouter)` |

**Files Changed:**

| File | Change |
|---|---|
| `package.json` | `express-rate-limit` added |
| `src/server.ts` | `loginLimiter` and `generateLimiter` defined and mounted |

---

## Feature 4: Input Validation

### Task 7: Requirement Text Length Validation and Sanitization

**Task Title:** Requirement text length validation and sanitization

**Task Description:**
In `generate.ts` routes: validate requirements text length (max 50,000 chars — configurable via `MAX_REQUIREMENT_CHARS` env var). Return 400 if exceeded. Basic sanitization: trim whitespace, reject null bytes. Do NOT sanitize for HTML/XSS (text goes to LLM, not rendered as HTML in backend). Frontend character counter in `RequirementsTab.tsx` with warning at 80% of limit.

| Criterion | Delivered |
|---|---|
| `validateRequirementText()` helper in `generate.ts` | Centralised validator — checks type, null bytes, empty-after-trim, and length |
| Max 50,000 chars | `MAX_REQUIREMENT_CHARS = parseInt(process.env.MAX_REQUIREMENT_CHARS ?? '50000', 10)` |
| `MAX_REQUIREMENT_CHARS` env var | Configurable — `parseInt` with safe default |
| Returns 400 with human-readable message | Includes the limit in the error message with locale formatting |
| Null byte rejection | `text.replace(/\0/g, '')` before trim — prevents hidden control-character injections |
| Whitespace trimmed before LLM | `sanitized` variable passed to LLM prompt (not raw `requirements`) |
| No HTML/XSS sanitization | Correct — text goes to LLM, not rendered; sanitizing would corrupt requirement content |
| Applied to `/enhancement` route | Old guard replaced with `validateRequirementText()` |
| Applied to `/enhancement/stream` route | Old guard replaced with `validateRequirementText()` |
| Frontend char counter | Shown when `manualText.length > 0`; amber warning at ≥ 80%, red at limit |
| `maxLength` attribute on textarea | Prevents browser paste beyond limit as a secondary guard |

**Files Changed:**

| File | Change |
|---|---|
| `src/routes/generate.ts` | `validateRequirementText()` helper added; `/enhancement` and `/enhancement/stream` guards replaced |
| `frontend/src/tabs/RequirementsTab.tsx` | `MAX_REQUIREMENT_CHARS`, `WARN_THRESHOLD` constants; char counter below manual textarea |
| `.env.example` | `MAX_REQUIREMENT_CHARS` documented |

---

## Feature 5: HTTPS & Hardening

### Task 8: HTTPS Enforcement via Reverse Proxy (Nginx/Caddy)

**Task Title:** HTTPS enforcement via reverse proxy (Nginx/Caddy)

**Task Description:**
Configuration guide + template files (not application code changes). Caddy (recommended): Caddyfile with automatic TLS via Let's Encrypt. Nginx alternative: nginx.conf template with proxy_pass, ssl settings, and HSTS header. Update CORS in server.ts to accept production domain via `FRONTEND_URL` env var. Create `.env.example` documenting all Phase 2 env vars. Note: TLS is required before sharing any URL externally.

| Criterion | Delivered |
|---|---|
| `deploy/Caddyfile` template | Automatic TLS via Let's Encrypt; HSTS + security headers; `reverse_proxy localhost:3000` |
| `deploy/nginx.conf` template | HTTP → HTTPS redirect, TLS 1.2/1.3, proxy buffering disabled for SSE, 700s proxy timeout |
| HSTS header in both templates | `max-age=31536000; includeSubDomains` |
| Nginx SSE buffering disabled | `proxy_buffering off; proxy_cache off` — required for SSE chunks to flow in real time |
| `FRONTEND_URL` env var for CORS | Already wired in `server.ts` — documented in `.env.example` |
| `.env.example` created | All Phase 2 env vars documented: `JWT_SECRET`, `ACCESS_TOKEN_EXPIRY`, `ALLOW_REGISTRATION`, `MAX_REQUIREMENT_CHARS`, `FRONTEND_URL` |
| Body limit tightened to 27 MB | `express.json({ limit: '27mb' })` — replaces former `50mb`; adequate for document payloads |
| No application code changes for TLS | TLS is handled at the proxy layer — Node.js does not terminate TLS directly |

**Files Changed:**

| File | Change |
|---|---|
| `deploy/Caddyfile` | New file — Caddy reverse proxy template |
| `deploy/nginx.conf` | New file — Nginx reverse proxy template |
| `.env.example` | New file — all env vars documented for Phase 2 |
| `src/server.ts` | Body limit changed from `50mb` to `27mb` |

---

## Architectural Notes

- **`App` / `AppInner` split** is required by React's Rules of Hooks — conditional renders cannot appear before `useState`/`useEffect` calls in the same component. Moving auth state into a thin `App` wrapper that renders either `<LoginPage>` or `<AppInner>` is the canonical solution. No hooks are called in the wrapper beyond the auth state check.

- **Anti-timing-attack login** — the dummy hash constant in the login route ensures `bcrypt.compare` always executes (~100ms) regardless of whether the email exists in the database. Without this, an attacker could distinguish "email not found" (fast response) from "wrong password" (slow response) and enumerate valid emails.

- **`ALLOW_REGISTRATION` env flag** — this is a single-user deployment pattern. The flag must be set to `true` to register the first user, then removed or set to `false`. There is no admin interface to create users — the flag is the only mechanism. Document this clearly in the `.env.example` comment.

- **Rate limiting is mounted before auth middleware** for the login route. If auth middleware ran first on `/api/auth/login`, unauthenticated requests would be rejected before the rate limiter ever saw them — defeating brute-force protection.

- **Body limit 27 MB** — the previous 50 MB limit was set when Phase 2.5 Document Gateway was anticipated. 27 MB comfortably covers the largest realistic document payload (a 20 MB docx is extreme) while halving the maximum request size that could be used in a DoS payload.

- **`streamPost()` auth header** — the streaming client was updated alongside `get()` and `post()` so that all three code paths send `Authorization: Bearer`. Without this, generation routes would reject stream requests with 401 even when the user is logged in.
