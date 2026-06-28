// Generates TraceLMs Cloud Phase 4 & 5 Implementation Plan as a styled .xlsx
// Run: node scripts/generate-roadmap-excel.js

const ExcelJS = require('exceljs');
const path = require('path');

const OUT = path.join(
  __dirname,
  '../DOCUMENTATION/TraceLMs Cloud/TraceLMs_Cloud_Implementation_Plan_Phase4_5.xlsx'
);

// ── Brand palette ─────────────────────────────────────────────────────────────
const C = {
  accent:       '2D5BE3',  // TraceLMs blue — primary brand
  accentDark:   '1A3BA8',  // darker variant for headings
  accentLight:  'EEF2FF',  // very light blue — alternate row / section bg
  white:        'FFFFFF',
  offWhite:     'F8F9FC',
  surface:      'F4F5F7',
  border:       'D0D5E8',
  textPrimary:  '1A1A2E',
  textMuted:    '6B7280',

  // Status pills
  high:         'DC2626', highBg:    'FEF2F2',
  medium:       'D97706', mediumBg:  'FFFBEB',
  low:          '059669', lowBg:     'ECFDF5',

  // Phase badges
  p4:           '7C3AED', p4Bg: 'F5F3FF',  // purple — Phase 4
  p5:           'DB2777', p5Bg: 'FDF2F8',  // pink   — Phase 5

  // Effort badges
  efSmall:      '0891B2', efSmallBg:  'ECFEFF',
  efMedium:     'D97706', efMediumBg: 'FFFBEB',
  efLarge:      'DC2626', efLargeBg:  'FEF2F2',

  // Status chips
  todo:         '6B7280', todoBg:     'F3F4F6',
  inProg:       '2563EB', inProgBg:   'EFF6FF',
  done:         '059669', doneBg:     'ECFDF5',
};

function hex(code) { return { argb: 'FF' + code }; }

function fill(color) {
  return { type: 'pattern', pattern: 'solid', fgColor: hex(color) };
}

function border(color = C.border) {
  const s = { style: 'thin', color: hex(color) };
  return { top: s, left: s, bottom: s, right: s };
}

function font(opts = {}) {
  return {
    name: 'Calibri',
    size: opts.size || 10,
    bold: opts.bold || false,
    color: hex(opts.color || C.textPrimary),
    italic: opts.italic || false,
  };
}

function align(h = 'left', v = 'middle', wrap = true) {
  return { horizontal: h, vertical: v, wrapText: wrap };
}

// Apply a style object to a cell
function style(cell, opts = {}) {
  if (opts.fill)   cell.fill   = fill(opts.fill);
  if (opts.font)   cell.font   = font(opts.font);
  if (opts.align)  cell.alignment = opts.align;
  if (opts.border !== false) cell.border = border(opts.borderColor);
  cell.alignment = { ...(cell.alignment || {}), ...(opts.align || align()) };
}

// Merge + style + write a header cell
function header(ws, ref, value, opts = {}) {
  const cell = ws.getCell(ref);
  cell.value = value;
  cell.fill  = fill(opts.fill || C.accentDark);
  cell.font  = font({ bold: true, color: opts.color || C.white, size: opts.size || 11 });
  cell.alignment = align(opts.h || 'center', 'middle', true);
  cell.border = border(opts.borderColor || C.accentDark);
}

// Write a plain data cell
function data(ws, ref, value, opts = {}) {
  const cell = ws.getCell(ref);
  cell.value = value;
  cell.fill  = fill(opts.fill || C.white);
  cell.font  = font({ bold: opts.bold, color: opts.color || C.textPrimary, size: opts.size || 10, italic: opts.italic });
  cell.alignment = align(opts.h || 'left', 'middle', true);
  cell.border = border(opts.borderColor || C.border);
}

// ── Data ──────────────────────────────────────────────────────────────────────

