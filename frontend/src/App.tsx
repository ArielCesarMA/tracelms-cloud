import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { LoginPage } from './pages/LoginPage';
import { getAuthToken, clearAuthToken, fetchProjects, linkGenerationToProject } from './api/client';
import type { LatestGenerationRecord } from './api/client';
import type { Project } from './types';
import { useAuth, canWrite, canPush, ROLE_LABELS, ROLE_DESCRIPTIONS } from './contexts/AuthContext';
import {
  type Settings,
  type ParsedFile,
  type JiraIssueSummary,
  type UploadDraft,
  type ExtractedRequirement,
  type JiraMode,
  type TabKey,
  type RequirementEnhancement,
  type ScenarioItem,
  type TestCaseItem,
  type AutomationAnalysis,
  type XrayPushedIssue,
  type XrayPushPreview,
  type XrayPushProgress,
  type TokenUsage,
  defaultSettings,
  emptyEnhancement,
  getProviderModels,
} from './types';
import { downloadFile, escapeCsvCell, inferScenarioType, buildRequirementsPayload, resizeImageIfNeeded, ACCEPTED_IMAGE_MIMES, IMAGE_SIZE_LIMIT_BYTES } from './utils';
import { useTraceLMMessages } from './hooks/useTraceLMMessages';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RequirementsTab } from './tabs/RequirementsTab';
import { EnhancementTab } from './tabs/EnhancementTab';
import { ScenariosTab } from './tabs/ScenariosTab';
import { TestCasesTab } from './tabs/TestCasesTab';
import { AutomationTab } from './tabs/AutomationTab';
import { ProjectsTab } from './tabs/ProjectsTab';
import { OutputTab } from './tabs/OutputTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { GuideTab } from './tabs/GuideTab';
import { AdminPage } from './pages/AdminPage';

// Auth wrapper — prevents AppInner from mounting (and running all its hooks)
// until authentication is confirmed. This is the correct way to gate hook-heavy
// components: move the conditional ABOVE the component boundary, not inside it.
function App(): JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Check token synchronously before first paint to avoid flash of main UI
  useLayoutEffect(() => {
    setIsAuthenticated(!!getAuthToken());
  }, []);

  if (isAuthenticated === null) return <></>;
  if (!isAuthenticated) {
    return <LoginPage onAuthenticated={() => setIsAuthenticated(true)} />;
  }
  return <AppInner onLogout={() => { clearAuthToken(); setIsAuthenticated(false); }} />;
}

interface AppInnerProps { onLogout: () => void; }

