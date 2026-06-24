import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Settings,
  type ParsedFile,
  type JiraIssueSummary,
  type UploadDraft,
  type JiraMode,
  type TabKey,
  type RequirementEnhancement,
  type ScenarioItem,
  type TestCaseItem,
  type AutomationAnalysis,
  type XrayPushedIssue,
  type XrayPushPreview,
  type XrayPushProgress,
  defaultSettings,
  emptyEnhancement,
  getProviderModels,
} from './types';
import { downloadFile, escapeCsvCell, inferScenarioType } from './utils';
import { useTraceLMMessages } from './hooks/useTraceLMMessages';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsTab } from './tabs/SettingsTab';
import { RequirementsTab } from './tabs/RequirementsTab';
import { EnhancementTab } from './tabs/EnhancementTab';
import { ScenariosTab } from './tabs/ScenariosTab';
import { TestCasesTab } from './tabs/TestCasesTab';
import { AutomationTab } from './tabs/AutomationTab';
import { LLMProvidersTab } from './tabs/LLMProvidersTab';
import { ProjectsTab } from './tabs/ProjectsTab';
import { OutputTab } from './tabs/OutputTab';
import { GuideTab } from './tabs/GuideTab';

function App(): JSX.Element {
  const [status, setStatus] = useState('Ready');
  const [feedback, setFeedback] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('requirements');

  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [requirementText, setRequirementText] = useState('');
  const [uploadDrafts, setUploadDrafts] = useState<UploadDraft[]>([]);
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);

  const [jiraMode, setJiraMode] = useState<JiraMode>('single');
  const [singleIssueKey, setSingleIssueKey] = useState('');
  const [multipleIssueKeys, setMultipleIssueKeys] = useState('');
  const [epicKey, setEpicKey] = useState('');
  const [storyQuery, setStoryQuery] = useState('');
  const [storyOptions, setStoryOptions] = useState<JiraIssueSummary[]>([]);
  const [selectedStoryKeys, setSelectedStoryKeys] = useState<string[]>([]);
  const [pulledIssues, setPulledIssues] = useState<JiraIssueSummary[]>([]);

  const [enhancement, setEnhancement] = useState<RequirementEnhancement>(emptyEnhancement);
  const [enhancementGeneratedAt, setEnhancementGeneratedAt] = useState<Date | null>(null);
  const [scenariosGeneratedAt, setScenariosGeneratedAt] = useState<Date | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [testCases, setTestCases] = useState<TestCaseItem[]>([]);
  const [automation, setAutomation] = useState<AutomationAnalysis | null>(null);
  const [requirementsReviewed, setRequirementsReviewed] = useState(false);
  const [xrayPushedIssues, setXrayPushedIssues] = useState<XrayPushedIssue[]>([]);
  const [xrayPushPreview, setXrayPushPreview] = useState<XrayPushPreview | null>(null);
  const [xrayPushProgress, setXrayPushProgress] = useState<XrayPushProgress | null>(null);
  const [generationProgress, setGenerationProgress] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  // Tracks which Generate All step last failed + the exact error message.
  // stepKey: null | 'enhancement+scenarios' | 'testCases' | 'automation'
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string>('');

  // ── Refs (stable reads inside useCallback, avoids stale-closure deps) ────
  const requirementTextRef = useRef(requirementText);
  const enhancementRef = useRef(enhancement);
  const scenariosRef = useRef(scenarios);
  const testCasesRef = useRef(testCases);
  const settingsRef = useRef(settings);
  const automationRef = useRef(automation);
  const xrayPushedIssuesRef = useRef(xrayPushedIssues);
  const requirementsReviewedRef = useRef(requirementsReviewed);
  const uploadDraftsRef = useRef(uploadDrafts);
  const generateAllStepRef = useRef<number>(0);

  useEffect(() => { requirementTextRef.current = requirementText; }, [requirementText]);
  useEffect(() => { enhancementRef.current = enhancement; }, [enhancement]);
  useEffect(() => { scenariosRef.current = scenarios; }, [scenarios]);
  useEffect(() => { testCasesRef.current = testCases; }, [testCases]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { automationRef.current = automation; }, [automation]);
  useEffect(() => { xrayPushedIssuesRef.current = xrayPushedIssues; }, [xrayPushedIssues]);
  useEffect(() => { requirementsReviewedRef.current = requirementsReviewed; }, [requirementsReviewed]);
  useEffect(() => { uploadDraftsRef.current = uploadDrafts; }, [uploadDrafts]);

  const availableModels = useMemo(() => getProviderModels(settings.llmProvider), [settings.llmProvider]);

  useEffect(() => {
    if (!availableModels.length) return;
    if (!availableModels.includes(settings.llmModel)) {
      setSettings((prev) => ({ ...prev, llmModel: availableModels[0] }));
    }
  }, [availableModels, settings.llmModel]);

  const {
    saveSettings, testLlm, testJira,
    parseSelectedFiles, searchStories: searchStoriesAction, pullFromJira: pullFromJiraAction,
    generateEnhancement, generateAll, generateScenarios, generateTestCases,
    generateAutomationAnalysis,
    pushTestCasesToXray, retryFailedPushes, previewXrayPush, clearXrayHistory,
  } = useTraceLMMessages({
    generateAllStepRef, requirementTextRef, enhancementRef, scenariosRef,
    settingsRef, testCasesRef, xrayPushedIssuesRef, uploadDraftsRef,
    setStatus, setFeedback, setIsBusy, setSettings,
    setRequirementText, setRequirementsReviewed,
    setParsedFiles, setStoryOptions, setPulledIssues,
    setEnhancement, setScenarios, setTestCases,
    setXrayPushedIssues, setAutomation,
    setXrayPushPreview, setXrayPushProgress, setGenerationProgress,
    onEnhancementReceived: () => setEnhancementGeneratedAt(new Date()),
    onScenariosReceived: () => setScenariosGeneratedAt(new Date()),
    onChainSettled: () => { /* watchdog is now handled inside the hook */ },
    // BUG-8 fix: navigate to automation tab when Generate All finishes.
    onGenerateAllDone: () => { setActiveTab('automation'); setFailedStep(null); setFailedMessage(''); },
    // Per-step retry: record which phase failed and the exact error so the banner is actionable.
    onGenerateAllFailed: (stepKey, errorMessage) => { setFailedStep(stepKey); setFailedMessage(errorMessage); },
  });

  // ── Settings ──────────────────────────────────────────────────────────────

  const updateSettingsField = useCallback((key: keyof Settings, value: string): void => {
    if (key === 'llmProvider') {
      const models = getProviderModels(value);
      setSettings((prev) => ({
        ...prev,
        llmProvider: value,
        llmModel: models.includes(prev.llmModel) ? prev.llmModel : models[0] ?? '',
      }));
      return;
    }
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── File & Jira ───────────────────────────────────────────────────────────

  const toBase64 = useCallback(async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const next = await Promise.all(
      Array.from(files).map(async (file) => ({
        name: file.name,
        mimeType: file.type,
        contentBase64: await toBase64(file),
      }))
    );
    setUploadDrafts(next);
    setFeedback(`${next.length} file(s) selected.`);
  }, [toBase64]);

  const searchStories = useCallback((): void => {
    searchStoriesAction(storyQuery);
  }, [storyQuery, searchStoriesAction]);

  const pullFromJira = useCallback((): void => {
    pullFromJiraAction(jiraMode, { singleIssueKey, multipleIssueKeys, epicKey, selectedStoryKeys: selectedStoryKeys.join(',') });
  }, [jiraMode, singleIssueKey, multipleIssueKeys, epicKey, selectedStoryKeys, pullFromJiraAction]);

  const toggleStoryKey = useCallback((key: string): void => {
    setSelectedStoryKeys((prev) =>
      prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]
    );
  }, []);

  // ── Generation guards ─────────────────────────────────────────────────────

  const handleRequirementTextChange = useCallback((text: string): void => {
    setRequirementText(text);
    setRequirementsReviewed(false);
  }, []);

  const clearAll = useCallback((): void => {
    setRequirementText('');
    setRequirementsReviewed(false);
    setUploadDrafts([]);
    setParsedFiles([]);
    setEnhancement(emptyEnhancement);
    setEnhancementGeneratedAt(null);
    setScenarios([]);
    setScenariosGeneratedAt(null);
    setTestCases([]);
    setAutomation(null);
    setFeedback('');
    setGenerationProgress('');
    setFailedStep(null);
    setFailedMessage('');
  }, []);

  // ── Automation ────────────────────────────────────────────────────────────

  // BUG-2 fix: use dedicated generateAutomationAnalysis which reads current state
  // and never re-runs test case generation.
  const analyzeAutomation = useCallback((): void => {
    setFailedStep(null);
    generateAutomationAnalysis();
  }, [generateAutomationAnalysis]);

  // ── Scenario editing ──────────────────────────────────────────────────────

  const updateScenarioField = useCallback((index: number, key: keyof ScenarioItem, value: string): void => {
    setScenarios((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      if (key === 'preconditions' || key === 'flow' || key === 'requirementRefs') {
        item[key] = value.split('\n').map((l) => l.trim()).filter(Boolean);
      } else {
        item[key] = value as never;
      }
      // Re-infer type whenever content fields change, unless the user explicitly changed type
      if (key !== 'type' && key !== 'id' && key !== 'requirementRefs' && key !== 'preconditions') {
        const flow = key === 'flow' ? value.split('\n').map((l) => l.trim()).filter(Boolean) : item.flow;
        const outcome = key === 'expectedOutcome' ? value : item.expectedOutcome;
        const title = key === 'title' ? value : item.title;
        item.type = inferScenarioType(title, flow, outcome);
      }
      copy[index] = item;
      return copy;
    });
  }, []);

  const addScenario = useCallback((): void => {
    setScenarios((prev) => {
      const nextNum = prev.length + 1;
      const newItem: ScenarioItem = {
        id: `SCN-${String(nextNum).padStart(3, '0')}`,
        title: '',
        type: inferScenarioType(''),
        requirementRefs: [],
        preconditions: [],
        flow: [],
        expectedOutcome: '',
        priority: 'Medium',
      };
      return [...prev, newItem];
    });
  }, []);

  const deleteScenario = useCallback((index: number): void => {
    setScenarios((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Exports ───────────────────────────────────────────────────────────────

  const exportAutomationJson = useCallback((): void => {
    if (!automationRef.current) return;
    downloadFile(
      'tracelm-automation-analysis.json',
      JSON.stringify(automationRef.current, null, 2),
      'application/json;charset=utf-8'
    );
  }, []);

  const exportAutomationCsv = useCallback((): void => {
    const current = automationRef.current;
    if (!current) return;
    const header = ['TestCaseID', 'ScenarioID', 'RequirementRef', 'Candidate', 'ExclusionReason', 'FeasibilityLevel', 'ROILevel', 'Layer', 'Priority', 'PlaywrightAutomatable', 'PlaywrightScope', 'Blocker', 'Notes'];
    const lines = current.items.map((item) => [
      item.testCaseId, item.scenarioId, item.requirementRef,
      String(item.candidate), item.exclusionReason,
      item.feasibilityLevel, item.roiLevel,
      item.layer, item.priority,
      item.playwrightAutomatable, item.playwrightScope, item.blocker, item.notes,
    ]);
    const csv = [header, ...lines].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
    downloadFile('tracelm-automation-analysis.csv', csv, 'text/csv;charset=utf-8');
  }, []);

  // ── Enhancement item mutations ────────────────────────────────────────────

  const updateEnhancementItem = useCallback((key: keyof RequirementEnhancement, index: number, value: string): void => {
    setEnhancement((prev) => {
      const arr = [...prev[key]];
      arr[index] = value;
      return { ...prev, [key]: arr };
    });
  }, []);

  const deleteEnhancementItem = useCallback((key: keyof RequirementEnhancement, index: number): void => {
    setEnhancement((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index),
    }));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const enhancementTotal = useMemo(
    () => Object.values(enhancement).reduce((sum, arr) => sum + arr.length, 0),
    [enhancement]
  );

  const statusDotClass = isBusy
    ? 'sidebar-status-dot sidebar-status-dot--busy'
    : status.toLowerCase().includes('error') || status.toLowerCase().includes('failed')
    ? 'sidebar-status-dot sidebar-status-dot--error'
    : status.toLowerCase().includes('ready') || status.toLowerCase().includes('saved') || status.toLowerCase().includes('ok')
    ? 'sidebar-status-dot sidebar-status-dot--ready'
    : 'sidebar-status-dot';

  const nav = (key: TabKey): void => setActiveTab(key);

  const generateItems: { key: TabKey; label: string; step: number; count?: number }[] = [
    { key: 'requirements', label: 'Requirements',  step: 1 },
    { key: 'enhancement',  label: 'Enhancement',   step: 2, count: enhancementTotal || undefined },
    { key: 'scenarios',    label: 'Scenarios',      step: 3, count: scenarios.length || undefined },
    { key: 'testCases',    label: 'Test Cases',     step: 4, count: testCases.length || undefined },
    { key: 'automation',   label: 'Automation',     step: 5, count: automation?.items.length || undefined },
  ];

  const settingsItems: { key: TabKey; label: string }[] = [
    { key: 'integrations',  label: 'Integrations' },
    { key: 'llm-providers', label: 'LLM Providers' },
    { key: 'projects',      label: 'Projects' },
    { key: 'output',        label: 'Output' },
  ];

  return (
    <div className="app-layout">

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <aside className="sidebar" aria-label="Main navigation">

        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-logo" aria-hidden="true">T</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">TraceLMs</span>
            <span className="sidebar-brand-sub">Cloud</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">

          {/* Generate section */}
          <div className="sidebar-section">
            <span className="sidebar-section-label">Generate</span>
            {generateItems.map(({ key, label, step, count }) => (
              <button
                key={key}
                type="button"
                className={`sidebar-item${activeTab === key ? ' active' : ''}`}
                onClick={() => nav(key)}
                aria-current={activeTab === key ? 'page' : undefined}
              >
                <span className="sidebar-item-inner">
                  <span className="sidebar-step" aria-hidden="true">{step}</span>
                  {label}
                </span>
                {count !== undefined && (
                  <span className="sidebar-count" aria-label={`${count} items`}>{count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="sidebar-divider" aria-hidden="true" />

          {/* Settings section */}
          <div className="sidebar-section">
            <span className="sidebar-section-label">Settings</span>
            {settingsItems.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`sidebar-item${activeTab === key ? ' active' : ''}`}
                onClick={() => nav(key)}
                aria-current={activeTab === key ? 'page' : undefined}
              >
                <span className="sidebar-item-inner">{label}</span>
              </button>
            ))}
          </div>

          <div className="sidebar-divider" aria-hidden="true" />

          {/* Guide */}
          <div className="sidebar-section">
            <button
              type="button"
              className={`sidebar-item${activeTab === 'guide' ? ' active' : ''}`}
              onClick={() => nav('guide')}
              aria-current={activeTab === 'guide' ? 'page' : undefined}
            >
              <span className="sidebar-item-inner">Guide</span>
            </button>
          </div>

        </nav>

        {/* Footer — status */}
        <div className="sidebar-footer" role="status" aria-live="polite">
          <span className={statusDotClass} aria-hidden="true" />
          <span className="sidebar-status-text">{status}</span>
          <span className="sidebar-version">v0.1.0</span>
        </div>

      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="main-area">

        {/* Per-step retry banner */}
        {failedStep !== null && !isBusy && (
          <div className="retry-banner" role="alert">
            <div className="retry-banner__body">
              <span className="retry-banner__label">
                {failedStep === 'enhancement+scenarios' && 'Generate All stopped at Phase 1 (Enhancement + Scenarios)'}
                {failedStep === 'testCases'             && 'Generate All stopped at Test Cases'}
                {failedStep === 'automation'            && 'Generate All stopped at Automation Analysis'}
              </span>
              {failedMessage && <span className="retry-banner__error">{failedMessage}</span>}
              <span className="retry-banner__hint">
                {failedStep === 'enhancement+scenarios' && 'Requirements are still loaded — retry from the beginning.'}
                {failedStep === 'testCases'             && 'Enhancement and Scenarios were saved — retry just this step.'}
                {failedStep === 'automation'            && 'Test Cases were saved — retry just this step.'}
              </span>
            </div>
            <div className="retry-banner__actions">
              {failedStep === 'enhancement+scenarios' && (
                <button type="button" className="btn btn-sm btn-retry"
                  onClick={() => { setFailedStep(null); setFailedMessage(''); generateAll(); }}>
                  ↩ Retry Generate All
                </button>
              )}
              {failedStep === 'testCases' && (
                <button type="button" className="btn btn-sm btn-retry"
                  onClick={() => { setFailedStep(null); setFailedMessage(''); setActiveTab('testCases'); generateTestCases(); }}>
                  ↩ Retry Test Cases
                </button>
              )}
              {failedStep === 'automation' && (
                <button type="button" className="btn btn-sm btn-retry"
                  onClick={() => { setFailedStep(null); setFailedMessage(''); setActiveTab('automation'); analyzeAutomation(); }}>
                  ↩ Retry Automation Analysis
                </button>
              )}
              <button type="button" className="btn btn-sm btn-secondary"
                onClick={() => { setFailedStep(null); setFailedMessage(''); }}
                aria-label="Dismiss">✕</button>
            </div>
          </div>
        )}

        {/* Tab panels */}
        {activeTab === 'requirements' && (
          <ErrorBoundary tabName="Requirements">
            <RequirementsTab
              requirementText={requirementText}
              requirementsReviewed={requirementsReviewed}
              generationProgress={generationProgress}
              parsedFiles={parsedFiles}
              uploadDrafts={uploadDrafts}
              jiraMode={jiraMode}
              singleIssueKey={singleIssueKey}
              multipleIssueKeys={multipleIssueKeys}
              epicKey={epicKey}
              storyQuery={storyQuery}
              storyOptions={storyOptions}
              selectedStoryKeys={selectedStoryKeys}
              pulledIssues={pulledIssues}
              isBusy={isBusy}
              feedback={feedback}
              onRequirementTextChange={handleRequirementTextChange}
              onReviewedChange={setRequirementsReviewed}
              onGenerateAll={generateAll}
              onClearAll={clearAll}
              onFileChange={handleFileChange}
              onParseFiles={parseSelectedFiles}
              onJiraModeChange={setJiraMode}
              onSingleKeyChange={setSingleIssueKey}
              onMultipleKeysChange={setMultipleIssueKeys}
              onEpicKeyChange={setEpicKey}
              onStoryQueryChange={setStoryQuery}
              onSearchStories={searchStories}
              onToggleStoryKey={toggleStoryKey}
              onPullJira={pullFromJira}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'enhancement' && (
          <ErrorBoundary tabName="Requirement Enhancement">
            <EnhancementTab
              enhancement={enhancement}
              isBusy={isBusy}
              feedback={feedback}
              generatedAt={enhancementGeneratedAt}
              onGenerate={generateEnhancement}
              onUpdateItem={updateEnhancementItem}
              onDeleteItem={deleteEnhancementItem}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'scenarios' && (
          <ErrorBoundary tabName="Test Scenarios">
            <ScenariosTab
              scenarios={scenarios}
              isBusy={isBusy}
              feedback={feedback}
              generatedAt={scenariosGeneratedAt}
              onGenerate={generateScenarios}
              onUpdateField={updateScenarioField}
              onAddScenario={addScenario}
              onDeleteScenario={deleteScenario}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'testCases' && (
          <ErrorBoundary tabName="Test Cases">
            <TestCasesTab
              testCases={testCases}
              xrayPushPreview={xrayPushPreview}
              xrayPushProgress={xrayPushProgress}
              xrayPushedIssues={xrayPushedIssues}
              isBusy={isBusy}
              feedback={feedback}
              onGenerateTestCases={generateTestCases}
              onPreviewPush={previewXrayPush}
              onPushToXray={pushTestCasesToXray}
              onRetryFailed={retryFailedPushes}
              onClearHistory={clearXrayHistory}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'automation' && (
          <ErrorBoundary tabName="Automation Candidates">
            <AutomationTab
              automation={automation}
              isBusy={isBusy}
              feedback={feedback}
              onAnalyze={analyzeAutomation}
              onExportJson={exportAutomationJson}
              onExportCsv={exportAutomationCsv}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'integrations' && (
          <ErrorBoundary tabName="Integrations">
            <SettingsTab
              settings={settings}
              availableModels={availableModels}
              isBusy={isBusy}
              feedback={feedback}
              onFieldChange={updateSettingsField}
              onSave={saveSettings}
              onTestLlm={testLlm}
              onTestJira={testJira}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'llm-providers' && (
          <ErrorBoundary tabName="LLM Providers">
            <LLMProvidersTab />
          </ErrorBoundary>
        )}

        {activeTab === 'projects' && (
          <ErrorBoundary tabName="Projects">
            <ProjectsTab />
          </ErrorBoundary>
        )}

        {activeTab === 'output' && (
          <ErrorBoundary tabName="Output">
            <OutputTab />
          </ErrorBoundary>
        )}

        {activeTab === 'guide' && (
          <ErrorBoundary tabName="Guide">
            <GuideTab />
          </ErrorBoundary>
        )}

      </main>
    </div>
  );
}

export default App;