const PHASE4_TASKS = [
  // [Feature, Task, Description, Priority, Effort, Timeline (weeks), Dependencies, Risk, User Impact, Status]
  [
    'Prompt Management UI',
    'Prisma PromptTemplate model',
    'Add model: id, name, step (enhancement/scenarios/testcases/automation), content (text), isDefault, isActive, createdAt/updatedAt. Migration + seed with current .txt file contents.',
    'High', 'Small', 'Week 1', 'Phase 1 (persistence)', 'Low — schema change only; no breaking changes to routes', 'Foundation for all prompt editing features',
    'To Do'
  ],
  [
    'Prompt Management UI',
    'GET /api/prompts route',
    'Returns all prompt templates grouped by step. Supports ?step=enhancement query param. Returns id, name, step, isDefault, isActive.',
    'High', 'Small', 'Week 1', 'PromptTemplate model', 'Low', 'Backend API for prompt listing',
    'To Do'
  ],
  [
    'Prompt Management UI',
    'PUT /api/prompts/:id route',
    'Updates content of a prompt template. Validates that step is a valid enum value. Returns updated record.',
    'High', 'Small', 'Week 1', 'GET /api/prompts', 'Medium — invalid prompt content could break generation', 'Allows in-browser prompt editing',
    'To Do'
  ],
  [
    'Prompt Management UI',
    'POST /api/prompts/reset/:id route',
    'Resets a template to its seed default (reads original .txt file). Prevents users from losing the baseline prompt.',
    'Medium', 'Small', 'Week 1', 'PUT /api/prompts/:id', 'Low', 'Safe recovery path for broken prompts',
    'To Do'
  ],
  [
    'Prompt Management UI',
    'Prompts tab UI — list view',
    'New sidebar tab "Prompts". Four cards, one per generation step. Shows prompt name, step badge, character count, last modified date. Edit button opens editor modal.',
    'High', 'Medium', 'Week 2', 'GET /api/prompts', 'Medium — new tab increases sidebar length; audit layout at 540px', 'Users can see and manage all system prompts from the browser',
    'To Do'
  ],
  [
    'Prompt Management UI',
    'Prompt editor modal',
    'Fullscreen modal with a <textarea> pre-filled with current prompt content. Save, Reset to Default, Cancel buttons. Character count footer. Confirm-guard on Save if content exceeds diff threshold.',
    'High', 'Medium', 'Week 2', 'Prompts tab list view', 'Medium — large text area UX; keyboard trap in modal', 'Prompt changes take effect immediately on next generation',
    'To Do'
  ],
  [
    'Prompt Management UI',
    'Wire generate routes to DB prompts',
    'Replace fs.readFileSync() in generate.ts with a DB lookup. Falls back to .txt file if no active DB template exists for a step. Enables hot-reload of prompts without redeploy.',
    'High', 'Medium', 'Week 2', 'All prompt routes + editor', 'High — prompt load failure must fall back gracefully, not crash generation', 'Prompt changes are live immediately; no server restart required',
    'To Do'
  ],
  [
    'Per-Project Prompt Customization',
    'Add optional projectId FK to PromptTemplate',
    'NULL projectId = global default. Non-null = project override. Route logic: load project-scoped prompt first, fall back to global. Enables per-project prompt variations.',
    'Medium', 'Small', 'Week 3', 'PromptTemplate model + Projects (Phase 3)', 'Low', 'Different teams can use different prompt strategies',
    'To Do'
  ],
  [
    'Per-Project Prompt Customization',
    'Project-scoped prompt override UI',
    'In project settings page (Phase 3), add a "Customize Prompts" section. Inherits global defaults. User can override any step prompt for this project only.',
    'Medium', 'Medium', 'Week 3', 'Projects tab (Phase 3) + Prompt editor modal', 'Medium — UI complexity; must clearly show inherited vs overridden', 'Project teams have isolated prompt tuning without affecting other projects',
    'To Do'
  ],
  [
    'Test Case Inline Editing',
    'Editable test case state in TestCasesTab',
    'Replace read-only display with editable fields: title (text input), steps (textarea or ordered list), expected result (textarea), test data (textarea), layer/priority (select). Track dirty state per item.',
    'High', 'Medium', 'Week 3', 'Phase 1 (persistence — edits must survive refresh)', 'Medium — complex state; dirty tracking + undo risk', 'Users can correct AI output without full re-generation',
    'To Do'
  ],
  [
    'Test Case Inline Editing',
    'PATCH /api/generation/:id/testcases route',
    'Accepts partial update to testCases JSON blob for a Generation record. Validates structure, merges, persists. Returns updated testCases.',
    'High', 'Small', 'Week 3', 'Generation persistence (Phase 1)', 'Low', 'Test case edits are saved server-side',
    'To Do'
  ],
  [
    'Test Case Inline Editing',
    'Gherkin editor with syntax hint',
    'Textarea for Gherkin field with a monospace font, line numbers optional, and a small hint label "Given / When / Then". No full syntax highlight needed at this stage.',
    'Medium', 'Small', 'Week 4', 'Editable test case state', 'Low', 'QA engineers can write clean Gherkin without leaving the browser',
    'To Do'
  ],
  [
    'Test Case Inline Editing',
    'Save edits + re-export flow',
    'Save button in TestCasesTab footer. After save, updates localStorage and optionally syncs to Generation DB record. Edited test cases flow into Output tab and Xray push without re-generation.',
    'High', 'Small', 'Week 4', 'PATCH route + editable state', 'Low', 'Full edit-to-push cycle without re-running generation',
    'To Do'
  ],
  [
    'Generation Feedback Loop',
    'Thumbs up/down per test case',
    'Add a feedback row below each TestCaseItem: 👍 Useful / 👎 Not useful / 📝 Comment (optional text). Stored in a new Feedback Prisma model linked to Generation + testCaseId.',
    'Medium', 'Small', 'Week 4', 'Phase 1 persistence', 'Low', 'Captures quality signal for future prompt tuning',
    'To Do'
  ],
  [
    'Generation Feedback Loop',
    'POST /api/feedback route',
    'Accepts { generationId, testCaseId, rating: "up"|"down", comment? }. Upserts into Feedback table.',
    'Medium', 'Small', 'Week 4', 'Feedback Prisma model', 'Low', 'Feedback data available for analytics and prompt improvement',
    'To Do'
  ],
  [
    'Generation Feedback Loop',
    'Feedback summary on Enhancement tab',
    'Show aggregate feedback counts at the top of Enhancement tab (total ratings, % positive). Provides a lightweight quality dashboard without a full analytics build.',
    'Low', 'Small', 'Week 5', 'Feedback route', 'Low', 'Team sees at-a-glance quality trend per generation session',
    'To Do'
  ],
  // ── NEW: Token Consumption Visibility (real-time layer — moved from Phase 5 analytics) ──
  [
    'Token Consumption Visibility',
    'Per-provider token extraction service',
    'Normalise token count responses across all 4 providers into a unified shape: { promptTokens, completionTokens, totalTokens }. OpenAI/Groq: usage object. Anthropic: usage.input_tokens/output_tokens. Gemini: usageMetadata. Attach to LLMResponse type.',
    'High', 'Small', 'Week 5', 'LLMService + all *Provider.ts files', 'Medium — each provider SDK returns token data in a different shape; Gemini streaming may not expose per-chunk counts', 'Foundation for all cost and quota visibility features',
    'To Do'
  ],
  [
    'Token Consumption Visibility',
    'Token fields on Generation record',
    'Add promptTokens (Int), completionTokens (Int), totalTokens (Int), estimatedCostUSD (Float) to the Generation Prisma model. Persist per step: enhancementTokens, scenariosTokens, testCasesTokens, automationTokens (JSON map). Populated at generation completion.',
    'High', 'Small', 'Week 5', 'Token extraction service + Generation persistence (Phase 1)', 'Low — additive schema change; no breaking migrations', 'Raw data available for real-time display and downstream analytics',
    'To Do'
  ],
  [
    'Token Consumption Visibility',
    'Real-time token counter in SSE feedback',
    'During streaming, show a token estimate in the generation feedback label: "Phase 1: Enhancement + Scenarios... (~1,240 tokens)". Use character-to-token ratio heuristic (1 token ≈ 4 chars) for in-flight estimate; replace with exact count from done event.',
    'High', 'Small', 'Week 5', 'Token extraction service + SSE done event', 'Low — estimate is advisory; exact count shown post-completion', 'Users see cost signal in real time without waiting for a dashboard',
    'To Do'
  ],
  [
    'Token Consumption Visibility',
    'Per-step token summary card post-generation',
    'After Generate All completes, show a collapsible "Token Usage" card below the generation progress bar. Rows: Enhancement, Scenarios, Test Cases, Automation Analysis — each with prompt tokens, completion tokens, subtotal. Footer: grand total + estimated cost (USD).',
    'High', 'Medium', 'Week 5', 'Token fields on Generation + real-time counter', 'Low', 'Immediate cost visibility after every generation; no dashboard needed',
    'To Do'
  ],
  [
    'Token Consumption Visibility',
    'Token budget warning gate',
    'Allow users to set a soft token budget per generation (default: 50,000 tokens). If estimated usage would exceed it based on requirement text length, show an advisory warning beside Generate All: "Large requirement — estimated ~60k tokens. Continue?" Does not block.',
    'Medium', 'Small', 'Week 6', 'Per-step token summary + Settings tab', 'Low — advisory only; estimate uses character heuristic', 'Teams with strict API quotas get a heads-up before committing to a large generation run',
    'To Do'
  ],
  // ── Model Scoring (shifted to Week 6–7 to follow token data foundation) ──
  [
    'Model Scoring',
    'Provider + model tracking on Generation record',
    'Generation table already has llmProvider + llmModel. Add durationMs (Int) and feedbackScore (Float) computed fields. Populated at generation completion. Token fields covered by Token Consumption Visibility above.',
    'Medium', 'Small', 'Week 6', 'Token fields on Generation + Feedback loop', 'Low', 'Raw performance data available for model comparison',
    'To Do'
  ],
  [
    'Model Scoring',
    'GET /api/analytics/model-scores route',
    'Returns aggregated stats per provider+model: avg feedback score, avg duration, total generations, avg token cost. Simple GROUP BY query. Now powered by token fields added in Token Consumption Visibility.',
    'Medium', 'Small', 'Week 6', 'Token tracking on Generation + durationMs', 'Low', 'Enables data-driven model comparison in the UI',
    'To Do'
  ],
  [
    'Model Scoring',
    'Model Scoring card in LLM Providers tab',
    'Replace the current read-only placeholder LLM Providers tab with a live scoring table: provider, model, avg quality score, avg generation time, avg token cost, # runs. Sortable columns.',
    'Low', 'Medium', 'Week 7', 'Model scores route', 'Low', 'Teams make data-driven decisions on which LLM to use',
    'To Do'
  ],
];