function AppInner({ onLogout }: AppInnerProps): JSX.Element {
  const { user: authUser } = useAuth();
  const userRole = authUser?.role;
  const [status, setStatus] = useState('Ready');
  const [feedback, setFeedback] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('requirements');

  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [requirementText, setRequirementText] = useState('');
  const [uploadDrafts, setUploadDrafts] = useState<UploadDraft[]>([]);
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [documentWarnings, setDocumentWarnings] = useState<string[]>([]);

  const [jiraMode, setJiraMode] = useState<JiraMode>('single');
  const [singleIssueKey, setSingleIssueKey] = useState('');
  const [multipleIssueKeys, setMultipleIssueKeys] = useState('');
  const [epicKey, setEpicKey] = useState('');
  const [storyQuery, setStoryQuery] = useState('');
  const [storyOptions, setStoryOptions] = useState<JiraIssueSummary[]>([]);
  const [selectedStoryKeys, setSelectedStoryKeys] = useState<string[]>([]);
  const [pulledIssues, setPulledIssues] = useState<JiraIssueSummary[]>([]);
  const [uploadedRequirements, setUploadedRequirements] = useState<ExtractedRequirement[]>([]);
  const [jiraRequirements, setJiraRequirements] = useState<ExtractedRequirement[]>([]);
  const [instructionText, setInstructionText] = useState('');
  const [manualText, setManualText] = useState('');

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
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // ── Active project (persisted in localStorage) ────────────────────────────
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    () => localStorage.getItem('tracelms-active-project-id')
  );
  const [activeProjectName, setActiveProjectName] = useState<string | null>(
    () => localStorage.getItem('tracelms-active-project-name')
  );
  const [activeProjectJiraKey, setActiveProjectJiraKey] = useState<string | null>(
    () => localStorage.getItem('tracelms-active-project-jira-key')
  );

  // ── Save-to-project state (Option C) ──────────────────────────────────────
  // After a generation is saved, show a confirmation banner.
  const [savedBanner, setSavedBanner] = useState<{ projectName: string } | null>(null);
  // When generation completes with no active project, show the picker modal.
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  // The DB id of the most recently saved generation (for linking via PATCH).
  const [lastSavedGenerationId, setLastSavedGenerationId] = useState<string | null>(null);
  // Projects list for the picker modal (loaded on demand).
  const [pickerProjects, setPickerProjects] = useState<Project[]>([]);
  const [pickerBusy, setPickerBusy] = useState(false);

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
  const uploadedRequirementsRef = useRef(uploadedRequirements);
  const jiraRequirementsRef = useRef(jiraRequirements);
  const instructionTextRef = useRef(instructionText);
  const manualTextRef = useRef(manualText);
  const activeProjectIdRef = useRef(activeProjectId);
  const activeProjectJiraKeyRef = useRef(activeProjectJiraKey);
  const autoGenerateAfterExtractRef = useRef(false);

  useEffect(() => { requirementTextRef.current = requirementText; }, [requirementText]);
  useEffect(() => { enhancementRef.current = enhancement; }, [enhancement]);
  useEffect(() => { scenariosRef.current = scenarios; }, [scenarios]);
  useEffect(() => { testCasesRef.current = testCases; }, [testCases]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { automationRef.current = automation; }, [automation]);
  useEffect(() => { xrayPushedIssuesRef.current = xrayPushedIssues; }, [xrayPushedIssues]);
  useEffect(() => { requirementsReviewedRef.current = requirementsReviewed; }, [requirementsReviewed]);
  useEffect(() => { uploadDraftsRef.current = uploadDrafts; }, [uploadDrafts]);
  useEffect(() => { uploadedRequirementsRef.current = uploadedRequirements; }, [uploadedRequirements]);
  useEffect(() => { jiraRequirementsRef.current = jiraRequirements; }, [jiraRequirements]);
  useEffect(() => { instructionTextRef.current = instructionText; }, [instructionText]);
  useEffect(() => { manualTextRef.current = manualText; }, [manualText]);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => { activeProjectJiraKeyRef.current = activeProjectJiraKey; }, [activeProjectJiraKey]);

  // Sync requirementText payload whenever extracted requirements or instructions change.
  // Guard: only update when new-style state exists (preserves DB-restored legacy requirementText).
  useEffect(() => {
    if (!uploadedRequirements.length && !jiraRequirements.length && !instructionText.trim()) return;
    const payload = buildRequirementsPayload(uploadedRequirements, jiraRequirements, instructionText);
    setRequirementText(payload);
    requirementTextRef.current = payload;
    // If the user clicked Generate All before extraction was done, continue now.
    // generateAll is intentionally excluded from deps — it's a stable useCallback and
    // only invoked here via the autoGenerateAfterExtractRef flag, not as a re-run trigger.
    if (autoGenerateAfterExtractRef.current) {
      autoGenerateAfterExtractRef.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generateAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedRequirements, jiraRequirements, instructionText]);

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
    settingsRef, testCasesRef, xrayPushedIssuesRef, uploadDraftsRef, uploadedRequirementsRef, manualTextRef,
    activeProjectIdRef, activeProjectJiraKeyRef,
    setStatus, setFeedback, setIsBusy, setSettings,
    setRequirementText, setRequirementsReviewed,
    setParsedFiles, setDocumentWarnings, setUploadedRequirements, setJiraRequirements,
    setStoryOptions, setPulledIssues,
    setEnhancement, setScenarios, setTestCases,
    setXrayPushedIssues, setAutomation,
    setXrayPushPreview, setXrayPushProgress, setGenerationProgress, setTokenUsage,
    onEnhancementReceived: () => setEnhancementGeneratedAt(new Date()),
    onScenariosReceived: () => setScenariosGeneratedAt(new Date()),
    onChainSettled: () => { /* watchdog is now handled inside the hook */ },
    // BUG-8 fix: navigate to automation tab when Generate All finishes.
    onGenerateAllDone: () => { setActiveTab('automation'); setFailedStep(null); setFailedMessage(''); },
    // Per-step retry: record which phase failed and the exact error so the banner is actionable.
    onGenerateAllFailed: (stepKey, errorMessage) => { setFailedStep(stepKey); setFailedMessage(errorMessage); },
    // Option C: after save, show banner or project picker.
    onGenerationSaved: (generationId, projectId) => {
      setLastSavedGenerationId(generationId);
      if (projectId && activeProjectName) {
        setSavedBanner({ projectName: activeProjectName });
        setTimeout(() => setSavedBanner(null), 6000);
      } else {
        // Load projects list for the picker modal
        void fetchProjects().then(({ projects }) => {
          setPickerProjects(projects);
          setShowProjectPicker(true);
        }).catch(() => { /* silent — picker is optional */ });
      }
    },
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

  const processFiles = useCallback(async (files: File[]): Promise<void> => {
    if (files.length === 0) return;
    // Fallback MIME map for Windows drag-and-drop where file.type can be ''
    const EXT_TO_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
    try {
      const next = await Promise.all(
        files.map(async (file): Promise<UploadDraft> => {
          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          const resolvedMime = file.type || EXT_TO_MIME[ext] || '';
          const isImageFile = (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(resolvedMime);
          if (isImageFile && file.size > IMAGE_SIZE_LIMIT_BYTES) {
            return {
              name: file.name,
              mimeType: resolvedMime,
              contentBase64: '',
              isImage: true,
              thumbnailUrl: URL.createObjectURL(file),
              sizeError: 'Image too large — maximum 10MB. Try compressing or cropping.',
            };
          }
          if (isImageFile) {
            const contentBase64 = await resizeImageIfNeeded(file);
            return {
              name: file.name,
              mimeType: resolvedMime,
              contentBase64,
              isImage: true,
              thumbnailUrl: URL.createObjectURL(file),
            };
          }
          return {
            name: file.name,
            mimeType: resolvedMime || file.type,
            contentBase64: await toBase64(file),
          };
        })
      );
      setUploadDrafts(next);
      setFeedback(`${next.length} file(s) selected.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to process files.');
    }
  }, [toBase64]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
  }, [processFiles]);

  const handleRequirementUpdate = useCallback((reqId: string, field: keyof ExtractedRequirement, value: string): void => {
    setUploadedRequirements((prev) => {
      if (field === ('__undo__' as keyof ExtractedRequirement)) {
        const { row, index } = JSON.parse(value) as { row: ExtractedRequirement; index: number };
        const next = [...prev];
        next.splice(index, 0, row);
        return next;
      }
      return prev.map((r) => r.reqId === reqId ? { ...r, [field]: value } : r);
    });
  }, []);

  const handleRequirementDelete = useCallback((reqId: string): void => {
    setUploadedRequirements((prev) => prev.filter((r) => r.reqId !== reqId));
  }, []);

  const handleJiraRequirementUpdate = useCallback((reqId: string, field: keyof ExtractedRequirement, value: string): void => {
    setJiraRequirements((prev) => {
      if (field === ('__undo__' as keyof ExtractedRequirement)) {
        const { row, index } = JSON.parse(value) as { row: ExtractedRequirement; index: number };
        const next = [...prev];
        next.splice(index, 0, row);
        return next;
      }
      return prev.map((r) => r.reqId === reqId ? { ...r, [field]: value } : r);
    });
  }, []);

  const handleJiraRequirementDelete = useCallback((reqId: string): void => {
    setJiraRequirements((prev) => prev.filter((r) => r.reqId !== reqId));
  }, []);

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

  // When files are dropped but not yet extracted, auto-extract first then generate.
  const handleGenerateAll = useCallback((): void => {
    const hasText = requirementTextRef.current.trim() || manualTextRef.current.trim();
    if (!hasText) {
      const pendingDrafts = uploadDraftsRef.current.filter((d) => !d.sizeError);
      if (pendingDrafts.length > 0) {
        autoGenerateAfterExtractRef.current = true;
        setFeedback('Extracting requirements from your files first…');
        parseSelectedFiles();
        return;
      }
    }
    generateAll();
  }, [generateAll, parseSelectedFiles, setFeedback]);

  const handleRequirementTextChange = useCallback((text: string): void => {
    setRequirementText(text);
    setRequirementsReviewed(false);
  }, []);

  const clearAll = useCallback((): void => {
    localStorage.setItem('tracelms-session-cleared', 'true');
    setIsBusy(false);
    // Clear all input fields, staged files, and generated artifacts.
    setManualText('');
    setInstructionText('');
    setUploadedRequirements([]);
    setUploadDrafts([]);
    setRequirementsReviewed(false);
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
    // Clear Jira Pull fields so re-run starts fresh.
    setJiraMode('single');
    setSingleIssueKey('');
    setMultipleIssueKeys('');
    setEpicKey('');
    setStoryQuery('');
    setStoryOptions([]);
    setSelectedStoryKeys([]);
    setJiraRequirements([]);
    setDocumentWarnings([]);
    setParsedFiles([]);
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

  // ── Active project ────────────────────────────────────────────────────────

  const handleProjectActivate = useCallback((project: Project | null): void => {
    if (project) {
      setActiveProjectId(project.id);
      setActiveProjectName(project.name);
      setActiveProjectJiraKey(project.jiraProjectKey ?? null);
      localStorage.setItem('tracelms-active-project-id', project.id);
      localStorage.setItem('tracelms-active-project-name', project.name);
      if (project.jiraProjectKey) {
        localStorage.setItem('tracelms-active-project-jira-key', project.jiraProjectKey);
      } else {
        localStorage.removeItem('tracelms-active-project-jira-key');
      }
    } else {
      setActiveProjectId(null);
      setActiveProjectName(null);
      setActiveProjectJiraKey(null);
      localStorage.removeItem('tracelms-active-project-id');
      localStorage.removeItem('tracelms-active-project-name');
      localStorage.removeItem('tracelms-active-project-jira-key');
    }
  }, []);

  const handlePickerSave = useCallback(async (project: Project): Promise<void> => {
    if (!lastSavedGenerationId) return;
    setPickerBusy(true);
    try {
      await linkGenerationToProject(lastSavedGenerationId, project.id);
      setShowProjectPicker(false);
      setSavedBanner({ projectName: project.name });
      setTimeout(() => setSavedBanner(null), 6000);
    } catch {
      // silent — linking is best-effort
      setShowProjectPicker(false);
    } finally {
      setPickerBusy(false);
    }
  }, [lastSavedGenerationId]);

  const handleGenerationLoad = useCallback((gen: LatestGenerationRecord): void => {
    setRequirementText(gen.requirementText);
    setEnhancement((gen.enhancement as RequirementEnhancement) ?? emptyEnhancement);
    setScenarios((gen.scenarios as ScenarioItem[]) ?? []);
    setTestCases((gen.testCases as TestCaseItem[]) ?? []);
    setAutomation((gen.automation as AutomationAnalysis) ?? null);
    setFeedback('Generation loaded.');
    setActiveTab('requirements');
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

  // Idle "ready" messages carry no information once shown — keep the dot as an
  // ambient signal but only surface the text label for busy/error/transient states.
  const isIdleStatus = !isBusy && status.toLowerCase().includes('ready');

  const nav = (key: TabKey): void => setActiveTab(key);

  const generateItems: { key: TabKey; label: string; icon: string; count?: number; isFirst?: boolean; isPending?: boolean }[] = [
    { key: 'requirements', label: 'Requirements', icon: 'ti-file-text', isFirst: true },
    { key: 'enhancement',  label: 'Enhancement',  icon: 'ti-sparkles',  count: enhancementTotal || undefined },
    { key: 'scenarios',    label: 'Scenarios',     icon: 'ti-sitemap',   count: scenarios.length || undefined },
    { key: 'testCases',    label: 'Test Cases',    icon: 'ti-checklist', count: testCases.length || undefined },
    { key: 'automation',   label: 'Automation',    icon: 'ti-robot',     count: automation?.items.length || undefined },
    { key: 'documents',    label: 'Documents',     icon: 'ti-file-type-doc', isPending: !automation?.items.length },
  ];

  const allGenerateEmpty =
    !enhancementTotal &&
    !scenarios.length &&
    !testCases.length &&
    !automation?.items.length &&
    !uploadedRequirements.length &&
    !jiraRequirements.length;

  const workspaceItems: { key: TabKey; label: string; icon: string }[] = [
    { key: 'projects', label: 'Projects', icon: 'ti-folder' },
    { key: 'output',   label: 'Output Schema',   icon: 'ti-file-export' },
  ];

  const utilityItems: { key: TabKey; label: string; icon: string }[] = [];

  const isAdminRole = userRole === 'OWNER' || userRole === 'ADMIN';

  return (
    <div className="app-layout">

      {/* ── Save-to-project banner ───────────────────────────────────────── */}
      {savedBanner && (
        <div className="save-banner" role="status">
          <i className="ti ti-circle-check" aria-hidden="true" />
          <span>Saved to <strong>{savedBanner.projectName}</strong></span>
          <button className="save-banner-link" onClick={() => { setSavedBanner(null); setActiveTab('projects'); }}>
            View in Projects →
          </button>
          <button className="save-banner-close" onClick={() => setSavedBanner(null)} aria-label="Dismiss">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── Project picker modal (no active project at generation complete) ─ */}
      {showProjectPicker && (
        <div className="proj-modal-overlay" role="dialog" aria-modal="true" aria-label="Save to project">
          <div className="proj-modal save-picker-modal">
            <h3>Save to Project</h3>
            <p className="save-picker-hint">Generation complete — select a project to link these artifacts:</p>
            {pickerProjects.length === 0 ? (
              <p className="save-picker-empty">No projects found. <button className="link-btn" onClick={() => { setShowProjectPicker(false); setActiveTab('projects'); }}>Create one →</button></p>
            ) : (
              <ul className="save-picker-list">
                {pickerProjects.map((proj) => (
                  <li key={proj.id}>
                    <button
                      className="save-picker-item"
                      disabled={pickerBusy}
                      onClick={() => void handlePickerSave(proj)}
                    >
                      <span className="save-picker-key">{proj.key}</span>
                      <span className="save-picker-name">{proj.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="button-row">
              <button type="button" onClick={() => setShowProjectPicker(false)}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <aside className="sidebar" aria-label="Main navigation">

        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
              <circle cx="12" cy="4.5" r="2.5" fill="white"/>
              <line x1="12" y1="7" x2="6" y2="17" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="12" y1="7" x2="18" y2="17" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="6" cy="19.5" r="2.5" fill="white"/>
              <circle cx="18" cy="19.5" r="2.5" fill="white"/>
            </svg>
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">trace<span className="sidebar-brand-lms">LMs</span><span className="sidebar-brand-cloud">Cloud</span></span>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">

          {/* Generate section */}
          <div className="sidebar-section">
            <span className="sidebar-section-label">Generate</span>
            <div className="sidebar-pipeline">
              {generateItems.map(({ key, label, icon, count, isFirst, isPending }) => {
                const hasData = isFirst
                  ? !allGenerateEmpty
                  : count !== undefined && count > 0;
                const showPending = isPending || (!hasData && !isFirst);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`sidebar-item${activeTab === key ? ' active' : ''}${showPending ? ' sidebar-item--pending' : ''}`}
                    onClick={() => nav(key)}
                    aria-current={activeTab === key ? 'page' : undefined}
                    data-has-data={hasData ? 'true' : 'false'}
                  >
                    <span className="sidebar-item-inner">
                      <i className={`ti ${icon} sidebar-icon`} aria-hidden="true" />
                      {label}
                      {isFirst && allGenerateEmpty && (
                        <span className="sidebar-start-badge" aria-label="Start here">START</span>
                      )}
                    </span>
                    {count !== undefined && (
                      <span className="sidebar-count" aria-label={`${count} items`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sidebar-divider" aria-hidden="true" />

          {/* Workspace section */}
          <div className="sidebar-section">
            <span className="sidebar-section-label">Workspace</span>
            {workspaceItems.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                className={`sidebar-item${activeTab === key ? ' active' : ''}`}
                onClick={() => nav(key)}
                aria-current={activeTab === key ? 'page' : undefined}
              >
                <span className="sidebar-item-inner">
                  <i className={`ti ${icon} sidebar-icon`} aria-hidden="true" />
                  {label}
                </span>
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
              <span className="sidebar-item-inner">
                <i className="ti ti-book sidebar-icon" aria-hidden="true" />
                Guide
              </span>
            </button>
          </div>

        </nav>

        {/* Utility nav — pinned above footer */}
        <div className="sidebar-utility">
          {utilityItems.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              className={`sidebar-item${activeTab === key ? ' active' : ''}`}
              onClick={() => nav(key)}
              aria-current={activeTab === key ? 'page' : undefined}
            >
              <span className="sidebar-item-inner">
                <i className={`ti ${icon} sidebar-icon`} aria-hidden="true" />
                {label}
              </span>
            </button>
          ))}
          {isAdminRole && (
            <button
              type="button"
              className={`sidebar-item sidebar-item--admin${activeTab === 'admin' ? ' active' : ''}`}
              onClick={() => nav('admin')}
              aria-current={activeTab === 'admin' ? 'page' : undefined}
              title="Administration"
            >
              <span className="sidebar-item-inner">
                <i className="ti ti-shield-cog sidebar-icon" aria-hidden="true" />
                Administration
              </span>
            </button>
          )}
        </div>

        {/* Footer — status + logout */}
        <div className="sidebar-footer" role="status" aria-live="polite">
          {activeProjectName ? (
            <div className="sidebar-active-project" title={`Active project: ${activeProjectName}`}>
              <i className="ti ti-folder-filled" aria-hidden="true" />
              <span className="sidebar-active-project-name">{activeProjectName}</span>
            </div>
          ) : (
            <div className="sidebar-no-project" title="No active project set">
              <i className="ti ti-folder-off" aria-hidden="true" />
              <span className="sidebar-no-project-label">No project set</span>
            </div>
          )}

          {/* User identity block — avatar (+ presence dot) + email + role + sign out */}
          {authUser && (
            <div className="sidebar-identity">
              <div className="sidebar-identity-avatar-wrap">
                <div className="sidebar-identity-avatar" aria-hidden="true">
                  {authUser.email.charAt(0).toUpperCase()}
                </div>
                {!isIdleStatus && (
                  <span className={statusDotClass} aria-hidden="false" role="status" title={status} />
                )}
              </div>
              <div className="sidebar-identity-info">
                <span className="sidebar-identity-email" title={authUser.email}>
                  {authUser.email}
                </span>
                {userRole && (
                  <span
                    className={`sidebar-role-badge sidebar-role-badge--${userRole.toLowerCase()}`}
                    title={ROLE_DESCRIPTIONS[userRole]}
                    aria-label={`Your role: ${ROLE_LABELS[userRole]}`}
                  >
                    {ROLE_LABELS[userRole]}
                  </span>
                )}
              </div>
              <button onClick={onLogout} className="sidebar-signout-icon" title="Sign out" aria-label="Sign out">
                <i className="ti ti-logout" aria-hidden="true" />
              </button>
            </div>
          )}
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
              activeProjectId={activeProjectId}
              activeProjectName={activeProjectName}
              onGoToProjects={() => setActiveTab('projects')}
              uploadedRequirements={uploadedRequirements}
              jiraRequirements={jiraRequirements}
              instructionText={instructionText}
              manualText={manualText}
              requirementsReviewed={requirementsReviewed}
              generationProgress={generationProgress}
              uploadDrafts={uploadDrafts}
              jiraMode={jiraMode}
              singleIssueKey={singleIssueKey}
              multipleIssueKeys={multipleIssueKeys}
              epicKey={epicKey}
              storyQuery={storyQuery}
              storyOptions={storyOptions}
              selectedStoryKeys={selectedStoryKeys}
              isBusy={isBusy}
              isReadOnly={!canWrite(userRole)}
              feedback={feedback}
              selectedProvider={settings.llmProvider}
              onInstructionTextChange={setInstructionText}
              onManualTextChange={setManualText}
              onReviewedChange={setRequirementsReviewed}
              onGenerateAll={handleGenerateAll}
              onClearAll={clearAll}
              onFileChange={handleFileChange}
              onFilesDropped={processFiles}
              onParseFiles={parseSelectedFiles}
              documentWarnings={documentWarnings}
              onDismissWarnings={() => setDocumentWarnings([])}
              onRequirementUpdate={handleRequirementUpdate}
              onRequirementDelete={handleRequirementDelete}
              onJiraRequirementUpdate={handleJiraRequirementUpdate}
              onJiraRequirementDelete={handleJiraRequirementDelete}
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
              generationId={lastSavedGenerationId}
              onTestCasesChange={setTestCases}
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


        {activeTab === 'projects' && (
          <ErrorBoundary tabName="Projects">
            <ProjectsTab
              activeProjectId={activeProjectId}
              onProjectActivate={handleProjectActivate}
              onGenerationLoad={handleGenerationLoad}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'documents' && (
          <ErrorBoundary tabName="Documents">
            <DocumentsTab
              activeProjectId={activeProjectId}
              activeProjectName={activeProjectName}
              settings={settings}
              isBusy={isBusy}
              onBusyChange={setIsBusy}
            />
          </ErrorBoundary>
        )}


        {activeTab === 'output' && (
          <ErrorBoundary tabName="Output">
            <OutputTab tokenUsage={tokenUsage} />
          </ErrorBoundary>
        )}


        {activeTab === 'guide' && (
          <ErrorBoundary tabName="Guide">
            <GuideTab />
          </ErrorBoundary>
        )}

        {activeTab === 'admin' && authUser && isAdminRole && (
          <ErrorBoundary tabName="Administration">
            <AdminPage
              currentUserRole={(authUser.role ?? 'EDITOR') as import('./types').OrgRole}
              currentUserId={authUser.id}
              onBack={() => nav('requirements')}
              settings={settings}
              availableModels={availableModels}
              isBusy={isBusy}
              feedback={feedback}
              onFieldChange={updateSettingsField}
              onSave={saveSettings}
              onTestLlm={testLlm}
              onTestJira={testJira}
              activeProjectId={activeProjectId}
              activeProjectName={activeProjectName}
            />
          </ErrorBoundary>
        )}

      </main>
    </div>
  );
}

export default App;
