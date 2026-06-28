// Generates TraceLMs Cloud Phase 6 — Rank-1 Strategy Implementation Plan as a styled .xlsx
// Run: node scripts/generate-phase6-excel.js

const ExcelJS = require('exceljs');
const path = require('path');

const OUT = path.join(
  __dirname,
  '../DOCUMENTATION/TraceLMs Cloud/TraceLMs_Cloud_Implementation_Plan_Phase6_Rank1.xlsx'
);

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  // Pillar brand colors
  product:    '1A4FA8', productBg:  'E8F0FC',
  enterprise: '5B21B6', entBg:      'EDE9FE',
  ecosystem:  '0F6E56', ecoBg:      'D1FAE5',
  ai:         '92400E', aiBg:       'FEF3C7',
  brand:      '9D174D', brandBg:    'FCE7F3',
  community:  '065F46', commBg:     'ECFDF5',

  // Neutrals
  headerDark: '0F172A',
  white:      'FFFFFF',
  offWhite:   'F8FAFC',
  surface:    'F1F5F9',
  border:     'CBD5E1',
  textPri:    '0F172A',
  textMuted:  '64748B',

  // Priority
  critical:   '991B1B', criticalBg: 'FEE2E2',
  high:       '92400E', highBg:     'FEF3C7',
  medium:     '1E40AF', mediumBg:   'DBEAFE',

  // Effort
  efSmall:    '065F46', efSmallBg:  'D1FAE5',
  efMedium:   '92400E', efMediumBg: 'FEF3C7',
  efLarge:    '991B1B', efLargeBg:  'FEE2E2',

  // Impact
  rankDef:    '4C1D95', rankDefBg:  'EDE9FE',
  impHigh:    '065F46', impHighBg:  'D1FAE5',
  impMed:     '1E40AF', impMedBg:   'DBEAFE',

  // Status
  todo:       '475569', todoBg:     'F1F5F9',
  inProg:     '1E40AF', inProgBg:   'DBEAFE',
  done:       '065F46', doneBg:     'D1FAE5',
};

const hex = (c) => ({ argb: 'FF' + c });
const fill = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: hex(c) });
const bdr = (c = C.border) => {
  const s = { style: 'thin', color: hex(c) };
  return { top: s, left: s, bottom: s, right: s };
};
const fnt = (o = {}) => ({
  name: 'Calibri', size: o.size || 10,
  bold: o.bold || false, italic: o.italic || false,
  color: hex(o.color || C.textPri),
});
const aln = (h = 'left', v = 'middle', wrap = true) => ({
  horizontal: h, vertical: v, wrapText: wrap,
});

// ── Task data ─────────────────────────────────────────────────────────────────
// Columns: [Pillar, Feature, Task, Description, Priority, Effort, Timeline, Dependencies, Risk, Market Impact, Status]