const PHASE5_TASKS = [
  [
    'Bi-directional Requirement Traceability',
    'RequirementClause Prisma model',
    'Stores extracted clauses from the original requirement text: id, generationId, index, text, hash. Generated server-side when requirements are submitted. Links scenarios and test cases back to source clause indices.',
    'High', 'Medium', 'Week 1–2', 'Phase 4 complete + Phase 1 persistence', 'Medium — clause extraction quality depends on LLM prompt accuracy', 'Every test case traceable to a specific requirement sentence',
    'To Do'
  ],
  [
    'Bi-directional Requirement Traceability',
    'POST /api/generate/trace-map route',
    'Sends requirements + test cases to LLM. Returns a mapping: { testCaseId → requirementClauseIndices[] }. Uses a dedicated traceability prompt (new prompt template).',
    'High', 'Medium', 'Week 2', 'RequirementClause model + PromptTemplate system (Phase 4)', 'High — LLM may hallucinate incorrect clause mappings; need confidence scoring', 'Automated requirement coverage mapping',
    'To Do'
  ],
  [
    'Bi-directional Requirement Traceability',
    'Traceability matrix view in TestCases tab',
    'Toggle: switch TestCases tab between Card View and Traceability Matrix. Matrix shows requirement clauses as rows, test cases as columns. Cell filled = linked. Exportable as CSV.',
    'High', 'Large', 'Week 3', 'Trace map route', 'Medium — large matrices require virtualization for 50+ test cases', 'QA leads can present coverage evidence to stakeholders',
    'To Do'
  ],
  [
    'Bi-directional Requirement Traceability',
    'Stale test case detection',
    'When requirements are modified, hash-compare old vs new clauses. Flag test cases linked to changed clauses as "Stale — requirement changed." Show warning badge on affected items.',
    'High', 'Medium', 'Week 3', 'Traceability matrix + Generation persistence', 'Medium — clause hashing must be deterministic across whitespace variations', 'Teams know exactly which tests need review after a requirement change',
    'To Do'
  ],
  [
    'Regression Impact Analysis',
    'Requirement diff engine',
    'Accept two requirement texts (previous + current). Perform sentence-level diff. Classify each changed clause as Added / Modified / Removed. Return structured diff object.',
    'High', 'Medium', 'Week 4', 'Traceability (clause model)', 'Medium — sentence tokenization across languages or formatting variations', 'Change impact is computed automatically, not manually',
    'To Do'
  ],
  [
    'Regression Impact Analysis',
    'POST /api/generate/regression-impact route',
    'Accepts { previousRequirements, currentRequirements, generationId }. Runs diff engine + cross-references traceability map. Returns: { affectedTestCases[], newCoverageGaps[], unchanged[] }.',
    'High', 'Large', 'Week 4–5', 'Diff engine + trace map', 'High — large diffs create long LLM prompts; may need chunking like automation batching', 'Instant impact report when requirements evolve',
    'To Do'
  ],
  [
    'Regression Impact Analysis',
    'Regression Impact panel UI',
    'New panel (expandable, slides in from right) on the Requirements tab. Appears when a previous generation exists. Shows: # tests affected, # gaps added, suggested regression run. One-click to highlight affected test cases.',
    'High', 'Large', 'Week 5', 'Regression impact route', 'Medium — panel must not obscure the requirement editor on narrow viewports', 'QA lead gets a targeted regression run recommendation in seconds',
    'To Do'
  ],
  [
    'Regression Impact Analysis',
    'Suggested regression run export',
    'Export affected test cases only as a filtered Xray push payload. Pre-populates the Xray push with only the stale/impacted cases. Saves engineers from manually filtering a 100-test suite.',
    'Medium', 'Small', 'Week 5', 'Regression impact panel', 'Low', 'Targeted regression push without manual selection',
    'To Do'
  ],
  [
    'Stakeholder Approval Workflow',
    'WorkflowReview Prisma model',
    'Stores a review request: id, generationId, stakeholderEmail, status (PENDING/APPROVED/REJECTED/COMMENTED), comment, token (UUID for email link), expiresAt, createdAt.',
    'High', 'Small', 'Week 6', 'Phase 3 (Stakeholders) + Generation persistence', 'Low', 'Foundation for email-driven review loop',
    'To Do'
  ],
  [
    'Stakeholder Approval Workflow',
    'Email notification system',
    'Integrate a transactional email provider (Resend or SendGrid). Send review-request email to stakeholders when a generation is complete. Email contains a unique token link to the review page.',
    'High', 'Medium', 'Week 6', 'WorkflowReview model', 'Medium — email deliverability, token expiry handling, provider cost', 'Stakeholders notified automatically; no manual Jira comment needed',
    'To Do'
  ],
  [
    'Stakeholder Approval Workflow',
    'Public review page (no auth required)',
    'Token-gated page at /review/:token. Shows generation summary (requirement text, test case count). Approve / Request Changes / Comment controls. Token expires after 7 days.',
    'High', 'Large', 'Week 7', 'Email notification + WorkflowReview model', 'Medium — public route; token must be cryptographically random (UUID v4 minimum)', 'Stakeholders review without needing a TraceLMs Cloud account',
    'To Do'
  ],
  [
    'Stakeholder Approval Workflow',
    'Review status dashboard in Projects tab',
    'In the project detail view, show all pending reviews with status chips (Pending / Approved / Changes Requested). Resend button for expired tokens. Block Xray push if reviews are outstanding (optional gate).',
    'Medium', 'Medium', 'Week 7', 'Public review page', 'Low', 'PM/QA lead has full visibility of approval state without Jira',
    'To Do'
  ],
  // ── NEW: RAG — inserted before Requirement Quality Score ──
  [
    'RAG Integration',
    'Vector store infrastructure (pgvector)',
    'Enable the pgvector Supabase extension. Add EmbeddingRecord Prisma model: id, sourceType (requirement|testCase|scenario), sourceId, generationId, projectId, vector (unsupported — stored as raw Float[] or via Supabase pgvector column), createdAt. Establish the embedding index.',
    'High', 'Medium', 'Week 8', 'Phase 3 (Projects) + Generation persistence (Phase 1)', 'Medium — pgvector on Supabase requires the extension to be enabled; vector dimensions must match embedding model (1536 for OpenAI ada-002, 768 for Gemini)', 'Foundation for all retrieval-augmented features; unlocks project-aware generation',
    'To Do'
  ],
  [
    'RAG Integration',
    'Embedding pipeline service',
    'New EmbeddingService class. On generation completion: embed requirement text + each test case + each scenario using the configured LLM provider\'s embedding API (OpenAI text-embedding-3-small, Gemini embedding-001, Voyage for Anthropic, Groq via nomic-embed-text). Store vectors in pgvector. Run asynchronously — does not block generation response.',
    'High', 'Large', 'Week 8–9', 'Vector store infrastructure + Generation persistence', 'High — each provider has a different embedding API; Groq does not have a native embedding endpoint (fallback needed); async pipeline must handle failures gracefully without losing generation data', 'Historical test cases and requirements are automatically indexed for retrieval',
    'To Do'
  ],
  [
    'RAG Integration',
    'Retrieval service — top-K similar context',
    'New RetrievalService.retrieve(query, projectId, sourceType, topK). Embeds query text, performs cosine similarity search against pgvector store filtered by projectId + sourceType. Returns top-K matches with similarity scores. Configurable K (default 5).',
    'High', 'Medium', 'Week 9', 'Embedding pipeline + pgvector index', 'Medium — cold start problem: retrieval is useless until enough generations have been indexed; first ~5 generations per project produce no RAG benefit', 'Retrieval layer ready for injection into generation prompts',
    'To Do'
  ],
  [
    'RAG Integration',
    'Wire retrieval into generation prompts',
    'In generate.ts, before each LLM call: invoke RetrievalService with requirement text + projectId. Prepend top-K retrieved test cases and scenarios into the system prompt as "Relevant prior test cases from this project:". Capped at 2,000 tokens to avoid context overflow. Retrieval failure falls back to standard prompt silently.',
    'High', 'Medium', 'Week 9', 'Retrieval service + PromptTemplate system (Phase 4)', 'High — injected context increases prompt token count; must enforce cap to prevent exceeding provider context limits; monitor token usage increase via Token Consumption Visibility (Phase 4)', 'Generation is grounded in project-specific history — fewer duplicates, better pattern consistency',
    'To Do'
  ],
  [
    'RAG Integration',
    'RAG context toggle in Requirements tab',
    'Add a toggle switch in the Requirements tab header: "Enhance with project history (RAG)". Default ON when the project has ≥ 5 indexed generations. Default OFF for new projects (cold start). Shows a tooltip: "Uses your past test cases to improve generation quality." Disabled state with label "Not enough history yet" when index is empty.',
    'High', 'Medium', 'Week 10', 'Retrieval service + Requirements tab UI', 'Low — toggle is purely additive; disabling falls back to current non-RAG generation unchanged', 'Users control RAG explicitly; cold-start projects are not silently degraded',
    'To Do'
  ],
  [
    'RAG Integration',
    'RAG index management UI',
    'In the project settings page (Phase 3), add a "Knowledge Index" section. Shows: # documents indexed, # test cases indexed, last indexed date, index size estimate. Buttons: Re-index Project (re-embeds all past generations), Clear Index (confirm guard). Useful when prompt strategy changes and old embeddings should be invalidated.',
    'Medium', 'Medium', 'Week 10', 'Embedding pipeline + Projects tab (Phase 3)', 'Medium — re-indexing large projects triggers many embedding API calls; should run as a background job with progress feedback', 'Teams manage their RAG context explicitly; stale embeddings can be cleared without losing generation history',
    'To Do'
  ],
  // ── LLM Cost Analytics Dashboard — re-sequenced to Week 11–12 (now builds on Phase 4 token data) ──
  [
    'LLM Cost Analytics Dashboard',
    'Cost per-provider pricing config',
    'Hardcode (or DB-configurable) cost-per-1k-token rates for each provider+model. Used to compute estimatedCostUSD. Updateable via admin route when provider pricing changes. Token fields already populated by Phase 4 Token Consumption Visibility — this task adds the pricing layer on top.',
    'High', 'Small', 'Week 11', 'Token fields on Generation (Phase 4)', 'Medium — pricing changes frequently; hardcoded values become stale', 'Accurate cost estimates per generation without new data collection work',
    'To Do'
  ],
  [
    'LLM Cost Analytics Dashboard',
    'GET /api/analytics/cost-summary route',
    'Returns: total cost (all time), cost per provider, cost per project, cost per model, cost trend (last 30 days by day). Powered by GROUP BY queries on Generation table using token fields from Phase 4.',
    'High', 'Small', 'Week 11', 'Cost per-provider pricing config', 'Low', 'Backend ready for analytics dashboard consumption',
    'To Do'
  ],
  [
    'LLM Cost Analytics Dashboard',
    'Analytics dashboard tab UI',
    'New "Analytics" sidebar tab. Summary cards: Total Spend (all-time), This Month, Most Used Model, Best Value Model, RAG Retrieval Rate. Bar chart: cost by provider. Line chart: daily spend trend (30 days). Table: top 10 most expensive generations with RAG on/off indicator.',
    'High', 'Large', 'Week 12', 'Cost summary route + RAG Integration', 'Medium — charting library adds bundle size; consider recharts (lightweight, React-native)', 'Teams see full spend picture including RAG impact; can justify or switch provider based on data',
    'To Do'
  ],
  [
    'LLM Cost Analytics Dashboard',
    'Cost per generation in history view',
    'In the Generation history list (Phase 3), show estimated cost alongside each generation. Small cost pill badge: green < $0.10, yellow $0.10–$0.50, red > $0.50. RAG badge: show "RAG" chip on generations that used retrieval context.',
    'Medium', 'Small', 'Week 12', 'Analytics dashboard + Generation history', 'Low', 'Instant cost + RAG visibility in history without opening the full dashboard',
    'To Do'
  ],
  [
    'Requirement Quality Score',
    'Quality scoring prompt + route',
    'New prompt template: "Analyze these requirements for completeness, ambiguity, testability, and traceability. Return JSON: { overallScore (0–100), completeness, ambiguity, testability, traceability (each 0–100), issues[], suggestions[] }." When RAG is active, retrieved similar requirements are prepended as scoring context.',
    'High', 'Medium', 'Week 13', 'Phase 4 prompt management system + RAG Integration', 'High — LLM scoring is subjective; scores may vary between runs (non-deterministic); RAG context improves consistency but adds latency', 'Objective quality gate before generation; RAG-enhanced scoring is more accurate for domain-specific requirements',
    'To Do'
  ],
  [
    'Requirement Quality Score',
    'POST /api/generate/quality-score route',
    'Accepts { requirements, projectId? }. Returns quality score JSON. When projectId is provided and RAG index exists, retrieved similar requirements are included as scoring context. Cached per content-hash to avoid re-scoring identical requirements.',
    'High', 'Small', 'Week 13', 'Quality scoring prompt + RAG retrieval service', 'Low', 'Instant, project-aware feedback on requirement quality',
    'To Do'
  ],
  [
    'Requirement Quality Score',
    'Quality score banner in Requirements tab',
    'After requirements are entered (on blur or manual "Check Quality" button), show a score banner below the Requirement Editor card. Radial score dial (0–100) + color: red < 60, yellow 60–80, green > 80. Expandable issues list. When RAG is active, banner shows "Scored against N similar project requirements" as context label.',
    'High', 'Large', 'Week 13', 'Quality score route + RAG toggle', 'Medium — must not auto-trigger on every keystroke; debounce or manual trigger needed', 'QA lead gets upstream signal on requirement quality before wasting LLM tokens on generation; RAG context makes scoring more project-relevant',
    'To Do'
  ],
  [
    'Requirement Quality Score',
    'Generate All gate based on quality score',
    'If quality score < 60, show a soft warning beside the Generate All button: "Requirements may be incomplete — generation quality may be affected." Does not block generation (advisory only). RAG toggle also visible here so user can enable project context before generating.',
    'Medium', 'Small', 'Week 13', 'Quality score banner + RAG toggle', 'Low — advisory only, never blocks user', 'Informed generation decisions; RAG context available at the exact moment the user is deciding whether to generate',
    'To Do'
  ],
  [
    'Requirement Quality Score',
    'Historical quality trend per project',
    'Track quality scores per Generation record. In the project detail view, show a sparkline of quality score over time. Overlay RAG-on vs RAG-off generations as different series to show quality delta. Reveals whether requirement quality is improving and whether RAG is contributing.',
    'Low', 'Medium', 'Week 14', 'Quality score route + Generation history (Phase 3) + RAG Integration', 'Low', 'Long-term quality improvement visibility; RAG contribution is measurable and visible to PMs and QA leads',
    'To Do'
  ],
];

