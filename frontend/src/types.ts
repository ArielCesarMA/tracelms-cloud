export type Settings = {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  jiraUrl: string;
  jiraProjectKey: string;
  jiraEmail: string;
  jiraApiToken: string;
  xrayClientId: string;
  xrayClientSecret: string;
  xrayBatchSize: string;
  xrayBatchDelayMs: string;
  xrayMaxRetries: string;
};

export type ParsedFile = {
  name: string;
  text: string;
  error?: string;
  hash?: string;
  clean?: boolean;
  flaggedPatterns?: string[];
  truncated?: boolean;
  errorCode?: string;
};

export type JiraIssueSummary = {
  key: string;
  summary: string;
  description: string;
  issueType?: string;
  priority?: string;
};

export type RequirementType =
  | 'Functional'
  | 'Non-Functional'
  | 'Business Rule'
  | 'Validation'
  | 'Security'
  | 'Privacy'
  | 'Integration'
  | 'Data'
  | 'Notification'
  | 'UI/UX'
  | 'Reporting'
  | 'Compliance';

export type IssueType = 'Epic' | 'Story';
export type RequirementPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type ExtractedRequirement = {
  reqId: string;
  summary: string;
  description: string;
  issueType: IssueType;
  requirementType: RequirementType;
  priority: RequirementPriority;
  source: 'upload' | 'jira';
  lowConfidence?: boolean;
};

export type UploadDraft = {
  name: string;
  mimeType: string;
  contentBase64: string;
  isImage?: boolean;
  thumbnailUrl?: string;
  sizeError?: string;
};

export type JiraMode = 'single' | 'multiple' | 'epic' | 'multiStory';

export type TabKey =
  | 'requirements'
  | 'enhancement'
  | 'scenarios'
  | 'testCases'
  | 'automation'
  | 'integrations'
  | 'llm-providers'
  | 'projects'
  | 'prompts'
  | 'output'
  | 'documents'
  | 'users'
  | 'admin'
  | 'guide';

export type PromptStep = 'ENHANCEMENT' | 'SCENARIOS' | 'TEST_CASES' | 'AUTOMATION';

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type PromptTemplate = {
  id: string;
  name: string;
  step: PromptStep;
  content: string;
  isDefault: boolean;
  isActive: boolean;
  projectId?: string | null;
  updatedAt: string;
};

export type ModelScore = {
  model: string;
  provider: string;
  runs: number;
  avgTokens: number;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  successRate: number;
};

// ─── Document Generation Hub ──────────────────────────────────────────────────

export type DocumentType = 'test-plan' | 'test-strategy';

export type TestPlanSubsection = {
  id: string;
  heading: string;
  content: string;
};

export type TestPlanSection = {
  id: string;
  heading: string;
  content?: string;
  subsections?: TestPlanSubsection[];
};

export type TestPlanDocument = {
  title: string;
  documentType: 'test-plan';
  version: string;
  date: string;
  projectName: string;
  preparedBy: string;
  sections: TestPlanSection[];
};

export type TestStrategyDocument = {
  title: string;
  documentType: 'test-strategy';
  version: string;
  date: string;
  projectName: string;
  preparedBy: string;
  sections: TestPlanSection[];
};

export type GeneratedDocument = TestPlanDocument | TestStrategyDocument;

export type GeneratedDocuments = {
  'test-plan'?: TestPlanDocument;
  'test-strategy'?: TestStrategyDocument;
};

export type RequirementEnhancement = {
  missingFunctional: string[];
  missingNonFunctional: string[];
  bestPractices: string[];
  marketBenchmark: string[];
  risks: string[];
  clarifyingQuestions: string[];
};

export type ScenarioType = 'HP' | 'AF' | 'EC' | 'EG' | 'BR';
export type ScenarioPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type ScenarioItem = {
  id: string;
  title: string;
  type?: ScenarioType;
  requirementRefs: string[];
  preconditions: string[];
  flow: string[];
  expectedOutcome: string;
  priority: string;
};

export type TestCaseItem = {
  id: string;
  title: string;
  testType: 'Functional' | 'Negative' | 'Edge' | 'Integration';
  scenarioId: string;
  requirementRefs: string[];
  gherkin: string;
  preconditions: string[];
  steps: string[];
  expectedResult: string;
  testData: string;
  layer: 'Unit' | 'API' | 'UI';
  priority: string;
};

export type AutomationCandidateItem = {
  testCaseId: string;
  scenarioId: string;
  requirementRef: string;
  candidate: boolean;
  exclusionReason: string;
  feasibilityLevel: 'High' | 'Medium' | 'Low' | 'Not Feasible' | 'Evidence Required';
  feasibility: number;
  roiLevel: 'High' | 'Medium' | 'Low' | 'Negative' | 'Evidence Required';
  roiScore: number;
  layer: 'Unit' | 'API' | 'UI';
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  playwrightAutomatable: 'Yes' | 'Partial' | 'No';
  playwrightScope: 'UI' | 'API' | 'N/A';
  blocker: string;
  notes: string;
};

export type AutomationAnalysis = {
  summary: string;
  recommendedOrder: string[];
  items: AutomationCandidateItem[];
};

export type PushErrorClass = 'success' | 'duplicate' | 'validation' | 'permanent';