const TASKS = [

  // ── 1. PRODUCT DEPTH ───────────────────────────────────────────────────────
  [
    'Product Depth',
    'Test Execution Runner',
    'Playwright runner service',
    'Build a Node.js Playwright execution service inside the backend: POST /api/execute/run accepts a testCaseId array, maps Gherkin steps to Playwright actions via a step resolver, spawns a headless browser run, streams stdout/stderr back via SSE. Store run results in a new TestRun Prisma model (id, generationId, testCaseId, status: PASS/FAIL/ERROR, duration, screenshotUrl, errorMessage, createdAt).',
    'Critical', 'Large', 'Week 1–4',
    'Generation persistence (Phase 1) + Test Cases tab + Xray push',
    'Very High — Playwright action mapping from natural-language Gherkin steps is non-trivial; start with structured step patterns (Given/When/Then) and explicit selectors; add NLP resolver in a later iteration',
    'Rank-defining — closes the only end-to-end gap in the market', 'To Do',
  ],
  [
    'Product Depth',
    'Test Execution Runner',
    'Execution results UI in Test Cases tab',
    'Add a "Run Tests" button in the TestCases tab header. For each test case, show a status pill: Not Run (gray) / Running (spinner) / Pass (green) / Fail (red) / Error (amber). On failure, expand row to show error message + screenshot thumbnail. Execution summary bar at top: X passed, Y failed, Z errors, total duration.',
    'Critical', 'Medium', 'Week 4–5',
    'Playwright runner service',
    'Medium — screenshot storage requires a file store (local disk or Supabase Storage); define retention policy upfront',
    'Rank-defining', 'To Do',
  ],
  [
    'Product Depth',
    'CI/CD Integration',
    'Public REST API — generate + push endpoint',
    'Create POST /api/v1/generate (API-key authenticated). Accepts { requirementText, projectId?, llmProvider?, llmModel? }. Returns a generationId immediately (202 Accepted). Generation runs async; client polls GET /api/v1/generation/:id or subscribes to a webhook. Full OpenAPI 3.1 spec published at /api/v1/docs.',
    'Critical', 'Medium', 'Week 3–4',
    'Auth + API key system (Phase 2) + Generation persistence (Phase 1)',
    'Medium — async job queue needed (BullMQ or pg-boss) to avoid blocking the HTTP response on long LLM calls',
    'Rank-defining', 'To Do',
  ],
  [
    'Product Depth',
    'CI/CD Integration',
    'GitHub Actions marketplace action',
    'Publish tracelms-cloud/generate-tests GitHub Action to the GitHub Marketplace. Action inputs: api-key, requirement-file, project-id, xray-push (boolean). On run: calls POST /api/v1/generate, polls for completion, optionally pushes to Xray. Outputs: generation-id, test-case-count, xray-keys. README with copy-paste yaml workflow snippet.',
    'Critical', 'Medium', 'Week 5–6',
    'Public REST API',
    'Low — GitHub Actions are straightforward; main risk is API key secret management in workflows',
    'Rank-defining', 'To Do',
  ],
  [
    'Product Depth',
    'CI/CD Integration',
    'GitLab CI component + Jenkins plugin',
    'GitLab CI component published to the GitLab CI Catalog. Jenkins plugin (.hpi) published to the Jenkins Plugin Index. Both wrap the same REST API used by the GitHub Action. Reuse the same OpenAPI client generation to keep all three in sync.',
    'High', 'Large', 'Week 6–8',
    'GitHub Actions action (validates the REST API contract)',
    'Medium — Jenkins plugin packaging and signing is complex; budget 2 extra weeks for certification',
    'High', 'To Do',
  ],
  [
    'Product Depth',
    'IDE Extensions',
    'VS Code extension — in-editor test generation',
    'Publish tracelms-cloud.vscode to the VS Code Marketplace. Right-click on selected requirement text → "Generate test cases with TraceLMs Cloud". Extension calls the REST API, shows results in a side panel, allows one-click push to Xray. API key stored in VS Code SecretStorage.',
    'High', 'Large', 'Week 7–9',
    'Public REST API + VS Code Extension API (already familiar from original TraceLM)',
    'Low — architecture already proven in the TraceLM VS Code extension; port the API calls',
    'High', 'To Do',
  ],
  [
    'Product Depth',
    'IDE Extensions',
    'JetBrains plugin (IntelliJ, WebStorm, PyCharm)',
    'Publish to the JetBrains Plugin Marketplace. IntelliJ IDEA plugin using the Plugin SDK. Same feature set as VS Code extension. Target: Java/Kotlin/Python teams who use IntelliJ and Jira together — the highest-value enterprise QA persona.',
    'Medium', 'Large', 'Week 9–11',
    'VS Code extension (validates UX patterns)',
    'Medium — JetBrains Plugin SDK uses Kotlin/Java; requires separate implementation from the TypeScript VS Code extension',
    'High', 'To Do',
  ],
  [
    'Product Depth',
    'Self-Healing Tests',
    'Failure analysis + step suggestion route',
    'POST /api/execute/suggest-fix. Accepts { testCaseId, errorMessage, screenshot? }. Sends failure context + original test steps to LLM with a "diagnose and propose updated steps" prompt. Returns { analysis, suggestedSteps[], confidence }. Displayed as a "Suggested Fix" drawer in the execution results UI.',
    'Medium', 'Large', 'Week 10–12',
    'Test execution runner + LLM streaming routes',
    'High — LLM may hallucinate fixes; confidence scoring and human-in-the-loop approval guard are mandatory before any auto-apply',
    'High', 'To Do',
  ],

  // ── 2. ENTERPRISE READINESS ────────────────────────────────────────────────
  [
    'Enterprise Readiness',
    'SOC 2 Type II',
    'Security controls audit + gap assessment',
    'Engage a SOC 2 readiness auditor (Vanta, Drata, or Secureframe recommended — automated evidence collection). Perform gap assessment against Trust Services Criteria (Security, Availability, Confidentiality). Document all existing controls (AES-256-GCM encryption, .env secrets, CORS policy, rate limiting). Identify gaps: access logging, audit trail, vulnerability management program, incident response plan, change management policy.',
    'Critical', 'Large', 'Week 1–2',
    'Phase 2 auth (user model required for access logging)',
    'Medium — SOC 2 Type II requires a 6–12 month observation period; start immediately to minimise time-to-certification',
    'Rank-defining', 'To Do',
  ],
  [
    'Enterprise Readiness',
    'SOC 2 Type II',
    'Audit trail + access logging implementation',
    'Add an AuditLog Prisma model: id, userId, action (LOGIN/GENERATE/PUSH/SETTINGS_CHANGE/etc.), resourceType, resourceId, ipAddress, userAgent, createdAt. Middleware writes a record on every authenticated API call. Queryable via GET /api/admin/audit-log (admin role only). Required evidence for SOC 2 CC6.1 and CC6.2.',
    'Critical', 'Medium', 'Week 2–3',
    'Auth system (Phase 2) + AuditLog model',
    'Low — additive; audit logging must never block the primary request (write async)',
    'Rank-defining', 'To Do',
  ],
  [
    'Enterprise Readiness',
    'SOC 2 Type II',
    'Vulnerability management + dependency scanning',
    'Integrate Snyk or GitHub Dependabot for automated CVE scanning on every PR. Add npm audit to CI pipeline with fail-on-high threshold. Document a vulnerability response SLA (critical: 24h, high: 7 days, medium: 30 days). Required for SOC 2 CC7.1.',
    'Critical', 'Small', 'Week 2',
    'CI pipeline (already exists from Phase 1)',
    'Low — tooling integration is straightforward; policy documentation takes time but no engineering risk',
    'Rank-defining', 'To Do',
  ],
  [
    'Enterprise Readiness',
    'SSO / SAML 2.0',
    'SAML 2.0 + OIDC provider integration',
    'Integrate passport-saml (SAML 2.0) and openid-client (OIDC) into the Express auth middleware. Support Okta, Azure AD, Google Workspace, and OneLogin as identity providers. POST /api/auth/saml/callback and /api/auth/oidc/callback routes. Tenant-level SSO configuration stored per-Organisation (new Org model). JIT (just-in-time) user provisioning on first SSO login.',
    'Critical', 'Large', 'Week 3–6',
    'Auth system (Phase 2) + Organisation/tenant model',
    'High — SAML metadata exchange and certificate rotation are error-prone; test against all 4 major IdPs before GA; provide fallback email/password login',
    'Rank-defining', 'To Do',
  ],
  [
    'Enterprise Readiness',
    'SSO / SAML 2.0',
    'SCIM 2.0 user provisioning',
    'Implement SCIM 2.0 endpoints: GET/POST /scim/v2/Users, PATCH /scim/v2/Users/:id, DELETE /scim/v2/Users/:id. Allows enterprise IdPs to automatically provision, update, and deprovision users in TraceLMs Cloud without manual account management. Required by Okta and Azure AD enterprise integrations.',
    'High', 'Large', 'Week 6–8',
    'SAML/OIDC integration',
    'Medium — SCIM spec has implementation quirks across IdPs; Okta and Azure AD behave differently; budget extensive integration testing',
    'High', 'To Do',
  ],
  [
    'Enterprise Readiness',
    'On-Premise Deployment',
    'Docker Compose production bundle',
    'Create a production-ready docker-compose.yml: tracelms-api (Express), tracelms-frontend (nginx serving static build), postgres (for teams not using Supabase), redis (for BullMQ job queue). Environment variable documentation. Health check endpoints on all services. Single-command setup: docker compose up -d.',
    'High', 'Medium', 'Week 4–5',
    'Job queue (BullMQ) + async generation pipeline',
    'Medium — database migration management in self-hosted environments requires versioned Prisma migration docs and a clear upgrade path',
    'High', 'To Do',
  ],
  [
    'Enterprise Readiness',
    'On-Premise Deployment',
    'Helm chart for Kubernetes deployment',
    'Publish tracelms-cloud Helm chart to Artifact Hub. Chart includes: API deployment + HPA, frontend deployment, PostgreSQL subchart (optional), Redis subchart, Ingress with TLS. values.yaml with full configuration reference. Target: enterprises running on EKS, GKE, or AKS who require air-gapped or VPC-only deployment.',
    'Medium', 'Large', 'Week 8–10',
    'Docker Compose bundle (validates service boundaries)',
    'Medium — Helm chart testing matrix (3 K8s versions × 3 cloud providers) is extensive; use kind for local CI testing',
    'High', 'To Do',
  ],
  [
    'Enterprise Readiness',
    'Compliance',
    'GDPR data processing agreement + controls',
    'Draft and publish a Data Processing Agreement (DPA) for EU customers. Implement: data retention policies (configurable per-org, default 90 days), right-to-erasure endpoint (DELETE /api/account — hard-deletes all user data), data export endpoint (GET /api/account/export — GDPR Article 20), consent management for analytics. Requirement text may contain PII; document data flows.',
    'High', 'Medium', 'Week 3–4',
    'Organisation model + auth system',
    'Medium — legal review of DPA adds time; engage a GDPR-specialist solicitor; do not self-certify',
    'High', 'To Do',
  ],

  // ── 3. ECOSYSTEM & INTEGRATIONS ───────────────────────────────────────────
  [
    'Ecosystem & Integrations',
    'Public REST API',
    'API key management system',
    'Organisation admins can create, rotate, and revoke API keys from a new "API Access" section in org settings. Keys: prefix (tlm_live_ / tlm_test_), hashed storage (bcrypt), scopes (generate:read, generate:write, xray:push, admin), rate limit tier (per-key configurable). POST /api/keys, GET /api/keys, DELETE /api/keys/:id. Usage stats per key visible in the dashboard.',
    'Critical', 'Medium', 'Week 2–3',
    'Auth system (Phase 2) + Organisation model',
    'Medium — API key hashing must be one-way; show the raw key only once on creation (standard practice); implement last-used-at tracking',
    'Rank-defining', 'To Do',
  ],
  [
    'Ecosystem & Integrations',
    'Public REST API',
    'Webhook system',
    'Organisations configure webhook endpoints (URL + secret) that receive events: generation.completed, generation.failed, xray.pushed, review.approved. POST to webhook URL with HMAC-SHA256 signature header (X-TraceLMs-Signature). Retry with exponential backoff (3 attempts). Delivery log viewable in org settings. Enables automation in Zapier, Make, and n8n without polling.',
    'Critical', 'Medium', 'Week 3–4',
    'API key system + async job queue',
    'Medium — webhook delivery failures must not block generation; send async; provide a "Test webhook" button in settings',
    'Rank-defining', 'To Do',
  ],
  [
    'Ecosystem & Integrations',
    'Public REST API',
    'OpenAPI 3.1 docs site',
    'Auto-generate OpenAPI spec from Express routes using tsoa or zod-openapi. Serve interactive docs at /api/v1/docs (Scalar or Redoc — both are more polished than Swagger UI). Include: authentication guide, code examples (TypeScript, Python, curl), rate limit documentation, changelog, and SDK download links. Versioned — /api/v1/ and /api/v2/ can coexist.',
    'Critical', 'Small', 'Week 4',
    'All REST API routes stabilised',
    'Low — documentation tooling is mature; main risk is keeping docs in sync with implementation (use code-gen, not manual authoring)',
    'Rank-defining', 'To Do',
  ],
  [
    'Ecosystem & Integrations',
    'Atlassian Marketplace',
    'Atlassian Connect app manifest',
    'Create an Atlassian Connect descriptor (atlassian-connect.json). Register the app as a Jira Cloud Connect app. Implement OAuth 2.0 3LO (three-legged OAuth) for per-user Jira authentication — replaces the current Basic Auth approach. Add a Jira issue panel (glance) that shows TraceLMs Cloud generation status for the current issue. Required for Marketplace listing.',
    'Critical', 'Large', 'Week 4–7',
    'Public REST API + OAuth 2.0 system',
    'High — Atlassian Connect has strict security review requirements; the OAuth 3LO flow is more complex than Basic Auth; allow 4–6 weeks for Atlassian partner review',
    'Rank-defining', 'To Do',
  ],
  [
    'Ecosystem & Integrations',
    'Atlassian Marketplace',
    'Jira issue action — "Generate tests" button',
    'Add a Jira issue action (web panel) that appears on every Jira ticket. One click sends the issue summary + description + acceptance criteria to TraceLMs Cloud generation pipeline. Results appear in the issue panel. Push to Xray with one additional click. No context switching — QA engineers never leave Jira.',
    'Critical', 'Large', 'Week 7–9',
    'Atlassian Connect manifest + REST API',
    'Medium — Jira issue panel must be performant; SSE streaming cannot run inside an Atlassian Connect iframe; use polling instead',
    'Rank-defining', 'To Do',
  ],
  [
    'Ecosystem & Integrations',
    'Extended Integrations',
    'Azure DevOps work item integration',
    'Integrate Azure DevOps REST API: pull work items (User Stories, Bugs, Features) as requirements. Push generated test cases to Azure Test Plans. OAuth 2.0 authentication via Azure AD. Adds the entire Microsoft DevOps ecosystem (~35% of enterprise dev teams) to the addressable market.',
    'High', 'Large', 'Week 9–11',
    'Public REST API + Organisation settings',
    'Medium — Azure DevOps API is well-documented but Test Plans API has edge cases; test with both Azure DevOps Services (cloud) and Azure DevOps Server (on-premise)',
    'High', 'To Do',
  ],
  [
    'Ecosystem & Integrations',
    'Extended Integrations',
    'Linear + GitHub Issues integration',
    'Pull requirements from Linear issues and GitHub Issues as additional requirement sources (alongside Jira). OAuth 2.0 per integration. Maps Linear issue description + comments → requirement text. Target: startup engineering teams who use Linear instead of Jira — fastest-growing project management segment.',
    'Medium', 'Medium', 'Week 11–12',
    'Extended integration architecture (reuse Jira pull pattern)',
    'Low — Linear and GitHub APIs are clean and well-documented; authentication is standard OAuth 2.0',
    'High', 'To Do',
  ],
  [
    'Ecosystem & Integrations',
    'Prompt Template Marketplace',
    'Community prompt template submission + review',
    'Extend the PromptTemplate model (Phase 4) with isPublic, authorId, downloadCount, rating. Users publish templates to a public marketplace at /marketplace. Moderation queue (human or LLM-assisted) before public listing. Download installs a copy into the user\'s project. Revenue model: free community templates + paid premium templates (30/70 revenue split with authors).',
    'Medium', 'Large', 'Week 12–14',
    'Phase 4 prompt management system + payment system',
    'Medium — moderation of prompt content is an ongoing operational commitment; set clear content policy before launch',
    'High', 'To Do',
  ],

  // ── 4. AI INNOVATION ──────────────────────────────────────────────────────
  [
    'AI Innovation',
    'Fine-Tuned TraceLMs-QA Model',
    'Training data pipeline — anonymise + export',
    'Build an export pipeline: for each Generation record with feedbackScore >= 4 (positive), export { requirementText (anonymised), enhancement, scenarios, testCases } as a JSONL training pair. PII scrubbing using a regex + NER pass before export. Target: 10,000+ high-quality pairs before first fine-tuning run. Store in a private S3-compatible bucket (Supabase Storage).',
    'Critical', 'Large', 'Week 1–4',
    'Generation persistence (Phase 1) + Feedback loop (Phase 4) + sufficient usage volume',
    'High — PII scrubbing must be audited by a privacy lawyer before any data leaves production; anonymisation is a GDPR requirement if EU user data is included',
    'Rank-defining', 'To Do',
  ],
  [
    'AI Innovation',
    'Fine-Tuned TraceLMs-QA Model',
    'Fine-tune Llama 3 / Mistral on QA domain',
    'Use the anonymised training pairs to fine-tune a base open-source model (Llama 3 8B or Mistral 7B) using LoRA/QLoRA on a GPU cloud provider (Lambda Labs or Modal). Evaluate on a held-out test set: BLEU score on Gherkin output, test case completeness score, human eval by QA engineers. Target: outperform GPT-4o-mini on TraceLMs-specific generation tasks at 1/10th the cost.',
    'Critical', 'Large', 'Week 6–10',
    'Training data pipeline + GPU compute access',
    'Very High — fine-tuning results are unpredictable without sufficient data volume; do not promise a "TraceLMs-QA model" until evaluation results confirm quality; have a fallback to GPT-4o',
    'Rank-defining', 'To Do',
  ],
  [
    'AI Innovation',
    'Fine-Tuned TraceLMs-QA Model',
    'Model serving + provider integration',
    'Deploy the fine-tuned model via vLLM or Ollama (self-hosted) or Together AI / Replicate (managed). Add "TraceLMs-QA" as a 5th LLM provider in LLMService.ts. Pricing: bundled in the Pro plan (no additional per-token cost). Publish benchmark results publicly: accuracy vs GPT-4o, cost per generation, speed comparison.',
    'Critical', 'Large', 'Week 10–12',
    'Fine-tuning run + model evaluation',
    'High — model serving infrastructure adds operational complexity; start with a managed provider (Together AI) before moving to self-hosted',
    'Rank-defining', 'To Do',
  ],
  [
    'AI Innovation',
    'Autonomous Test Maintenance',
    'Jira ticket change webhook listener',
    'Subscribe to Jira webhook events: issue_updated, issue_transitioned. When a linked Jira issue changes (acceptance criteria updated, description edited), compare old vs new text using the diff engine (Phase 5). If diff detected, trigger automatic "stale test" flagging for linked test cases. Notify the project owner via email and in-app notification.',
    'High', 'Medium', 'Week 8–9',
    'Atlassian Connect app + Regression impact analysis (Phase 5) + notification system',
    'Medium — Jira webhook payloads can be noisy; implement a debounce (5-minute delay) before triggering analysis to avoid false positives on minor edits',
    'High', 'To Do',
  ],
  [
    'AI Innovation',
    'Autonomous Test Maintenance',
    'Auto-suggest updated test steps on stale detection',
    'When a test case is flagged as stale, offer a "Regenerate affected steps" action. Sends the updated requirement clause + original test case to the LLM with a targeted update prompt (not full regeneration). Returns only the changed steps. User reviews diff (old vs suggested) and accepts or discards. One-click re-push to Xray with updated version.',
    'High', 'Large', 'Week 9–11',
    'Stale test detection + test case inline editing (Phase 4)',
    'High — targeted step regeneration is harder to prompt correctly than full regeneration; invest in a dedicated maintenance prompt template',
    'High', 'To Do',
  ],
  [
    'AI Innovation',
    'Natural Language Test Suite Query',
    'Semantic search over test case RAG index',
    'Expose a search bar in the Test Cases tab: "Find all tests covering the payment flow." Backend: embed the query, cosine-search the RAG index (Phase 5) filtered by projectId + sourceType=testCase, return top-10 matches ranked by similarity score. Results highlight the matched test cases in the current view. No new LLM call required — pure vector search.',
    'High', 'Medium', 'Week 7–8',
    'RAG integration (Phase 5) + sufficient indexed test cases',
    'Low — retrieval is deterministic; main UX risk is cold-start (no results when index is empty); show "Index has N test cases" count so users understand the context',
    'High', 'To Do',
  ],
  [
    'AI Innovation',
    'Predictive Coverage Gap Analysis',
    'Sprint backlog gap scanner',
    'POST /api/generate/coverage-gaps. Accepts { jiraSprintId } or { issueKeys[] }. Fetches backlog tickets, embeds each, searches the RAG index for existing test coverage. Returns: { covered[], uncovered[], partialCoverage[] }. UI: new "Coverage" tab in the Projects section showing a coverage heatmap of the current sprint. Proactive — runs before generation, not after.',
    'Medium', 'Large', 'Week 11–13',
    'RAG integration (Phase 5) + Jira integration + sufficient generation history',
    'High — coverage gap analysis is only meaningful when the RAG index is mature (50+ generations); launch as a beta feature with minimum-index-size gate',
    'High', 'To Do',
  ],

  // ── 5. BRAND & GTM ────────────────────────────────────────────────────────
  [
    'Brand & GTM',
    'Freemium Tier',
    'Free plan tier enforcement',
    'Add a Plan model to Prisma: id, organisationId, tier (FREE/PRO/ENTERPRISE), generationsUsed (Int), generationsLimit (Int, 3 for FREE), billingCycleStart (DateTime). Middleware checks generationsUsed < generationsLimit before every generation call. On limit hit: return 402 with { error: "Free plan limit reached", upgradeUrl }. Reset counter on billing cycle rollover (monthly).',
    'Critical', 'Medium', 'Week 1–2',
    'Organisation model + auth system',
    'Low — plan enforcement logic is straightforward; ensure the counter is atomic (use a DB transaction, not application-level increment)',
    'Rank-defining', 'To Do',
  ],
  [
    'Brand & GTM',
    'Freemium Tier',
    'Upgrade flow + payment integration (Stripe)',
    'Integrate Stripe Billing: checkout session for PRO plan ($X/month), webhook handler for subscription events (created, updated, cancelled, payment_failed). On successful payment: update Organisation.tier to PRO, set generationsLimit to unlimited. Show upgrade prompt within the app when the free limit is hit: modal with feature comparison table + "Upgrade to Pro" CTA.',
    'Critical', 'Large', 'Week 2–4',
    'Free plan enforcement + Stripe account',
    'Medium — Stripe webhook handling must be idempotent (duplicate events are possible); store Stripe subscriptionId on Organisation for event routing',
    'Rank-defining', 'To Do',
  ],
  [
    'Brand & GTM',
    'Freemium Tier',
    'Public marketing site + pricing page',
    'Build a marketing site (separate from the app): hero with demo video, feature grid, pricing table (Free / Pro / Enterprise), customer logos, ROI calculator widget, and a "Book a demo" CTA for Enterprise. Technology: Next.js or Astro (fast, SEO-optimised). Domain: tracelms.cloud. The app lives at app.tracelms.cloud.',
    'Critical', 'Large', 'Week 3–6',
    'Stripe pricing finalised + core feature set stable',
    'Low — marketing site is independent of the app; can be iterated rapidly; prioritise speed-to-publish over perfection',
    'Rank-defining', 'To Do',
  ],
  [
    'Brand & GTM',
    'QA Thought Leadership',
    'LLM benchmark: "Which AI generates the best test cases?"',
    'Run a structured benchmark: 50 real-world requirement sets, 4 LLM providers, 5 quality metrics (completeness, Gherkin correctness, coverage, duplication rate, Xray push success rate). Publish results as a public report at tracelms.cloud/benchmark. Update quarterly. This is the single most effective SEO and trust-building content piece possible — it positions TraceLMs Cloud as the authority on AI test generation quality.',
    'Critical', 'Medium', 'Week 4–6',
    'All 4 LLM providers working + scoring metrics defined',
    'Medium — benchmark methodology must be rigorous enough to withstand criticism from LLM vendors; publish methodology alongside results',
    'High', 'To Do',
  ],
  [
    'Brand & GTM',
    'QA Thought Leadership',
    'Content programme — blog + SEO',
    'Publish weekly: one technical deep-dive (e.g. "How RAG improves test case quality by 40%"), one QA workflow guide (e.g. "From Jira story to Xray test in 3 minutes"), one benchmark update. Target keywords: "AI test case generation", "Jira to Xray automation", "Gherkin generator AI". Organic SEO compounds over 6–12 months and becomes the cheapest acquisition channel.',
    'High', 'Small', 'Week 4+',
    'Marketing site live',
    'Low — content is low-cost and low-risk; main risk is inconsistency; commit to a weekly cadence and maintain it',
    'High', 'To Do',
  ],
  [
    'Brand & GTM',
    'ROI Calculator',
    'Interactive ROI calculator on marketing site',
    'Calculator inputs: number of test cases per sprint, hours per test case (manual), QA engineer hourly rate, sprints per year. Output: hours saved/year, cost saved/year, TraceLMs Cloud cost, net ROI. Pre-filled defaults based on industry averages. Shareable results link. Embeddable widget for partner sites. A $200,000 ROI figure on the screen converts better than any feature list.',
    'High', 'Small', 'Week 5–6',
    'Marketing site live',
    'Low',
    'High', 'To Do',
  ],
  [
    'Brand & GTM',
    'QA Certification',
    'TraceLMs Cloud Certified QA Engineer program',
    'Create a self-paced certification course: 8 modules covering AI test generation concepts, TraceLMs Cloud workflow, prompt engineering for QA, RAG for test quality, Xray integration best practices. Assessment: 40-question exam, 80% pass mark. Certificate: verifiable credential (Credly or LinkedIn Learning badge). Price: $99 or free with Pro subscription.',
    'Medium', 'Large', 'Week 10–14',
    'Core product stable + documentation site',
    'Medium — course content creation is time-intensive; partner with a QA community (Ministry of Testing, QA Guild) to validate curriculum and co-market',
    'High', 'To Do',
  ],

  // ── 6. COMMUNITY & TRUST ─────────────────────────────────────────────────
  [
    'Community & Trust',
    'Open Source Core',
    'Extract and open-source the generation pipeline',
    'Extract src/services/llm/, src/routes/generate.ts, src/prompts/, and src/utils/ into a standalone npm package: @tracelms/core. Publish to GitHub under MIT license. The cloud platform remains proprietary (multi-tenancy, RAG, analytics, Xray push). Open-sourcing the generation engine builds developer trust, invites contributions, and creates a community of engineers who build on TraceLMs technology.',
    'Critical', 'Large', 'Week 3–5',
    'Codebase refactored into service boundaries',
    'Medium — open-sourcing requires a security review (ensure no secrets, credentials, or proprietary algorithms are in scope); establish a Contributor License Agreement (CLA) before accepting PRs',
    'Rank-defining', 'To Do',
  ],
  [
    'Community & Trust',
    'Open Source Core',
    'GitHub community infrastructure',
    'Set up the GitHub repository for @tracelms/core: CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue templates (bug report, feature request, prompt improvement), PR template with checklist, GitHub Discussions enabled. Respond to all issues within 48 hours for the first 6 months — first-response time is the single most important metric for open-source community health.',
    'Critical', 'Small', 'Week 5',
    'Open-source extraction',
    'Low — community management is a time commitment, not a technical risk; dedicate 2–3 hours per week minimum',
    'Rank-defining', 'To Do',
  ],
  [
    'Community & Trust',
    'Public API Docs',
    'Developer documentation site',
    'Build a dedicated docs site at docs.tracelms.cloud (Docusaurus or Mintlify). Sections: Getting Started (5-minute quickstart), REST API Reference (auto-generated from OpenAPI spec), Webhooks Guide, CI/CD Integration Guides (GitHub Actions, GitLab, Jenkins), SDK Reference (TypeScript + Python SDKs), Prompt Engineering Guide, RAG Index Management, Changelog. Developer experience is a product — treat the docs site like one.',
    'Critical', 'Large', 'Week 5–8',
    'OpenAPI spec + all integrations documented',
    'Low — documentation tooling is mature; main risk is keeping docs in sync; use automated OpenAPI generation to eliminate manual drift',
    'Rank-defining', 'To Do',
  ],
  [
    'Community & Trust',
    'Public API Docs',
    'TypeScript + Python SDK packages',
    'Publish @tracelms/sdk (TypeScript/Node.js) to npm and tracelms-cloud (Python) to PyPI. Auto-generated from the OpenAPI spec using openapi-generator or fern.dev. Include: full type safety, async/await API, streaming support, error handling. SDK usage is 10× more likely to result in a sticky integration than raw REST API calls.',
    'High', 'Medium', 'Week 8–9',
    'OpenAPI spec finalised + API stable',
    'Low — SDK generation from OpenAPI is well-automated; main effort is testing edge cases and writing usage examples',
    'High', 'To Do',
  ],
  [
    'Community & Trust',
    'Partner Programme',
    'QA consultancy partner programme',
    'Launch a partner programme for QA consultancies and training companies. Benefits: white-label option (custom subdomain, logo), 30% recurring revenue share on referred customers, co-marketing (partner logo on tracelms.cloud, joint case studies), priority support SLA. Application: tracelms.cloud/partners. Target: 10 certified partners in year 1. Partners scale sales without scaling headcount.',
    'High', 'Medium', 'Week 8–10',
    'Freemium + Pro plan live + marketing site',
    'Medium — partner revenue share requires clean attribution tracking (UTM + promo codes); implement before announcing the programme',
    'High', 'To Do',
  ],
  [
    'Community & Trust',
    'Public QA Benchmarks',
    'Quarterly "State of AI Test Generation" report',
    'Publish a quarterly report (PDF + web): industry adoption rates, LLM accuracy trends, most-used prompt strategies, cost-per-test-case benchmarks by provider, TraceLMs Cloud aggregate statistics (anonymised: total test cases generated, average generation time, push success rate). Submitted to QA community publications (Ministry of Testing, StickyMinds). Positions TraceLMs Cloud as the category analyst.',
    'Medium', 'Small', 'Week 10+',
    'Sufficient anonymised usage data + marketing site',
    'Low — report compilation is a recurring effort (~1 week per quarter); the compounding SEO and authority value is very high',
    'High', 'To Do',
  ],
];