// ── Workbook ──────────────────────────────────────────────────────────────────

async function run() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TraceLMs Cloud — /TraceBlueprint';
  wb.created = new Date();
  wb.modified = new Date();

  // ── Sheet helper ─────────────────────────────────────────────────────────────

  function buildSheet(wb, sheetName, phase, color, bgLight, tasks) {
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    // Column widths
    ws.columns = [
      { key: 'A', width: 28 },  // Feature
      { key: 'B', width: 36 },  // Task
      { key: 'C', width: 55 },  // Description
      { key: 'D', width: 12 },  // Priority
      { key: 'E', width: 12 },  // Effort
      { key: 'F', width: 16 },  // Timeline
      { key: 'G', width: 35 },  // Dependencies
      { key: 'H', width: 38 },  // Risk
      { key: 'I', width: 40 },  // User Impact
      { key: 'J', width: 13 },  // Status
    ];

    // ── Row 1: Phase banner ─────────────────────────────────────────────────
    ws.mergeCells('A1:J1');
    const bannerCell = ws.getCell('A1');
    bannerCell.value = `TraceLMs Cloud — ${phase} Implementation Plan`;
    bannerCell.fill  = fill(color);
    bannerCell.font  = { name: 'Calibri', size: 18, bold: true, color: hex(C.white) };
    bannerCell.alignment = align('center', 'middle');
    ws.getRow(1).height = 38;

    // ── Row 2: Sub-banner (version + date) ─────────────────────────────────
    ws.mergeCells('A2:J2');
    const subCell = ws.getCell('A2');
    subCell.value = `Version 0.1.0 · Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · Source: Technical Document v0.1.0`;
    subCell.fill  = fill(bgLight);
    subCell.font  = { name: 'Calibri', size: 10, italic: true, color: hex(color) };
    subCell.alignment = align('center', 'middle');
    ws.getRow(2).height = 20;

    // ── Row 3: Legend ───────────────────────────────────────────────────────
    const legendLabels = [
      ['Priority:', 'High', C.high, C.highBg],
      ['', 'Medium', C.medium, C.mediumBg],
      ['', 'Low', C.low, C.lowBg],
      ['Effort:', 'Small (1–3d)', C.efSmall, C.efSmallBg],
      ['', 'Medium (1–2w)', C.efMedium, C.efMediumBg],
      ['', 'Large (3w+)', C.efLarge, C.efLargeBg],
      ['Status:', 'To Do', C.todo, C.todoBg],
      ['', 'In Progress', C.inProg, C.inProgBg],
      ['', 'Done', C.done, C.doneBg],
    ];

    ws.mergeCells('A3:J3');
    const legendRow = ws.getRow(3);
    legendRow.height = 22;
    const legendMerge = ws.getCell('A3');
    legendMerge.fill = fill('FAFBFF');
    legendMerge.value = '';

    // Use individual columns for legend — unmerge and redo as separate cells
    ws.unMergeCells('A3:J3');
    const legItems = ['High', 'Medium', 'Low', 'Small (1–3d)', 'Medium (1–2w)', 'Large (3w+)', 'To Do', 'In Progress', 'Done'];
    const legColors = [
      [C.high, C.highBg], [C.medium, C.mediumBg], [C.low, C.lowBg],
      [C.efSmall, C.efSmallBg], [C.efMedium, C.efMediumBg], [C.efLarge, C.efLargeBg],
      [C.todo, C.todoBg], [C.inProg, C.inProgBg], [C.done, C.doneBg],
    ];
    // Place a compact legend across the 10 columns in a single row
    const legendRow3 = ws.getRow(3);
    legendRow3.height = 20;
    // Merge pairs for spacing
    const cols = ['A','B','C','D','E','F','G','H','I','J'];
    // Simple: write "Legend →" in A3, then fill rest
    ws.getCell('A3').value = 'Legend →';
    ws.getCell('A3').font = { name: 'Calibri', size: 9, bold: true, color: hex(C.textMuted) };
    ws.getCell('A3').fill = fill('FAFBFF');
    ws.getCell('A3').alignment = align('left','middle',false);
    ws.getCell('A3').border = { bottom: { style: 'thin', color: hex(C.border) } };

    const legendCols = ['B','C','D','E','F','G','H','I','J'];
    legItems.forEach((label, idx) => {
      const col = legendCols[idx];
      if (!col) return;
      const c = ws.getCell(`${col}3`);
      c.value = label;
      c.fill = fill(legColors[idx][1]);
      c.font = { name: 'Calibri', size: 9, bold: true, color: hex(legColors[idx][0]) };
      c.alignment = align('center','middle',false);
      c.border = { bottom: { style: 'thin', color: hex(C.border) } };
    });

    // ── Row 4: Column headers ───────────────────────────────────────────────
    const headers = ['Feature', 'Task', 'Description', 'Priority', 'Effort', 'Timeline', 'Dependencies', 'Risk', 'User Impact', 'Status'];
    const hRow = ws.getRow(4);
    hRow.height = 30;
    headers.forEach((h, idx) => {
      const col = String.fromCharCode(65 + idx);
      const cell = ws.getCell(`${col}4`);
      cell.value = h;
      cell.fill  = fill(C.accentDark);
      cell.font  = { name: 'Calibri', size: 11, bold: true, color: hex(C.white) };
      cell.alignment = align('center', 'middle');
      cell.border = border(C.accentDark);
    });

    // ── Data rows ───────────────────────────────────────────────────────────
    let currentFeature = '';
    let rowNum = 5;

    // Priority chip colors
    const priorityStyle = {
      'High':   { color: C.high,   bg: C.highBg },
      'Medium': { color: C.medium, bg: C.mediumBg },
      'Low':    { color: C.low,    bg: C.lowBg },
    };
    const effortStyle = {
      'Small':  { color: C.efSmall,  bg: C.efSmallBg },
      'Medium': { color: C.efMedium, bg: C.efMediumBg },
      'Large':  { color: C.efLarge,  bg: C.efLargeBg },
    };
    const statusStyle = {
      'To Do':       { color: C.todo,   bg: C.todoBg },
      'In Progress': { color: C.inProg, bg: C.inProgBg },
      'Done':        { color: C.done,   bg: C.doneBg },
    };

    tasks.forEach((task, taskIdx) => {
      const [feature, taskName, desc, priority, effort, timeline, deps, risk, impact, status] = task;
      const isAltRow = taskIdx % 2 === 1;
      const rowBg = isAltRow ? C.accentLight : C.white;

      const row = ws.getRow(rowNum);
      row.height = 58;

      const cols = ['A','B','C','D','E','F','G','H','I','J'];
      const values = [feature, taskName, desc, priority, effort, timeline, deps, risk, impact, status];
      const chip = { D: priorityStyle, E: effortStyle, J: statusStyle };

      values.forEach((val, idx) => {
        const col = cols[idx];
        const cell = ws.getCell(`${col}${rowNum}`);
        cell.value = val;
        cell.border = border(C.border);
        cell.alignment = align('left', 'middle', true);

        // Feature column — bold, colored
        if (col === 'A') {
          cell.fill = fill(bgLight);
          cell.font = { name: 'Calibri', size: 10, bold: true, color: hex(color) };
          return;
        }

        // Chip columns (Priority, Effort, Status)
        const chipMap = { D: priorityStyle, E: effortStyle, J: statusStyle };
        if (chipMap[col]) {
          const s = chipMap[col][val] || { color: C.textMuted, bg: C.surface };
          cell.fill = fill(s.bg);
          cell.font = { name: 'Calibri', size: 10, bold: true, color: hex(s.color) };
          cell.alignment = align('center', 'middle', false);
          return;
        }

        // Timeline
        if (col === 'F') {
          cell.fill = fill(rowBg);
          cell.font = { name: 'Calibri', size: 10, bold: false, color: hex(color) };
          cell.alignment = align('center', 'middle', false);
          return;
        }

        // Default
        cell.fill = fill(rowBg);
        cell.font = { name: 'Calibri', size: 10, color: hex(C.textPrimary) };
      });

      rowNum++;
    });

    // Feature column — group identical feature names visually with a left accent border
    let featureStart = 5;
    let featureEnd = 5;
    let lastFeature = tasks[0][0];
    let featureIdx = 0;

    tasks.forEach((task, idx) => {
      const f = task[0];
      if (f !== lastFeature || idx === tasks.length - 1) {
        const endRow = idx === tasks.length - 1 ? rowNum - 1 : rowNum - 2;
        // Add thick left border to feature column cells of this group
        for (let r = featureStart; r <= endRow; r++) {
          const cell = ws.getCell(`A${r}`);
          cell.border = {
            top: { style: 'thin', color: hex(C.border) },
            bottom: { style: 'thin', color: hex(C.border) },
            right: { style: 'thin', color: hex(C.border) },
            left: { style: 'medium', color: hex(color) }, // accent left border per feature group
          };
        }
        featureStart = rowNum - 1;
        lastFeature = f;
      }
    });

    // Freeze header rows
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];

    return ws;
  }

  // ── Sheet 1: Phase 4 ─────────────────────────────────────────────────────

  buildSheet(
    wb,
    'Phase 4 — AI Quality',
    'Phase 4 — AI Quality & Prompt Management',
    C.p4, C.p4Bg,
    PHASE4_TASKS
  );

  // ── Sheet 2: Phase 5 ─────────────────────────────────────────────────────

  buildSheet(
    wb,
    'Phase 5 — Differentiators',
    'Phase 5 — Market Differentiators',
    C.p5, C.p5Bg,
    PHASE5_TASKS
  );

  // ── Sheet 3: Summary dashboard ───────────────────────────────────────────

  const ws3 = wb.addWorksheet('Summary', {
    views: [{ state: 'normal' }],
  });

  ws3.columns = [
    { key: 'A', width: 35 },
    { key: 'B', width: 18 },
    { key: 'C', width: 18 },
    { key: 'D', width: 18 },
    { key: 'E', width: 18 },
    { key: 'F', width: 20 },
  ];

  // Title
  ws3.mergeCells('A1:F1');
  const s1 = ws3.getCell('A1');
  s1.value = 'TraceLMs Cloud — Phase 4 & 5 Implementation Summary';
  s1.fill = fill(C.accentDark);
  s1.font = { name: 'Calibri', size: 16, bold: true, color: hex(C.white) };
  s1.alignment = align('center', 'middle');
  ws3.getRow(1).height = 36;

  ws3.mergeCells('A2:F2');
  const s2 = ws3.getCell('A2');
  s2.value = `Version 0.1.0 · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  s2.fill = fill(C.accentLight);
  s2.font = { name: 'Calibri', size: 10, italic: true, color: hex(C.accentDark) };
  s2.alignment = align('center', 'middle');
  ws3.getRow(2).height = 18;

  // Spacer
  ws3.getRow(3).height = 10;

  // Phase stats headers
  const statsHeaders = ['Metric', 'Phase 4 Total', 'Phase 4 High', 'Phase 5 Total', 'Phase 5 High', 'Grand Total'];
  ws3.getRow(4).height = 28;
  statsHeaders.forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    const c = ws3.getCell(`${col}4`);
    c.value = h;
    c.fill = fill(C.accentDark);
    c.font = { name: 'Calibri', size: 11, bold: true, color: hex(C.white) };
    c.alignment = align('center', 'middle');
    c.border = border(C.accentDark);
  });

  const p4High = PHASE4_TASKS.filter(t => t[3] === 'High').length;
  const p5High = PHASE5_TASKS.filter(t => t[3] === 'High').length;

  const statsRows = [
    ['Total Tasks',           PHASE4_TASKS.length, p4High, PHASE5_TASKS.length, p5High, PHASE4_TASKS.length + PHASE5_TASKS.length],
    ['High Priority Tasks',   p4High, '-', p5High, '-', p4High + p5High],
    ['Medium Priority Tasks', PHASE4_TASKS.filter(t=>t[3]==='Medium').length, '-', PHASE5_TASKS.filter(t=>t[3]==='Medium').length, '-', PHASE4_TASKS.filter(t=>t[3]==='Medium').length + PHASE5_TASKS.filter(t=>t[3]==='Medium').length],
    ['Low Priority Tasks',    PHASE4_TASKS.filter(t=>t[3]==='Low').length, '-', PHASE5_TASKS.filter(t=>t[3]==='Low').length, '-', PHASE4_TASKS.filter(t=>t[3]==='Low').length + PHASE5_TASKS.filter(t=>t[3]==='Low').length],
    ['Small Effort Tasks',    PHASE4_TASKS.filter(t=>t[4]==='Small').length, '-', PHASE5_TASKS.filter(t=>t[4]==='Small').length, '-', PHASE4_TASKS.filter(t=>t[4]==='Small').length + PHASE5_TASKS.filter(t=>t[4]==='Small').length],
    ['Medium Effort Tasks',   PHASE4_TASKS.filter(t=>t[4]==='Medium').length, '-', PHASE5_TASKS.filter(t=>t[4]==='Medium').length, '-', PHASE4_TASKS.filter(t=>t[4]==='Medium').length + PHASE5_TASKS.filter(t=>t[4]==='Medium').length],
    ['Large Effort Tasks',    PHASE4_TASKS.filter(t=>t[4]==='Large').length, '-', PHASE5_TASKS.filter(t=>t[4]==='Large').length, '-', PHASE4_TASKS.filter(t=>t[4]==='Large').length + PHASE5_TASKS.filter(t=>t[4]==='Large').length],
    ['Estimated Duration',    'Weeks 1–7', '-', 'Weeks 8–14+', '-', '~14 Weeks'],
  ];

  statsRows.forEach((row, rIdx) => {
    const rowN = 5 + rIdx;
    ws3.getRow(rowN).height = 24;
    const bg = rIdx % 2 === 0 ? C.white : C.accentLight;
    row.forEach((val, cIdx) => {
      const col = String.fromCharCode(65 + cIdx);
      const c = ws3.getCell(`${col}${rowN}`);
      c.value = val;
      c.fill = fill(cIdx === 0 ? C.surface : bg);
      c.font = { name: 'Calibri', size: 11, bold: cIdx === 0 || cIdx === 5, color: hex(cIdx === 5 ? C.accentDark : C.textPrimary) };
      c.alignment = align(cIdx === 0 ? 'left' : 'center', 'middle');
      c.border = border(C.border);
    });
  });

  // Spacer
  ws3.getRow(14).height = 20;

  // Feature breakdown table
  ws3.mergeCells('A15:F15');
  const fbHeader = ws3.getCell('A15');
  fbHeader.value = 'Feature Breakdown';
  fbHeader.fill = fill(C.accentDark);
  fbHeader.font = { name: 'Calibri', size: 12, bold: true, color: hex(C.white) };
  fbHeader.alignment = align('center', 'middle');
  ws3.getRow(15).height = 26;

  const fbCols = ['Phase', 'Feature', 'Task Count', 'High Priority', 'Timeline', 'Notes'];
  ws3.getRow(16).height = 24;
  fbCols.forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    const c = ws3.getCell(`${col}16`);
    c.value = h;
    c.fill = fill(C.p4);
    c.font = { name: 'Calibri', size: 10, bold: true, color: hex(C.white) };
    c.alignment = align('center', 'middle');
    c.border = border(C.p4);
  });

  const featureGroups4 = {};
  PHASE4_TASKS.forEach(t => {
    if (!featureGroups4[t[0]]) featureGroups4[t[0]] = { count: 0, high: 0, timeline: t[5] };
    featureGroups4[t[0]].count++;
    if (t[3] === 'High') featureGroups4[t[0]].high++;
    featureGroups4[t[0]].timeline = t[5];
  });

  const featureGroups5 = {};
  PHASE5_TASKS.forEach(t => {
    if (!featureGroups5[t[0]]) featureGroups5[t[0]] = { count: 0, high: 0, timeline: t[5] };
    featureGroups5[t[0]].count++;
    if (t[3] === 'High') featureGroups5[t[0]].high++;
    featureGroups5[t[0]].timeline = t[5];
  });

  const p4Notes = {
    'Prompt Management UI': 'Requires DB migration + prompt route wiring',
    'Per-Project Prompt Customization': 'Depends on Projects (Phase 3)',
    'Test Case Inline Editing': 'Requires persistence (Phase 1)',
    'Generation Feedback Loop': 'New Feedback Prisma model needed',
    'Token Consumption Visibility': 'NEW — moved from Phase 5; real-time layer for Phase 5 analytics',
    'Model Scoring': 'Shifted to Wk 6–7; now builds on token fields added above',
  };
  const p5Notes = {
    'Bi-directional Requirement Traceability': 'Core Phase 5 enabler — other features depend on this',
    'Regression Impact Analysis': 'High LLM prompt complexity; needs batching like automation',
    'Stakeholder Approval Workflow': 'Requires transactional email provider (Resend/SendGrid)',
    'RAG Integration': 'NEW — pgvector on Supabase; embedding pipeline runs async post-generation',
    'LLM Cost Analytics Dashboard': 'Re-sequenced to Wk 11–12; now builds on Phase 4 token data',
    'Requirement Quality Score': 'Re-sequenced to Wk 13–14; now RAG-enhanced for better accuracy',
  };

  let fbRow = 17;
  Object.entries(featureGroups4).forEach(([feat, data], i) => {
    const bg = i % 2 === 0 ? C.p4Bg : C.white;
    ws3.getRow(fbRow).height = 22;
    const vals = ['Phase 4', feat, data.count, data.high, data.timeline, p4Notes[feat] || ''];
    vals.forEach((v, ci) => {
      const col = String.fromCharCode(65 + ci);
      const c = ws3.getCell(`${col}${fbRow}`);
      c.value = v;
      c.fill = fill(ci === 0 ? C.p4Bg : bg);
      c.font = { name: 'Calibri', size: 10, bold: ci === 0, color: hex(ci === 0 ? C.p4 : C.textPrimary) };
      c.alignment = align(ci === 0 || ci === 1 ? 'left' : 'center', 'middle');
      c.border = border(C.border);
    });
    fbRow++;
  });

  Object.entries(featureGroups5).forEach(([feat, data], i) => {
    const bg = i % 2 === 0 ? C.p5Bg : C.white;
    ws3.getRow(fbRow).height = 22;
    const vals = ['Phase 5', feat, data.count, data.high, data.timeline, p5Notes[feat] || ''];
    vals.forEach((v, ci) => {
      const col = String.fromCharCode(65 + ci);
      const c = ws3.getCell(`${col}${fbRow}`);
      c.value = v;
      c.fill = fill(ci === 0 ? C.p5Bg : bg);
      c.font = { name: 'Calibri', size: 10, bold: ci === 0, color: hex(ci === 0 ? C.p5 : C.textPrimary) };
      c.alignment = align(ci === 0 || ci === 1 ? 'left' : 'center', 'middle');
      c.border = border(C.border);
    });
    fbRow++;
  });

  // ── Write file ────────────────────────────────────────────────────────────
  await wb.xlsx.writeFile(OUT);
  console.log('Written:', OUT);
  console.log(`Phase 4: ${PHASE4_TASKS.length} tasks | Phase 5: ${PHASE5_TASKS.length} tasks`);
}

run().catch((err) => { console.error(err.message); process.exit(1); });