export type XrayPushedIssue = {
  localId: string;
  success: boolean;
  key: string;
  url: string;
  message: string;
  isValidationError?: boolean;
  errorClass?: PushErrorClass;
  fixPath?: string;
};

export type XrayPushPreview = {
  totalCases: number;
  validationErrors: number;
  duplicates: number;
  willPush: number;
  details: Array<{
    id: string;
    title: string;
    status: 'valid' | 'validation-error' | 'duplicate';
    message: string;
  }>;
};

export type XrayPushProgress = {
  message: string;
  batchIndex: number;
  totalBatches: number;
  status: 'started' | 'retrying' | 'completed';
};

// ─── RBAC ─────────────────────────────────────────────────────────────────────

export type OrgRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export type ProjectRole = 'LEAD' | 'EDITOR' | 'REVIEWER' | 'VIEWER';

export type AuthUser = {
  id: string;
  email: string;
  role: OrgRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

// ─── Projects ─────────────────────────────────────────────────────────────────

export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

// Legacy alias kept for existing code; prefer ProjectMember.
export type StakeholderRole = 'QA Lead' | 'Product Owner' | 'Developer' | 'Observer';

export type ProjectMember = {
  id: string;
  email: string;
  name: string;
  projectRole: ProjectRole;
  userId?: string | null;
  createdAt?: string;
};

// Backward-compat alias
export type Stakeholder = ProjectMember;

export type ApprovalConsensus = 'ANY' | 'ALL';

export type ApprovalLayerMember = {
  id?: string;
  name: string;
  email: string;
};

export type ApprovalLayer = {
  id?: string;
  order: number;
  consensus: ApprovalConsensus;
  members: ApprovalLayerMember[];
};

export type Project = {
  id: string;
  name: string;
  key: string;
  description: string;
  jiraProjectKey: string;
  status: ProjectStatus;
  owner: string;
  ownerId?: string;
  approvalLayers?: ApprovalLayer[];
  members: ProjectMember[];
  /** @deprecated API now returns `members`; this alias remains for gradual migration */
  stakeholders?: ProjectMember[];
  _count?: { generations: number };
  createdAt: string;
  updatedAt: string;
};

export type GenerationHistoryItem = {
  id: string;
  requirementPreview: string;
  llmProvider: string;
  llmModel: string;
  status: string;
  totalTestCases: number;
  totalScenarios: number;
  projectId: string | null;
  hasDocuments?: boolean;
  createdAt: string;
};

// ─────────────────────────────────────────────────────────────────────────────

export const defaultSettings: Settings = {
  llmProvider: 'OpenAI',
  llmModel: '',
  llmApiKey: '',
  jiraUrl: '',
  jiraProjectKey: '',
  jiraEmail: '',
  jiraApiToken: '',
  xrayClientId: '',
  xrayClientSecret: '',
  xrayBatchSize: '10',
  xrayBatchDelayMs: '1000',
  xrayMaxRetries: '3',
};

export const emptyEnhancement: RequirementEnhancement = {
  missingFunctional: [],
  missingNonFunctional: [],
  bestPractices: [],
  marketBenchmark: [],
  risks: [],
  clarifyingQuestions: [],
};

export const llmModelsByProvider: Record<string, string[]> = {
  OpenAI: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini', 'o4-mini'],
  Anthropic: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-fable-5'],
  Gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-pro'],
  Groq: [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-3.3-70b-specdec',
    'llama3-70b-8192',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ],
};

export const getProviderModels = (provider: string): string[] =>
  llmModelsByProvider[provider] ?? [];

export type ModelTier = 'fast' | 'economy' | 'balanced' | 'best-quality';

export interface ModelMeta {
  tier: ModelTier;
  isReasoningModel: boolean;
}

export const modelMeta: Record<string, ModelMeta> = {
  'claude-opus-4-8':                    { tier: 'best-quality', isReasoningModel: false },
  'claude-sonnet-4-6':                  { tier: 'balanced',     isReasoningModel: false },
  'claude-haiku-4-5':                   { tier: 'fast',         isReasoningModel: false },
  'claude-fable-5':                     { tier: 'best-quality', isReasoningModel: true  },
  'gpt-4.1':                            { tier: 'best-quality', isReasoningModel: false },
  'gpt-4.1-mini':                       { tier: 'fast',         isReasoningModel: false },
  'gpt-4o-mini':                        { tier: 'economy',      isReasoningModel: false },
  'o4-mini':                            { tier: 'best-quality', isReasoningModel: true  },
  'gemini-2.5-flash':                   { tier: 'fast',         isReasoningModel: false },
  'gemini-2.5-pro':                     { tier: 'balanced',     isReasoningModel: false },
  'gemini-3.1-pro':                     { tier: 'best-quality', isReasoningModel: true  },
  'meta-llama/llama-4-scout-17b-16e-instruct': { tier: 'fast',  isReasoningModel: false },
  'llama-3.3-70b-specdec':              { tier: 'balanced',     isReasoningModel: false },
  'llama3-70b-8192':                    { tier: 'balanced',     isReasoningModel: false },
  'mixtral-8x7b-32768':                 { tier: 'economy',      isReasoningModel: false },
  'gemma2-9b-it':                       { tier: 'economy',      isReasoningModel: false },
};