// ── Pillar config ─────────────────────────────────────────────────────────────
const PILLAR_META = {
  'Product Depth':             { color: C.product,    bg: C.productBg    },
  'Enterprise Readiness':      { color: C.enterprise, bg: C.entBg        },
  'Ecosystem & Integrations':  { color: C.ecosystem,  bg: C.ecoBg        },
  'AI Innovation':             { color: C.ai,         bg: C.aiBg         },
  'Brand & GTM':               { color: C.brand,      bg: C.brandBg      },
  'Community & Trust':         { color: C.community,  bg: C.commBg       },
};

const PRIORITY_STYLE = {
  'Critical': { color: C.critical, bg: C.criticalBg },
  'High':     { color: C.high,     bg: C.highBg     },
  'Medium':   { color: C.medium,   bg: C.mediumBg   },
};
const EFFORT_STYLE = {
  'Small':  { color: C.efSmall,  bg: C.efSmallBg  },
  'Medium': { color: C.efMedium, bg: C.efMediumBg },
  'Large':  { color: C.efLarge,  bg: C.efLargeBg  },
};
const IMPACT_STYLE = {
  'Rank-defining': { color: C.rankDef, bg: C.rankDefBg },
  'High':          { color: C.impHigh, bg: C.impHighBg },
  'Medium':        { color: C.impMed,  bg: C.impMedBg  },
};
const STATUS_STYLE = {
  'To Do':       { color: C.todo,   bg: C.todoBg   },
  'In Progress': { color: C.inProg, bg: C.inProgBg },
  'Done':        { color: C.done,   bg: C.doneBg   },
};

