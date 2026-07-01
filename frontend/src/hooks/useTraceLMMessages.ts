// Web version: replaces vscode.postMessage / window.addEventListener transport with fetch calls.
// All actions are async functions that call the Express API and update state directly.

import { useCallback, useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import {
  type Settings,
  type ParsedFile,
  type JiraIssueSummary,
  type UploadDraft,
  type RequirementEnhancement,
  type RequirementPriority,
  type ExtractedRequirement,
  type ScenarioItem,
  type TestCaseItem,
  type AutomationAnalysis,
  type XrayPushedIssue,
  type XrayPushPreview,
  type XrayPushProgress,
  type TokenUsage,
  emptyEnhancement,
} from '../types';
import * as api from '../api/client';
import { buildRequirementsPayload } from '../utils';

type Refs = {
  generateAllStepRef: MutableRefObject<number>;
  requirementTextRef: MutableRefObject<string>;
  enhancementRef: MutableRefObject<RequirementEnhancement>;
  scenariosRef: MutableRefObject<ScenarioItem[]>;
  settingsRef: MutableRefObject<Settings>;
  testCasesRef: MutableRefObject<TestCaseItem[]>;
  xrayPushedIssuesRef: MutableRefObject<XrayPushedIssue[]>;
  uploadDraftsRef: MutableRefObject<UploadDraft[]>;
  uploadedRequirementsRef: MutableRefObject<ExtractedRequirement[]>;
  manualTextRef: MutableRefObject<string>;
  activeProjectIdRef: MutableRefObject<string | null>;
  activeProjectJiraKeyRef: MutableRefObject<string | null>;
};

type Setters = {
  setStatus: Dispatch<SetStateAction<string>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setFeedbackDetail: Dispatch<SetStateAction<string>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setSettings: Dispatch<SetStateAction<Settings>>;
  setRequirementText: Dispatch<SetStateAction<string>>;
  setRequirementsReviewed: Dispatch<SetStateAction<boolean>>;
  setParsedFiles: Dispatch<SetStateAction<ParsedFile[]>>;
  setDocumentWarnings: Dispatch<SetStateAction<string[]>>;
  setUploadedRequirements: Dispatch<SetStateAction<ExtractedRequirement[]>>;
  setJiraRequirements: Dispatch<SetStateAction<ExtractedRequirement[]>>;
  setStoryOptions: Dispatch<SetStateAction<JiraIssueSummary[]>>;
  setPulledIssues: Dispatch<SetStateAction<JiraIssueSummary[]>>;
  setEnhancement: Dispatch<SetStateAction<RequirementEnhancement>>;
  setScenarios: Dispatch<SetStateAction<ScenarioItem[]>>;
  setTestCases: Dispatch<SetStateAction<TestCaseItem[]>>;
  setXrayPushedIssues: Dispatch<SetStateAction<XrayPushedIssue[]>>;
  setAutomation: Dispatch<SetStateAction<AutomationAnalysis | null>>;
  setXrayPushPreview: Dispatch<SetStateAction<XrayPushPreview | null>>;
  setXrayPushProgress: Dispatch<SetStateAction<XrayPushProgress | null>>;
  setGenerationProgress: Dispatch<SetStateAction<string>>;
  setTokenUsage: Dispatch<SetStateAction<TokenUsage | null>>;
  setJiraError: Dispatch<SetStateAction<string>>;
  onEnhancementReceived?: () => void;
  onScenariosReceived?: () => void;
  onChainSettled?: () => void;
  // BUG-8: called after Generate All completes so App can navigate to the results tab.
  onGenerateAllDone?: () => void;
  // Called when Generate All fails so the UI can show a contextual retry button
  // with the exact error message.
  // stepKey: 'enhancement+scenarios' | 'testCases' | 'automation'
  onGenerateAllFailed?: (stepKey: string, errorMessage: string) => void;
  // Called after the generation record is saved; generationId is the DB row id.
  // projectId is the active project at save time (null if none).
  onGenerationSaved?: (generationId: string, projectId: string | null) => void;
};

export type TraceLMActions = {
  saveSettings: () => void;
  testLlm: () => void;
  testJira: () => void;
  parseSelectedFiles: () => void;
  searchStories: (query: string) => void;
  pullFromJira: (mode: string, payload: Record<string, string>) => void;
  generateEnhancement: () => void;
  generateAll: () => void;
  generateScenarios: () => void;
  generateTestCases: () => void;
  // BUG-2 fix: dedicated action so Automation tab doesn't re-run test case generation.
  generateAutomationAnalysis: () => void;
  pushTestCasesToXray: () => void;
  retryFailedPushes: () => void;
  previewXrayPush: () => void;
  clearXrayHistory: () => void;
};

export function useTraceLMMessages(params: Refs & Setters): TraceLMActions {
  const {
    generateAllStepRef, requirementTextRef, enhancementRef, scenariosRef,
    settingsRef, testCasesRef, xrayPushedIssuesRef, uploadDraftsRef, uploadedRequirementsRef, manualTextRef,
    setStatus, setFeedback, setFeedbackDetail, setIsBusy, setSettings,
    setRequirementText, setRequirementsReviewed,
    setParsedFiles, setDocumentWarnings, setUploadedRequirements, setJiraRequirements,
    setStoryOptions, setPulledIssues,
    setEnhancement, setScenarios, setTestCases,
    setXrayPushedIssues, setAutomation,
    setXrayPushPreview, setXrayPushProgress, setGenerationProgress, setTokenUsage,
    setJiraError,
    onEnhancementReceived, onScenariosReceived, onChainSettled, onGenerateAllDone, onGenerateAllFailed,
    onGenerationSaved, activeProjectIdRef, activeProjectJiraKeyRef,
  } = params;

  function mergeUsage(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage | undefined {
    if (!a && !b) return undefined;
    return {
      promptTokens: (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0),
      completionTokens: (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0),
      totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
    };
  }

  // Index aligns with generateAllStepRef: 1=Phase1(parallel), 2=Test Cases, 3=Automation
  const STEP_NAMES = ['', 'Phase 1 (Enhancement + Scenarios)', 'Test Cases', 'Automation Analysis'];

  const STEP_KEY_MAP: Record<number, string> = {
    1: 'enhancement+scenarios',
    2: 'testCases',
    3: 'automation',
  };

  // ── User-friendly error summaries keyed by operation context ──────────────
  // Each entry maps the internal context label used in handleError() calls to a
  // plain-English sentence shown to all users. The raw technical message is kept
  // in feedbackDetail and revealed only when the user clicks "Details ▸".
  const FRIENDLY_ERRORS: Record<string, string> = {
    'LLM test':               'Unable to connect to the AI provider. Check your API key and model in LLM Providers.',
    'Jira test':              'Could not connect to Jira. Check your URL, email, and API token in Integrations.',
    'Jira pull':              'Could not fetch requirements from Jira.',
    'Jira search':            'Jira story search failed.',
    'Requirement extraction': 'Could not extract requirements from your content.',
    'Enhancement':            'Requirement enhancement failed.',
    'Scenarios':              'Scenario generation failed.',
    'Test Cases':             'Test case generation failed.',
    'Automation analysis':    'Automation analysis failed.',
    'Xray push':              'Could not push test cases to Xray.',
    'Xray retry':             'Retry push to Xray failed.',
    'Xray preview':           'Could not load the Xray push preview.',
    'Clear history':          'Could not clear Xray push history.',
  };

  const STEP_FRIENDLY: Record<number, string> = {
    1: 'requirement analysis (Enhancement + Scenarios)',
    2: 'test case generation',
    3: 'automation analysis',
  };

  // Detects known transient/billing error patterns in the raw message string so
  // the main (visible) section can give a more actionable hint than the generic
  // operation-level label. Returns undefined when no pattern matches, allowing
  // the caller to fall back to FRIENDLY_ERRORS.
  function detectKnownPattern(raw: string): string | undefined {
    const r = raw.toLowerCase();
    // Token quota / billing exhaustion — all major providers
    if (
      r.includes('quota') ||
      r.includes('credit') ||
      r.includes('billing') ||
      r.includes('insufficient_quota') ||
      r.includes('resource_exhausted') ||   // Gemini
      r.includes('token limit') ||
      r.includes('context length') ||
      r.includes('context_length_exceeded') // OpenAI
    ) {
      return 'Your AI provider has run out of tokens or credits. Check your billing dashboard and top up, then try again.';
    }
    // Rate limiting
    if (
      r.includes('rate limit') ||
      r.includes('rate_limit') ||
      r.includes('too many requests') ||
      r.includes('429')
    ) {
      return 'The AI provider is rate-limiting your requests. Wait a moment, then try again.';
    }
    // Authentication / invalid key
    if (
      r.includes('invalid api key') ||
      r.includes('unauthorized') ||
      r.includes('401') ||
      r.includes('authentication')
    ) {
      return 'The AI provider rejected the request. Check that your API key is correct in LLM Providers.';
    }
    return undefined;
  }

  const handleError = useCallback((err: unknown, context?: string): void => {
    setIsBusy(false);
    const rawMessage = err instanceof Error ? err.message : 'Unknown error.';
    if (generateAllStepRef.current > 0) {
      const stepKey = STEP_KEY_MAP[generateAllStepRef.current] ?? '';
      const stepFriendly = STEP_FRIENDLY[generateAllStepRef.current] ?? `step ${generateAllStepRef.current}`;
      generateAllStepRef.current = 0;
      onChainSettled?.();
      setGenerationProgress('');
      onGenerateAllFailed?.(stepKey, rawMessage);
      const knownPattern = detectKnownPattern(rawMessage);
      setFeedback(knownPattern ?? `Generation stopped during ${stepFriendly}.`);
      setFeedbackDetail(rawMessage);
    } else {
      const knownPattern = detectKnownPattern(rawMessage);
      const friendly = knownPattern ?? FRIENDLY_ERRORS[context ?? ''] ?? 'Something went wrong.';
      setFeedback(friendly);
      setFeedbackDetail(rawMessage);
    }
  }, [setIsBusy, setFeedback, setFeedbackDetail, setGenerationProgress, generateAllStepRef, onChainSettled, onGenerateAllFailed]);

  // ── Settings ────────────────────────────────────────────────────────────────

  const saveSettings = useCallback((): void => {
    // Web version: settings live in React state and are sent with every API call.
    // No server-side save needed. Persist to localStorage for browser-session survival.
    setFeedbackDetail('');
    try {
      localStorage.setItem('tracelms-settings', JSON.stringify(settingsRef.current));
      setFeedback('Settings saved.');
    } catch {
      setFeedback('Could not save settings.');
    }
  }, [settingsRef, setFeedback, setFeedbackDetail]);

  const testLlm = useCallback((): void => {
    setIsBusy(true);
    setFeedbackDetail('');
    setFeedback('Validating LLM settings...');
    void api.testLlm(settingsRef.current).then(({ ok, message }) => {
      setIsBusy(false);
      setFeedback(`LLM: ${message}`);
      if (ok) setStatus('LLM connected');
    }).catch((err: unknown) => handleError(err, 'LLM test'));
  }, [settingsRef, setIsBusy, setFeedback, setFeedbackDetail, setStatus, handleError]);

  // BUG-7 fix: update navbar status dot when Jira test succeeds, same as testLlm.
  const testJira = useCallback((): void => {
    setIsBusy(true);
    setFeedbackDetail('');
    setFeedback('Testing Jira connectivity...');
    void api.testJira(settingsRef.current).then(({ ok, message }) => {
      setIsBusy(false);
      setFeedback(`Jira/Xray: ${message}`);
      if (ok) setStatus('Jira connected');
    }).catch((err: unknown) => handleError(err, 'Jira test'));
  }, [settingsRef, setIsBusy, setFeedback, setFeedbackDetail, setStatus, handleError]);

  // ── Files ───────────────────────────────────────────────────────────────────

  const parseSelectedFiles = useCallback((): void => {
    const drafts = uploadDraftsRef.current;
    const hasManual = manualTextRef.current.trim().length > 0;
    // Exclude error drafts (size/format errors) from processing
    const validDrafts = drafts.filter((d) => !d.sizeError);
    const imageDrafts = validDrafts.filter((d) => d.isImage);
    const docDrafts   = validDrafts.filter((d) => !d.isImage);
    const hasDocs     = docDrafts.length > 0;
    const hasImages   = imageDrafts.length > 0;

    if (!hasDocs && !hasImages && !hasManual) {
      setFeedback('Add files or type requirements before extracting.');
      return;
    }
    setIsBusy(true);
    setFeedbackDetail('');
    setUploadedRequirements([]);

    void (async () => {
      try {
        // Parallel execution: text call (docs + manual) + one vision call per image
        const feedbackParts: string[] = [];
        if (hasDocs || hasManual) feedbackParts.push('Parsing documents…');
        if (hasImages) feedbackParts.push('Analysing images…');
        setFeedback(feedbackParts.join('  |  '));

        // Build text call promise (resolves to ExtractedRequirement[])
        const textPromise: Promise<ExtractedRequirement[]> = (hasDocs || hasManual)
          ? (async () => {
              let fileText = '';
              if (hasDocs) {
                const { combinedText, files, warnings } = await api.parseFiles(docDrafts);
                setParsedFiles(files);
                if (warnings && warnings.length > 0) setDocumentWarnings(warnings);
                fileText = combinedText ?? '';
              }
              const rawText = [fileText, manualTextRef.current.trim()].filter(Boolean).join('\n\n');
              if (!rawText) return [];
              setFeedback('Extracting requirements…');
              const rows: ExtractedRequirement[] = [];
              await api.streamExtractRequirements(rawText, settingsRef.current, (row) => {
                rows.push(row);
              });
              return rows;
            })()
          : Promise.resolve([]);

        // Build one vision call per image (Q1 decision — one call per image, concurrent)
        let visionFailed = false;
        let visionErrorMsg = '';
        const visionPromises: Promise<ExtractedRequirement[]>[] = imageDrafts.map((img) =>
          api.extractImageRequirements(img.contentBase64, img.mimeType, settingsRef.current)
            .catch((err: unknown) => {
              visionFailed = true;
              visionErrorMsg = err instanceof Error ? err.message : 'Image extraction failed.';
              return [] as ExtractedRequirement[];
            })
        );

        // Run all concurrently
        const [textRows, ...imageRowSets] = await Promise.all([textPromise, ...visionPromises]);
        const allRows = [...textRows, ...imageRowSets.flat()];

        // Reassign sequential REQ-IDs across all sources after merge
        const merged: ExtractedRequirement[] = allRows.map((row, i) => ({
          ...row,
          reqId: `REQ-${String(i + 1).padStart(3, '0')}`,
        }));

        setUploadedRequirements(merged);
        setRequirementsReviewed(false);
        setIsBusy(false);
        // Don't overwrite the vision error message if extraction failed and produced nothing
        if (visionFailed && merged.length === 0) {
          setFeedback('Image analysis failed. Check that your LLM provider supports vision.');
          setFeedbackDetail(visionErrorMsg);
        } else {
          setFeedback(`Extracted ${merged.length} requirement(s).`);
        }
      } catch (err: unknown) {
        handleError(err, 'Requirement extraction');
      }
    })();
  }, [uploadDraftsRef, manualTextRef, settingsRef, setIsBusy, setFeedback, setParsedFiles, setDocumentWarnings, setUploadedRequirements, setRequirementsReviewed, handleError]);

  // ── Jira ────────────────────────────────────────────────────────────────────

  const searchStories = useCallback((query: string): void => {
    setIsBusy(true);
    setFeedbackDetail('');
    setFeedback('Searching Jira stories...');
    void api.searchStories(query, settingsRef.current).then(({ stories }) => {
      setIsBusy(false);
      setStoryOptions(stories);
      setFeedback(`Found ${stories.length} stories.`);
    }).catch((err: unknown) => handleError(err, 'Jira search'));
  }, [settingsRef, setIsBusy, setFeedback, setFeedbackDetail, setStoryOptions, handleError]);

  const pullFromJira = useCallback((mode: string, payload: Record<string, string>): void => {
    setIsBusy(true);
    setFeedbackDetail('');
    setFeedback('Pulling Jira requirements...');
    setJiraError('');
    void api.pullFromJira(mode, payload, settingsRef.current).then(({ issues }) => {
      setIsBusy(false);
      setFeedback('');
      setPulledIssues(issues);
      const mapped: ExtractedRequirement[] = issues.map((issue) => ({
        reqId: issue.key,
        summary: issue.summary,
        description: issue.description,
        issueType: issue.issueType === 'Epic' ? 'Epic' : 'Story',
        requirementType: 'Functional',
        priority: (issue.priority as RequirementPriority) ?? 'Medium',
        source: 'jira',
      }));
      setJiraRequirements(mapped);
      setRequirementsReviewed(false);
    }).catch((err: unknown) => {
      setIsBusy(false);
      const rawMessage = err instanceof Error ? err.message : 'Unknown error.';
      setFeedback('');
      setJiraError(rawMessage);
    });
  }, [settingsRef, setIsBusy, setFeedback, setFeedbackDetail, setJiraError, setPulledIssues, setJiraRequirements, setRequirementsReviewed]);

  // ── Generation ──────────────────────────────────────────────────────────────

  const runEnhancement = useCallback(async (requirements: string): Promise<{ result: RequirementEnhancement; usage?: TokenUsage }> => {
    const { enhancement: raw, usage } = await api.streamEnhancement(
      requirements,
      settingsRef.current,
      (e) => {
        if (e.type === 'model-info' && e.isReasoning) setFeedback('Reasoning model active — this step may take longer than usual...');
        else if (e.type === 'chunk') setFeedback(`Enhancing requirements... (${e.chars.toLocaleString()} chars)`);
      },
      activeProjectIdRef.current,
    );
    const normalized = { ...emptyEnhancement, ...(raw as Partial<RequirementEnhancement>) };
    setEnhancement(normalized);
    enhancementRef.current = normalized;
    onEnhancementReceived?.();
    setFeedback('Requirement enhancement complete.');
    return { result: normalized, usage };
  }, [settingsRef, enhancementRef, setEnhancement, onEnhancementReceived, setFeedback]);

  // Enhancement is optional — when running in parallel with enhancement (Generate All DAG),
  // scenarios starts from requirements alone. The prompt handles the absent enhancement case.
  const runScenarios = useCallback(async (requirements: string, enhancement?: RequirementEnhancement): Promise<{ result: ScenarioItem[]; usage?: TokenUsage }> => {
    const { scenarios: raw, usage } = await api.streamScenarios(
      requirements,
      enhancement ?? null,
      settingsRef.current,
      (e) => {
        if (e.type === 'model-info' && e.isReasoning) setFeedback('Reasoning model active — this step may take longer than usual...');
        else if (e.type === 'chunk') setFeedback(`Generating scenarios... (${e.chars.toLocaleString()} chars)`);
      },
      activeProjectIdRef.current,
    );
    const parsed = (raw as ScenarioItem[]) ?? [];
    setScenarios(parsed);
    scenariosRef.current = parsed;
    onScenariosReceived?.();
    setFeedback(`Generated ${parsed.length} scenario(s).`);
    return { result: parsed, usage };
  }, [settingsRef, scenariosRef, setScenarios, onScenariosReceived, setFeedback]);

  const runTestCases = useCallback(async (scenarios: ScenarioItem[]): Promise<{ result: TestCaseItem[]; usage?: TokenUsage }> => {
    const { testCases: raw, usage } = await api.streamTestCases(
      scenarios,
      settingsRef.current,
      (e) => {
        if (e.type === 'model-info' && e.isReasoning) setFeedback('Reasoning model active — this step may take longer than usual...');
        else if (e.type === 'chunk') setFeedback(`Generating test cases... (${e.chars.toLocaleString()} chars)`);
      },
      activeProjectIdRef.current,
    );
    const parsed = (raw as TestCaseItem[]) ?? [];
    setTestCases(parsed);
    setXrayPushedIssues([]);
    setFeedback(`Generated ${parsed.length} test case(s).`);
    return { result: parsed, usage };
  }, [settingsRef, setTestCases, setXrayPushedIssues, setFeedback]);

  const runAutomation = useCallback(async (requirements: string, enhancement: RequirementEnhancement, scenarios: ScenarioItem[], testCases: TestCaseItem[]): Promise<{ result: AutomationAnalysis; usage?: TokenUsage }> => {
    const { analysis: raw, usage } = await api.streamAutomation(
      requirements,
      enhancement,
      scenarios,
      testCases,
      settingsRef.current,
      (event) => {
        if (event.type === 'model-info' && event.isReasoning) setFeedback('Reasoning model active — this step may take longer than usual...');
        else if (event.type === 'batch') setFeedback(`Analyzing automation candidates... (batch ${event.current} of ${event.total})`);
        else if (event.type === 'chunk') setFeedback(`Analyzing automation candidates... (${event.chars.toLocaleString()} chars)`);
      },
      activeProjectIdRef.current,
    );
    const analysis = raw as AutomationAnalysis;
    setAutomation(analysis);
    setFeedback('Automation analysis completed.');
    return { result: analysis, usage };
  }, [settingsRef, setAutomation, setFeedback]);

  const runNfrEnrichment = useCallback(async (reqs: ExtractedRequirement[]): Promise<{ result: ExtractedRequirement[]; usage?: TokenUsage }> => {
    const hasNfrs = reqs.some((r) => r.requirementType === 'Non-Functional');
    if (!hasNfrs) return { result: reqs };
    const { requirements: enriched, usage } = await api.streamNfrEnrichment(
      reqs,
      settingsRef.current,
      (e) => {
        if (e.type === 'model-info' && e.isReasoning) setFeedback('Reasoning model active — this step may take longer than usual...');
        else if (e.type === 'chunk') setFeedback(`Enriching NFR requirements with performance benchmarks... (${e.chars.toLocaleString()} chars)`);
      },
    );
    const parsed = (enriched as ExtractedRequirement[]) ?? reqs;
    setUploadedRequirements(parsed);
    setFeedback(`NFR enrichment complete — ${parsed.filter((r) => r.requirementType === 'Non-Functional').length} NFR(s) enriched with benchmark guidance.`);
    return { result: parsed, usage };
  }, [settingsRef, setUploadedRequirements, setFeedback]);

  const generateEnhancement = useCallback((): void => {
    if (!requirementTextRef.current.trim()) { setFeedback('Add requirements text before enhancement.'); return; }
    setIsBusy(true);
    setFeedbackDetail('');
    setFeedback('Generating requirement enhancement...');
    void runEnhancement(requirementTextRef.current).then(({ usage }) => { setIsBusy(false); if (usage) setTokenUsage(usage); }).catch((err: unknown) => handleError(err, 'Enhancement'));
  }, [requirementTextRef, setIsBusy, setFeedback, setFeedbackDetail, setTokenUsage, runEnhancement, handleError]);

  const generateScenarios = useCallback((): void => {
    if (!requirementTextRef.current.trim()) { setFeedback('Add requirements text before scenario generation.'); return; }
    setIsBusy(true);
    setFeedbackDetail('');
    setFeedback('Generating scenarios...');
    void runScenarios(requirementTextRef.current, enhancementRef.current).then(({ usage }) => { setIsBusy(false); if (usage) setTokenUsage(usage); }).catch((err: unknown) => handleError(err, 'Scenarios'));
  }, [requirementTextRef, enhancementRef, setIsBusy, setFeedback, setFeedbackDetail, setTokenUsage, runScenarios, handleError]);

  const generateTestCases = useCallback((): void => {
    if (!scenariosRef.current.length) { setFeedback('Generate scenarios first.'); return; }
    setIsBusy(true);
    setFeedbackDetail('');
    setFeedback('Generating test cases...');
    void runTestCases(scenariosRef.current).then(({ usage }) => { setIsBusy(false); if (usage) setTokenUsage(usage); }).catch((err: unknown) => handleError(err, 'Test Cases'));
  }, [scenariosRef, setIsBusy, setFeedback, setFeedbackDetail, setTokenUsage, runTestCases, handleError]);

  // BUG-2 fix: dedicated action for the Automation tab that uses current state, never re-runs test cases.
  const generateAutomationAnalysis = useCallback((): void => {
    if (!testCasesRef.current.length) { setFeedback('Generate test cases first.'); return; }
    setIsBusy(true);
    setFeedbackDetail('');
    setFeedback('Analyzing automation candidates...');
    void runAutomation(
      requirementTextRef.current,
      enhancementRef.current,
      scenariosRef.current,
      testCasesRef.current
    ).then(({ usage }) => { setIsBusy(false); if (usage) setTokenUsage(usage); }).catch((err: unknown) => handleError(err, 'Automation analysis'));
  }, [testCasesRef, requirementTextRef, enhancementRef, scenariosRef, setIsBusy, setFeedback, setFeedbackDetail, setTokenUsage, runAutomation, handleError]);

  // ── Generate All — DAG-aware parallel execution ──────────────────────────────
  //
  // Dependency graph:
  //   Phase 1 (parallel): Enhancement + Scenarios — both need only requirements
  //   Phase 2 (sequential): Test Cases — needs Scenarios output
  //   Phase 3 (sequential): Automation — needs Test Cases + Enhancement (receives both)
  //
  // Enhancement is optional for Scenarios (prompt handles absent case), so both
  // can race from the same starting gun. Automation still receives full Enhancement
  // context, preserving output quality where it matters most.
  const generateAll = useCallback((): void => {
    // Fall back to raw manual text when no structured payload has been built yet
    const requirements = requirementTextRef.current.trim() || manualTextRef.current.trim();
    if (!requirements) {
      const hasPendingDrafts = uploadDraftsRef.current.some((d) => !d.sizeError);
      setFeedback(hasPendingDrafts
        ? 'Click \'Extract Requirements\' first to process your uploaded files before generating.'
        : 'Add requirements text before generation.');
      return;
    }
    localStorage.removeItem('tracelms-session-cleared'); // new generation — allow future restores
    setIsBusy(true);
    setFeedbackDetail('');
    generateAllStepRef.current = 1;

    void (async () => {
      try {
        // ── NFR Enrichment (pre-phase) ───────────────────────────────────────
        // Runs only when structured requirements contain at least one NFR.
        // Appends industry benchmark guidance to NFR descriptions before Phase 1
        // so Enhancement and Scenario prompts receive enriched context.
        setTokenUsage(null);
        const structuredReqs = uploadedRequirementsRef.current;
        let enrichUsage: TokenUsage | undefined;
        if (structuredReqs.length > 0 && structuredReqs.some((r) => r.requirementType === 'Non-Functional')) {
          setGenerationProgress('nfr-enrichment');
          setFeedback('Enriching NFR requirements with performance benchmarks...');
          const { result: enriched, usage: eu } = await runNfrEnrichment(structuredReqs);
          enrichUsage = eu;
          if (enriched.length > 0) {
            // Rebuild requirementText from enriched requirements so Phase 1 sees the updated descriptions
            const newText = buildRequirementsPayload(enriched, [], '');
            requirementTextRef.current = newText;
          }
        }

        // ── Phase 1: Enhancement ∥ Scenarios ────────────────────────────────
        setGenerationProgress('phase1');
        if (enrichUsage) setTokenUsage(enrichUsage);
        setFeedback('Phase 1 of 3: Enhancement + Scenarios running in parallel...');
        // Each stream reports its own cumulative char count. Track them separately
        // and sum for the feedback label so the two callbacks don't overwrite each other.
        let enhChars = 0;
        let scnChars = 0;
        const updatePhase1 = (): void => {
          const total = enhChars + scnChars;
          if (total > 0) setFeedback(`Phase 1 of 3: Enhancement + Scenarios running in parallel... (${total.toLocaleString()} chars)`);
        };

        const [{ normalized: enhancement, usage: enhUsage }, { parsed: scenarios, usage: scnUsage }] = await Promise.all([
          (async () => {
            const { enhancement: raw, usage } = await api.streamEnhancement(
              requirements,
              settingsRef.current,
              (e) => { if (e.type === 'chunk') { enhChars = e.chars; updatePhase1(); } },
              activeProjectIdRef.current,
            );
            const normalized = { ...emptyEnhancement, ...(raw as Partial<RequirementEnhancement>) };
            setEnhancement(normalized);
            enhancementRef.current = normalized;
            onEnhancementReceived?.();
            return { normalized, usage };
          })(),
          (async () => {
            const { scenarios: raw, usage } = await api.streamScenarios(
              requirements,
              null,
              settingsRef.current,
              (e) => { if (e.type === 'chunk') { scnChars = e.chars; updatePhase1(); } },
              activeProjectIdRef.current,
            );
            const parsed = (raw as ScenarioItem[]) ?? [];
            setScenarios(parsed);
            scenariosRef.current = parsed;
            onScenariosReceived?.();
            return { parsed, usage };
          })(),
        ]);

        const phase1Usage = mergeUsage(enhUsage, scnUsage);
        if (phase1Usage) setTokenUsage(phase1Usage);

        if (scenarios.length === 0) throw new Error('Scenario generation returned no results. Please try again.');

        // ── Phase 2: Test Cases ──────────────────────────────────────────────
        generateAllStepRef.current = 2;
        setGenerationProgress('phase2');
        setFeedback('Phase 2 of 3: Generating test cases from scenarios...');
        const { result: testCases, usage: tcUsage } = await runTestCases(scenarios);
        const phase2Usage = mergeUsage(phase1Usage, tcUsage);
        if (phase2Usage) setTokenUsage(phase2Usage);

        if (testCases.length === 0) throw new Error('Test case generation returned no results. Please try again.');

        // ── Phase 3: Automation Analysis ─────────────────────────────────────
        generateAllStepRef.current = 3;
        setGenerationProgress('phase3');
        setFeedback('Phase 3 of 3: Analyzing automation candidates...');
        const { result: automation, usage: autoUsage } = await runAutomation(requirements, enhancement, scenarios, testCases);
        const finalUsage = mergeUsage(phase2Usage, autoUsage);
        if (finalUsage) setTokenUsage(finalUsage);

        generateAllStepRef.current = 0;
        onChainSettled?.();
        setGenerationProgress('done');
        setFeedback('All artifacts generated successfully.');
        onGenerateAllDone?.();
        setTimeout(() => setGenerationProgress(''), 2000);

        const activeProjectId = activeProjectIdRef.current ?? undefined;
        void api.saveGeneration({
          requirementText: requirements,
          llmProvider: settingsRef.current.llmProvider,
          llmModel: settingsRef.current.llmModel,
          status: 'COMPLETED',
          enhancement,
          scenarios,
          testCases,
          automation,
          projectId: activeProjectId,
          promptTokens: finalUsage?.promptTokens,
          completionTokens: finalUsage?.completionTokens,
          totalTokens: finalUsage?.totalTokens,
        }).then(({ id }) => {
          onGenerationSaved?.(id, activeProjectId ?? null);
        }).catch(() => { /* silent — DB write failure does not affect the completed generation */ });
      } catch (err) {
        void api.saveGeneration({
          requirementText: requirementTextRef.current,
          llmProvider: settingsRef.current.llmProvider,
          llmModel: settingsRef.current.llmModel,
          status: 'FAILED',
          enhancement: enhancementRef.current ?? null,
          scenarios: scenariosRef.current.length ? scenariosRef.current : null,
          testCases: testCasesRef.current.length ? testCasesRef.current : null,
          automation: null,
        }).catch(() => { /* silent */ });
        handleError(err);
      } finally {
        setIsBusy(false);
      }
    })();
  }, [requirementTextRef, manualTextRef, generateAllStepRef, activeProjectIdRef, uploadedRequirementsRef, setIsBusy, setFeedback, setFeedbackDetail, setGenerationProgress, runNfrEnrichment, runEnhancement, runScenarios, runTestCases, runAutomation, onChainSettled, onGenerateAllDone, onGenerationSaved, handleError]);

  // ── Xray ────────────────────────────────────────────────────────────────────

  const pushTestCasesToXray = useCallback((): void => {
    if (!testCasesRef.current.length) { setFeedback('Generate test cases first.'); return; }
    setIsBusy(true);
    setFeedbackDetail('');
    setXrayPushProgress(null);
    setFeedback('Pushing test cases to Xray...');
    const xraySettings = activeProjectJiraKeyRef.current
      ? { ...settingsRef.current, jiraProjectKey: activeProjectJiraKeyRef.current }
      : settingsRef.current;
    void api.pushToXray(testCasesRef.current, [], xraySettings).then(({ pushed }) => {
      setIsBusy(false);
      const statuses = (pushed as Array<{ localId: string; success: string; key: string; url: string; message: string; isValidationError?: boolean; errorClass?: string; fixPath?: string }>).map((item) => ({
        localId: item.localId,
        success: item.success === 'true',
        key: item.key,
        url: item.url,
        message: item.message,
        isValidationError: item.isValidationError,
        errorClass: item.errorClass as XrayPushedIssue['errorClass'],
        fixPath: item.fixPath,
      }));
      setXrayPushedIssues((prev) => {
        const map = new Map(prev.map((i) => [i.localId, i]));
        for (const s of statuses) map.set(s.localId, s);
        return Array.from(map.values());
      });
      const successCount = statuses.filter((i) => i.success).length;
      setXrayPushProgress(null);
      setFeedback(`Xray push complete: ${successCount} succeeded, ${statuses.length - successCount} failed.`);
    }).catch((err: unknown) => handleError(err, 'Xray push'));
  }, [testCasesRef, settingsRef, activeProjectJiraKeyRef, setIsBusy, setFeedback, setFeedbackDetail, setXrayPushedIssues, setXrayPushProgress, handleError]);

  const retryFailedPushes = useCallback((): void => {
    const failedIds = xrayPushedIssuesRef.current.filter((i) => !i.success).map((i) => i.localId);
    if (!failedIds.length) { setFeedback('No failed Xray pushes to retry.'); return; }
    setIsBusy(true);
    setFeedbackDetail('');
    setXrayPushProgress(null);
    setFeedback(`Retrying ${failedIds.length} failed push(es)...`);
    const xraySettings = activeProjectJiraKeyRef.current
      ? { ...settingsRef.current, jiraProjectKey: activeProjectJiraKeyRef.current }
      : settingsRef.current;
    void api.pushToXray(testCasesRef.current, failedIds, xraySettings).then(({ pushed }) => {
      setIsBusy(false);
      const statuses = (pushed as Array<{ localId: string; success: string; key: string; url: string; message: string; isValidationError?: boolean; errorClass?: string; fixPath?: string }>).map((item) => ({
        localId: item.localId, success: item.success === 'true', key: item.key, url: item.url, message: item.message,
        isValidationError: item.isValidationError,
        errorClass: item.errorClass as XrayPushedIssue['errorClass'],
        fixPath: item.fixPath,
      }));
      setXrayPushedIssues((prev) => {
        const map = new Map(prev.map((i) => [i.localId, i]));
        for (const s of statuses) map.set(s.localId, s);
        return Array.from(map.values());
      });
      const successCount = statuses.filter((i) => i.success).length;
      setFeedback(`Retry complete: ${successCount} succeeded.`);
    }).catch((err: unknown) => handleError(err, 'Xray retry'));
  }, [xrayPushedIssuesRef, testCasesRef, settingsRef, activeProjectJiraKeyRef, setIsBusy, setFeedback, setFeedbackDetail, setXrayPushedIssues, setXrayPushProgress, handleError]);

  const previewXrayPush = useCallback((): void => {
    if (!testCasesRef.current.length) { setFeedback('Generate test cases first.'); return; }
    setIsBusy(true);
    setFeedbackDetail('');
    setFeedback('Previewing Xray push...');
    const xraySettings = activeProjectJiraKeyRef.current
      ? { ...settingsRef.current, jiraProjectKey: activeProjectJiraKeyRef.current }
      : settingsRef.current;
    void api.previewXrayPush(testCasesRef.current, xraySettings).then(({ preview }) => {
      setIsBusy(false);
      const p = preview as XrayPushPreview;
      setXrayPushPreview(p);
      setFeedback(`Preview ready: ${p.willPush} to push, ${p.duplicates} duplicates, ${p.validationErrors} validation errors.`);
    }).catch((err: unknown) => handleError(err, 'Xray preview'));
  }, [testCasesRef, settingsRef, activeProjectJiraKeyRef, setIsBusy, setFeedback, setFeedbackDetail, setXrayPushPreview, handleError]);

  const clearXrayHistory = useCallback((): void => {
    setIsBusy(true);
    setFeedbackDetail('');
    void api.clearXrayHistory().then(({ message }) => {
      setIsBusy(false);
      setXrayPushedIssues([]);
      setFeedback(message);
    }).catch((err: unknown) => handleError(err, 'Clear history'));
  }, [setIsBusy, setFeedback, setFeedbackDetail, setXrayPushedIssues, handleError]);

  // BUG-1 fix: actually run the settings restore on mount via useEffect instead of a dead void expression.
  // Also restores the most recent completed generation so the user's last session is immediately available.
  useEffect(() => {
    // Settings restore (synchronous)
    try {
      const saved = localStorage.getItem('tracelms-settings');
      if (saved) {
        const parsed = JSON.parse(saved) as Settings;
        setSettings(parsed);
        setStatus('Settings restored. Ready.');
      } else {
        setStatus('TraceLMs Cloud ready. Configure your settings to begin.');
      }
    } catch {
      setStatus('TraceLMs Cloud ready.');
    }

    // Generation restore (async — must not block settings restore)
    // Skip if the user explicitly cleared the session — respect their intent until a new generation runs.
    void (async () => {
      try {
        if (localStorage.getItem('tracelms-session-cleared') === 'true') return;
        const { generation } = await api.fetchLatestGeneration();
        if (!generation) return;

        const enhancement = { ...emptyEnhancement, ...(generation.enhancement as Partial<RequirementEnhancement>) };
        const scenarios = (generation.scenarios as ScenarioItem[]) ?? [];
        const testCases = (generation.testCases as TestCaseItem[]) ?? [];
        const automation = (generation.automation as AutomationAnalysis) ?? null;

        setRequirementText(generation.requirementText);
        requirementTextRef.current = generation.requirementText;

        setEnhancement(enhancement);
        enhancementRef.current = enhancement;

        setScenarios(scenarios);
        scenariosRef.current = scenarios;

        setTestCases(testCases);
        testCasesRef.current = testCases;

        setAutomation(automation);
        setRequirementsReviewed(true);

        setFeedback(`Restored from last session — ${testCases.length} test case(s), ${scenarios.length} scenario(s).`);
      } catch {
        // silent — a failed restore must not block the app from loading
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  return {
    saveSettings, testLlm, testJira,
    parseSelectedFiles, searchStories, pullFromJira,
    generateEnhancement, generateAll, generateScenarios, generateTestCases,
    generateAutomationAnalysis,
    pushTestCasesToXray, retryFailedPushes, previewXrayPush, clearXrayHistory,
  };
}