// ── Build main task sheet ─────────────────────────────────────────────────────
async function buildMainSheet(wb) {
  const ws = wb.addWorksheet('Phase 6 — Rank 1 Plan', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  ws.columns = [
    { key: 'A', width: 22  }, // Pillar
    { key: 'B', width: 28  }, // Feature
    { key: 'C', width: 34  }, // Task
    { key: 'D', width: 56  }, // Description
    { key: 'E', width: 12  }, // Priority
    { key: 'F', width: 11  }, // Effort
    { key: 'G', width: 14  }, // Timeline
    { key: 'H', width: 36  }, // Dependencies
    { key: 'I', width: 40  }, // Risk
    { key: 'J', width: 32  }, // Market Impact
    { key: 'K', width: 13  }, // Status
  ];

  // Row 1 — banner
  ws.mergeCells('A1:K1');
  const b1 = ws.getCell('A1');
  b1.value = 'TraceLMs Cloud — Phase 6: Rank-1 Strategy Implementation Plan';
  b1.fill = fill(C.headerDark);
  b1.font = fnt({ bold: true, size: 16, color: C.white });
  b1.alignment = aln('center', 'middle');
  ws.getRow(1).height = 36;

  // Row 2 — meta
  ws.mergeCells('A2:K2');
  const b2 = ws.getCell('A2');
  b2.value = `Version 0.1.0 base · Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · Target score: 9.6/10 (Rank 1) · 6 Pillars · ${TASKS.length} Tasks`;
  b2.fill = fill('1E293B');
  b2.font = fnt({ italic: true, size: 10, color: 'CBD5E1' });
  b2.alignment = aln('center', 'middle');
  ws.getRow(2).height = 18;

  // Row 3 — legend
  const legendRow = ws.getRow(3);
  legendRow.height = 20;
  const lgCols = ['A','B','C','D','E','F','G','H','I','J','K'];
  lgCols.forEach(col => {
    const c = ws.getCell(`${col}3`);
    c.fill = fill(C.surface);
    c.border = { bottom: { style: 'thin', color: hex(C.border) } };
  });
  ws.getCell('A3').value = 'Legend →';
  ws.getCell('A3').font = fnt({ size: 9, bold: true, color: C.textMuted });
  ws.getCell('A3').alignment = aln('left', 'middle', false);

  const legends = [
    ['B3', 'Critical', C.critical, C.criticalBg],
    ['C3', 'High priority', C.high, C.highBg],
    ['D3', 'Medium priority', C.medium, C.mediumBg],
    ['E3', 'Small effort', C.efSmall, C.efSmallBg],
    ['F3', 'Large effort', C.efLarge, C.efLargeBg],
    ['G3', 'Rank-defining', C.rankDef, C.rankDefBg],
    ['H3', 'To Do', C.todo, C.todoBg],
    ['I3', 'In Progress', C.inProg, C.inProgBg],
    ['J3', 'Done', C.done, C.doneBg],
  ];
  legends.forEach(([ref, label, color, bg]) => {
    const c = ws.getCell(ref);
    c.value = label;
    c.fill = fill(bg);
    c.font = fnt({ size: 9, bold: true, color });
    c.alignment = aln('center', 'middle', false);
    c.border = { bottom: { style: 'thin', color: hex(C.border) } };
  });

  // Row 4 — column headers
  const HEADERS = ['Pillar', 'Feature', 'Task', 'Description', 'Priority', 'Effort', 'Timeline', 'Dependencies', 'Risk', 'Market Impact', 'Status'];
  const hRow = ws.getRow(4);
  hRow.height = 28;
  HEADERS.forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    const c = ws.getCell(`${col}4`);
    c.value = h;
    c.fill = fill(C.headerDark);
    c.font = fnt({ bold: true, size: 11, color: C.white });
    c.alignment = aln('center', 'middle');
    c.border = bdr(C.headerDark);
  });

  // Data rows
  let rowN = 5;
  TASKS.forEach((task, idx) => {
    const [pillar, feature, taskName, desc, priority, effort, timeline, deps, risk, impact, status] = task;
    const pm = PILLAR_META[pillar] || { color: C.textMuted, bg: C.surface };
    const isAlt = idx % 2 === 1;
    const rowBg = isAlt ? 'F8FAFC' : C.white;

    const row = ws.getRow(rowN);
    row.height = 64;

    const vals = [pillar, feature, taskName, desc, priority, effort, timeline, deps, risk, impact, status];
    const cols = ['A','B','C','D','E','F','G','H','I','J','K'];

    vals.forEach((val, ci) => {
      const col = cols[ci];
      const cell = ws.getCell(`${col}${rowN}`);
      cell.value = val;
      cell.border = bdr(C.border);
      cell.alignment = aln('left', 'middle', true);

      // Pillar
      if (ci === 0) {
        cell.fill = fill(pm.bg);
        cell.font = fnt({ bold: true, size: 10, color: pm.color });
        cell.border = { ...bdr(C.border), left: { style: 'medium', color: hex(pm.color) } };
        return;
      }
      // Feature
      if (ci === 1) {
        cell.fill = fill(isAlt ? pm.bg : C.white);
        cell.font = fnt({ bold: true, size: 10, color: pm.color });
        return;
      }
      // Task name
      if (ci === 2) {
        cell.fill = fill(rowBg);
        cell.font = fnt({ bold: true, size: 10 });
        return;
      }
      // Priority chip
      if (ci === 4) {
        const s = PRIORITY_STYLE[val] || { color: C.textMuted, bg: C.surface };
        cell.fill = fill(s.bg);
        cell.font = fnt({ bold: true, size: 10, color: s.color });
        cell.alignment = aln('center', 'middle', false);
        return;
      }
      // Effort chip
      if (ci === 5) {
        const s = EFFORT_STYLE[val] || { color: C.textMuted, bg: C.surface };
        cell.fill = fill(s.bg);
        cell.font = fnt({ bold: true, size: 10, color: s.color });
        cell.alignment = aln('center', 'middle', false);
        return;
      }
      // Timeline
      if (ci === 6) {
        cell.fill = fill(isAlt ? pm.bg : C.white);
        cell.font = fnt({ size: 10, color: pm.color });
        cell.alignment = aln('center', 'middle', false);
        return;
      }
      // Impact chip
      if (ci === 9) {
        const s = IMPACT_STYLE[val] || { color: C.textMuted, bg: C.surface };
        cell.fill = fill(s.bg);
        cell.font = fnt({ bold: true, size: 10, color: s.color });
        cell.alignment = aln('left', 'middle', true);
        return;
      }
      // Status chip
      if (ci === 10) {
        const s = STATUS_STYLE[val] || { color: C.todo, bg: C.todoBg };
        cell.fill = fill(s.bg);
        cell.font = fnt({ bold: true, size: 10, color: s.color });
        cell.alignment = aln('center', 'middle', false);
        return;
      }
      // Default
      cell.fill = fill(rowBg);
      cell.font = fnt({ size: 10 });
    });

    rowN++;
  });

  return ws;
}

// ── Build summary sheet ───────────────────────────────────────────────────────
async function buildSummarySheet(wb) {
  const ws = wb.addWorksheet('Summary', { views: [{ state: 'normal' }] });

  ws.columns = [
    { key: 'A', width: 30 },
    { key: 'B', width: 14 },
    { key: 'C', width: 14 },
    { key: 'D', width: 14 },
    { key: 'E', width: 18 },
    { key: 'F', width: 22 },
  ];

  // Banner
  ws.mergeCells('A1:F1');
  const b = ws.getCell('A1');
  b.value = 'TraceLMs Cloud Phase 6 — Summary Dashboard';
  b.fill = fill(C.headerDark);
  b.font = fnt({ bold: true, size: 15, color: C.white });
  b.alignment = aln('center', 'middle');
  ws.getRow(1).height = 34;

  ws.mergeCells('A2:F2');
  const b2 = ws.getCell('A2');
  b2.value = `${TASKS.length} total tasks · 6 pillars · Target: 9.6/10 (Rank 1) · Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  b2.fill = fill('1E293B');
  b2.font = fnt({ italic: true, size: 10, color: 'CBD5E1' });
  b2.alignment = aln('center', 'middle');
  ws.getRow(2).height = 18;

  // Spacer
  ws.getRow(3).height = 10;

  // Stats header
  const sh = ['Metric', 'Total', 'Critical', 'High', 'Rank-defining', 'Est. Duration'];
  ws.getRow(4).height = 26;
  sh.forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    const c = ws.getCell(`${col}4`);
    c.value = h;
    c.fill = fill(C.headerDark);
    c.font = fnt({ bold: true, size: 11, color: C.white });
    c.alignment = aln('center', 'middle');
    c.border = bdr(C.headerDark);
  });

  const pillars = Object.keys(PILLAR_META);
  pillars.forEach((pillar, pi) => {
    const tasks = TASKS.filter(t => t[0] === pillar);
    const critical = tasks.filter(t => t[4] === 'Critical').length;
    const high = tasks.filter(t => t[4] === 'High').length;
    const rankDef = tasks.filter(t => t[9] === 'Rank-defining').length;
    const pm = PILLAR_META[pillar];
    const durations = ['Weeks 1–12', 'Weeks 1–10', 'Weeks 2–14', 'Weeks 1–13', 'Weeks 1–14', 'Weeks 3–10+'];

    const rowN = 5 + pi;
    ws.getRow(rowN).height = 24;
    const vals = [pillar, tasks.length, critical, high, rankDef, durations[pi]];
    vals.forEach((v, ci) => {
      const col = String.fromCharCode(65 + ci);
      const c = ws.getCell(`${col}${rowN}`);
      c.value = v;
      c.fill = fill(ci === 0 ? pm.bg : (pi % 2 === 0 ? C.white : C.offWhite));
      c.font = fnt({ bold: ci === 0, size: 11, color: ci === 0 ? pm.color : C.textPri });
      c.alignment = aln(ci === 0 ? 'left' : 'center', 'middle', false);
      c.border = bdr(C.border);
      if (ci === 0) {
        c.border = { ...bdr(C.border), left: { style: 'medium', color: hex(pm.color) } };
      }
    });
  });

  // Totals row
  const totN = 5 + pillars.length;
  ws.getRow(totN).height = 26;
  const totVals = [
    'Grand Total',
    TASKS.length,
    TASKS.filter(t => t[4] === 'Critical').length,
    TASKS.filter(t => t[4] === 'High').length,
    TASKS.filter(t => t[9] === 'Rank-defining').length,
    'Weeks 1–14+',
  ];
  totVals.forEach((v, ci) => {
    const col = String.fromCharCode(65 + ci);
    const c = ws.getCell(`${col}${totN}`);
    c.value = v;
    c.fill = fill(C.headerDark);
    c.font = fnt({ bold: true, size: 11, color: C.white });
    c.alignment = aln(ci === 0 ? 'left' : 'center', 'middle', false);
    c.border = bdr(C.headerDark);
  });

  // Spacer
  ws.getRow(totN + 1).height = 14;

  // The 5 rank-1 moves
  ws.mergeCells(`A${totN + 2}:F${totN + 2}`);
  const mv = ws.getCell(`A${totN + 2}`);
  mv.value = 'The 5 moves that change the ranking most';
  mv.fill = fill(C.headerDark);
  mv.font = fnt({ bold: true, size: 12, color: C.white });
  mv.alignment = aln('center', 'middle');
  ws.getRow(totN + 2).height = 26;

  const moves = [
    ['1', 'Test execution runner', 'Closes the only end-to-end gap in the market. No competitor owns the generate → execute → report loop.', C.product, C.productBg],
    ['2', 'SOC 2 Type II', 'Unlocks enterprise deals above $30k/yr. The single highest-ROI non-engineering investment on the list.', C.enterprise, C.entBg],
    ['3', 'Atlassian Marketplace listing', '300,000+ Jira teams browse it. Anchors TraceLMs Cloud as the AI test generation layer for the Atlassian ecosystem.', C.ecosystem, C.ecoBg],
    ['4', 'Fine-tuned TraceLMs-QA model', 'A QA-specialist model that outperforms GPT-4o on test generation is a moat no competitor can buy.', C.ai, C.aiBg],
    ['5', 'Open-source core + freemium tier', 'Removes payment friction. Builds developer trust through transparency. Creates compounding word-of-mouth.', C.community, C.commBg],
  ];

  moves.forEach(([num, title, desc, color, bg], mi) => {
    const rn = totN + 3 + mi;
    ws.getRow(rn).height = 40;
    ws.mergeCells(`B${rn}:C${rn}`);
    ws.mergeCells(`D${rn}:F${rn}`);

    const numC = ws.getCell(`A${rn}`);
    numC.value = num;
    numC.fill = fill(bg);
    numC.font = fnt({ bold: true, size: 18, color });
    numC.alignment = aln('center', 'middle', false);
    numC.border = { ...bdr(C.border), left: { style: 'medium', color: hex(color) } };

    const titleC = ws.getCell(`B${rn}`);
    titleC.value = title;
    titleC.fill = fill(bg);
    titleC.font = fnt({ bold: true, size: 11, color });
    titleC.alignment = aln('left', 'middle', false);
    titleC.border = bdr(C.border);

    const descC = ws.getCell(`D${rn}`);
    descC.value = desc;
    descC.fill = fill(mi % 2 === 0 ? C.white : C.offWhite);
    descC.font = fnt({ size: 10, color: C.textMuted });
    descC.alignment = aln('left', 'middle', true);
    descC.border = bdr(C.border);
  });
}

// ── Build pillar sheets ───────────────────────────────────────────────────────
async function buildPillarSheet(wb, pillar) {
  const pm = PILLAR_META[pillar];
  const tasks = TASKS.filter(t => t[0] === pillar);
  const shortName = pillar.length > 28 ? pillar.slice(0, 28) + '…' : pillar;

  const ws = wb.addWorksheet(shortName, {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }],
  });

  ws.columns = [
    { key: 'A', width: 28 },
    { key: 'B', width: 36 },
    { key: 'C', width: 54 },
    { key: 'D', width: 12 },
    { key: 'E', width: 11 },
    { key: 'F', width: 14 },
    { key: 'G', width: 36 },
    { key: 'H', width: 42 },
    { key: 'I', width: 30 },
    { key: 'J', width: 12 },
  ];

  // Banner
  ws.mergeCells('A1:J1');
  const b1 = ws.getCell('A1');
  b1.value = `Phase 6 — ${pillar}`;
  b1.fill = fill(pm.color);
  b1.font = fnt({ bold: true, size: 15, color: C.white });
  b1.alignment = aln('center', 'middle');
  ws.getRow(1).height = 32;

  ws.mergeCells('A2:J2');
  const b2 = ws.getCell('A2');
  b2.value = `${tasks.length} tasks · ${tasks.filter(t => t[4] === 'Critical').length} critical · ${tasks.filter(t => t[9] === 'Rank-defining').length} rank-defining`;
  b2.fill = fill(pm.bg);
  b2.font = fnt({ italic: true, size: 10, color: pm.color });
  b2.alignment = aln('center', 'middle');
  ws.getRow(2).height = 18;

  // Headers
  const HDRS = ['Feature', 'Task', 'Description', 'Priority', 'Effort', 'Timeline', 'Dependencies', 'Risk', 'Market Impact', 'Status'];
  const hRow = ws.getRow(3);
  hRow.height = 26;
  HDRS.forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    const c = ws.getCell(`${col}3`);
    c.value = h;
    c.fill = fill(pm.color);
    c.font = fnt({ bold: true, size: 10, color: C.white });
    c.alignment = aln('center', 'middle');
    c.border = bdr(pm.color);
  });

  // Data
  tasks.forEach((task, idx) => {
    const [, feature, taskName, desc, priority, effort, timeline, deps, risk, impact, status] = task;
    const isAlt = idx % 2 === 1;
    const rowBg = isAlt ? pm.bg : C.white;
    const rowN = 4 + idx;
    ws.getRow(rowN).height = 60;

    const vals = [feature, taskName, desc, priority, effort, timeline, deps, risk, impact, status];
    const cols = ['A','B','C','D','E','F','G','H','I','J'];

    vals.forEach((val, ci) => {
      const col = cols[ci];
      const cell = ws.getCell(`${col}${rowN}`);
      cell.value = val;
      cell.border = bdr(C.border);
      cell.alignment = aln('left', 'middle', true);

      if (ci === 0) { // Feature
        cell.fill = fill(pm.bg);
        cell.font = fnt({ bold: true, size: 10, color: pm.color });
        cell.border = { ...bdr(C.border), left: { style: 'medium', color: hex(pm.color) } };
        return;
      }
      if (ci === 1) { // Task
        cell.fill = fill(rowBg);
        cell.font = fnt({ bold: true, size: 10 });
        return;
      }
      if (ci === 3) { // Priority
        const s = PRIORITY_STYLE[val] || { color: C.textMuted, bg: C.surface };
        cell.fill = fill(s.bg);
        cell.font = fnt({ bold: true, size: 10, color: s.color });
        cell.alignment = aln('center', 'middle', false);
        return;
      }
      if (ci === 4) { // Effort
        const s = EFFORT_STYLE[val] || { color: C.textMuted, bg: C.surface };
        cell.fill = fill(s.bg);
        cell.font = fnt({ bold: true, size: 10, color: s.color });
        cell.alignment = aln('center', 'middle', false);
        return;
      }
      if (ci === 5) { // Timeline
        cell.fill = fill(isAlt ? pm.bg : C.white);
        cell.font = fnt({ size: 10, color: pm.color });
        cell.alignment = aln('center', 'middle', false);
        return;
      }
      if (ci === 8) { // Impact
        const s = IMPACT_STYLE[val] || { color: C.textMuted, bg: C.surface };
        cell.fill = fill(s.bg);
        cell.font = fnt({ bold: true, size: 10, color: s.color });
        return;
      }
      if (ci === 9) { // Status
        const s = STATUS_STYLE[val] || { color: C.todo, bg: C.todoBg };
        cell.fill = fill(s.bg);
        cell.font = fnt({ bold: true, size: 10, color: s.color });
        cell.alignment = aln('center', 'middle', false);
        return;
      }
      cell.fill = fill(rowBg);
      cell.font = fnt({ size: 10 });
    });
  });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TraceLMs Cloud — /TraceDesign';
  wb.created = new Date();
  wb.modified = new Date();

  // Build sheets
  await buildSummarySheet(wb);
  await buildMainSheet(wb);
  for (const pillar of Object.keys(PILLAR_META)) {
    await buildPillarSheet(wb, pillar);
  }

  await wb.xlsx.writeFile(OUT);
  const critical = TASKS.filter(t => t[4] === 'Critical').length;
  const rankDef  = TASKS.filter(t => t[9] === 'Rank-defining').length;
  console.log('Written:', OUT);
  console.log(`Total tasks: ${TASKS.length} | Critical: ${critical} | Rank-defining: ${rankDef}`);
  Object.keys(PILLAR_META).forEach(p => {
    const n = TASKS.filter(t => t[0] === p).length;
    console.log(`  ${p}: ${n} tasks`);
  });
}

run().catch(err => { console.error(err.message); process.exit(1); });
