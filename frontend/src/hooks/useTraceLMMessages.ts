// Web version: replaces vscode.postMessage / window.addEventListener transport with fetch calls.
// All actions are async functions that call the Express API and update state directly.

import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import {
  type Settings,
  type ParsedFile,
  type JiraIssueSummary,
  type UploadDraft,
  type RequirementEnhancement,
  type ScenarioItem,
  type TestCaseItem,
  type AutomationAnalysis,
  type XrayPushedIssue,
  type XrayPushPreview,
  type XrayPushProgress,
  emptyEnhancement,
} from '../types';
import * as api from '../api/client';

type Refs = {
  generateAllStepRef: MutableRefObject<number>;
  requirementTextRef: MutableRefObject<string>;
  enhancementRef: MutableRefObject<RequirementEnhancement>;
  scenariosRef: MutableRefObject<ScenarioItem[]>;
  lastGenIdRef: MutableRefObject<Record<string, string>>;
  settingsRef: MutableRefObject<Settings>;
  testCasesRef: MutableRefObject<TestCaseItem[]>;
  xrayPushedIssuesRef: MutableRefObject<XrayPushedIssue[]>;
  uploadDraftsRef: MutableRefObject<UploadDraft[]>;
};

type Setters = {
  setStatus: Dispatch<SetStateAction<string>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setSettings: Dispatch<SetStateAction<Settings>>;
  setRequirementText: Dispatch<SetStateAction<string>>;
  setRequirementsReviewed: Dispatch<SetStateAction<boolean>>;
  setParsedFiles: Dispatch<SetStateAction<ParsedFile[]>>;
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
  onEnhancementReceived?: () => void;
  onScenariosReceived?: () => void;
  onChainSettled?: () => void;
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
  pushTestCasesToXray: () => void;
  retryFailedPushes: () => void;
  previewXrayPush: () => void;
  clearXrayHistory: () => void;
};

export function useTraceLMMessages(params: Refs & Setters): TraceLMActions {
  const {
    generateAllStepRef, requirementTextRef, enhancementRef, scenariosRef,
    settingsRef, testCasesRef, xrayPushedIssuesRef, uploadDraftsRef,
    setStatus, setFeedback, setIsBusy, setSettings,
    setRequirementText, setRequirementsReviewed,
    setParsedFiles, setStoryOptions, setPulledIssues,
    setEnhancement, setScenarios, setTestCases,
    setXrayPushedIssues, setAutomation,
    setXrayPushPreview, setXrayPushProgress, setGenerationProgress,
    onEnhancementReceived, onScenariosReceived, onChainSettled,
  } = params;

  const handleError = useCallback((err: unknown, context?: string): void => {
    setIsBusy(false);
    if (generateAllStepRef.current > 0) {
      generateAllStepRef.current = 0;
      onChainSettled?.();
      setGenerationProgress('');
      setFeedback(`Generate All stopped: ${err instanceof Error ? err.message : 'Unknown error.'}`);
    } else {
      setFeedback(`${context ? `${context}: ` : ''}${err instanceof Error ? err.message : 'Unknown error.'}`);
    }
  }, [setIsBusy, setFeedback, setGenerationProgress, generateAllStepRef, onChainSettled]);

  // ── Settings ────────────────────────────────────────────────────────────────

  const saveSettings = useCallback((): void => {
    // Web version: settings live in React state and are sent with every API call.
    // No server-side save needed. Persist to localStorage for browser-session survival.
    try {
      localStorage.setItem('tracelms-settings', JSON.stringify(settingsRef.current));
      setFeedback('Settings saved.');
    } catch {
      setFeedback('Failed to save settings to local storage.');
    }
  }, [settingsRef, setFeedback]);

  const testLlm = useCallback((): void => {
    setIsBusy(true);
    setFeedback('Validating LLM settings...');
    void api.testLlm(settingsRef.current).then(({ ok, message }) => {
      setIsBusy(false);
      setFeedback(`LLM: ${message}`);
      if (ok) setStatus('LLM connected');
    }).catch((err: unknown) => handleError(err, 'LLM test'));
  }, [settingsRef, setIsBusy, setFeedback, setStatus, handleError]);

  const testJira = useCallback((): void => {
    setIsBusy(true);
    setFeedback('Validating Jira/Xray settings...');
    void api.testJira(settingsRef.current).then(({ message }) => {
      setIsBusy(false);
      setFeedback(`Jira/Xray: ${message}`);
    }).catch((err: unknown) => handleError(err, 'Jira test'));
  }, [settingsRef, setIsBusy, setFeedback, handleError]);

  // ── Files ───────────────────────────────────────────────────────────────────

  const parseSelectedFiles = useCallback((): void => {
    if (!uploadDraftsRef.current.length) { setFeedback('Select at least one file first.'); return; }
    setIsBusy(true);
    setFeedback('Parsing selected files...');
    void api.parseFiles(uploadDraftsRef.current).then(({ combinedText, files }) => {
      setIsBusy(false);
      setParsedFiles(files);
      if (combinedText) {
        setRequirementText((prev) => prev ? `${prev}\n\n${combinedText}` : combinedText);
        setRequirementsReviewed(false);
      }
      setFeedback('File parsing complete.');
    }).catch((err: unknown) => handleError(err, 'File parsing'));
  }, [uploadDraftsRef, setIsBusy, setFeedback, setParsedFiles, setRequirementText, setRequirementsReviewed, handleError]);

  // ── Jira ────────────────────────────────────────────────────────────────────

  const searchStories = useCallback((query: string): void => {
    setIsBusy(true);
    setFeedback('Searching Jira stories...');
    void api.searchStories(query, settingsRef.current).then(({ stories }) => {
      setIsBusy(false);
      setStoryOptions(stories);
      setFeedback(`Found ${stories.length} stories.`);
    }).catch((err: unknown) => handleError(err, 'Jira search'));
  }, [settingsRef, setIsBusy, setFeedback, setStoryOptions, handleError]);

  const pullFromJira = useCallback((mode: string, payload: Record<string, string>): void => {
    setIsBusy(true);
    setFeedback('Pulling Jira requirements...');
    void api.pullFromJira(mode, payload, settingsRef.current).then(({ issues, combinedText }) => {
      setIsBusy(false);
      setPulledIssues(issues);
      if (combinedText) {
        setRequirementText((prev) => prev ? `${prev}\n\n${combinedText}` : combinedText);
        setRequirementsReviewed(false);
      }
      setFeedback(`Pulled ${issues.length} Jira issue(s).`);
    }).catch((err: unknown) => handleError(err, 'Jira pull'));
  }, [settingsRef, setIsBusy, setFeedback, setPulledIssues, setRequirementText, setRequirementsReviewed, handleError]);

  // ── Generation ──────────────────────────────────────────────────────────────

  const runEnhancement = useCallback(async (requirements: string): Promise<RequirementEnhancement> => {
    const { enhancement: raw } = await api.generateEnhancement(requirements, settingsRef.current);
    const normalized = { ...emptyEnhancement, ...(raw as Partial<RequirementEnhancement>) };
    setEnhancement(normalized);
    enhancementRef.current = normalized;
    onEnhancementReceived?.();
    setFeedback('Requirement enhancement complete.');
    return normalized;
  }, [settingsRef, enhancementRef, setEnhancement, onEnhancementReceived, setFeedback]);

  const runScenarios = useCallback(async (requirements: string, enhancement: RequirementEnhancement): Promise<ScenarioItem[]> => {
    const { scenarios: raw } = await api.generateScenarios(requirements, enhancement, settingsRef.current);
    const parsed = (raw as ScenarioItem[]) ?? [];
    setScenarios(parsed);
    scenariosRef.current = parsed;
    onScenariosReceived?.();
    setFeedback(`Generated ${parsed.length} scenario(s).`);
    return parsed;
  }, [settingsRef, scenariosRef, setScenarios, onScenariosReceived, setFeedback]);

  const runTestCases = useCallback(async (scenarios: ScenarioItem[]): Promise<TestCaseItem[]> => {
    const { testCases: raw } = await api.generateTestCases(scenarios, settingsRef.current);
    const parsed = (raw as TestCaseItem[]) ?? [];
    setTestCases(parsed);
    setXrayPushedIssues([]);
    setFeedback(`Generated ${parsed.length} test case(s).`);
    return parsed;
  }, [settingsRef, setTestCases, setXrayPushedIssues, setFeedback]);

  const runAutomation = useCallback(async (requirements: string, enhancement: RequirementEnhancement, scenarios: ScenarioItem[], testCases: TestCaseItem[]): Promise<void> => {
    const { analysis: raw } = await api.generateAutomation(requirements, enhancement, scenarios, testCases, settingsRef.current);
    setAutomation(raw as AutomationAnalysis);
    setFeedback('Automation analysis completed.');
  }, [settingsRef, setAutomation, setFeedback]);

  const generateEnhancement = useCallback((): void => {
    if (!requirementTextRef.current.trim()) { setFeedback('Add requirements text before enhancement.'); return; }
    setIsBusy(true);
    setFeedback('Generating requirement enhancement...');
    void runEnhancement(requirementTextRef.current).then(() => setIsBusy(false)).catch((err: unknown) => handleError(err, 'Enhancement'));
  }, [requirementTextRef, setIsBusy, setFeedback, runEnhancement, handleError]);

  const generateScenarios = useCallback((): void => {
    if (!requirementTextRef.current.trim()) { setFeedback('Add requirements text before scenario generation.'); return; }
    setIsBusy(true);
    setFeedback('Generating scenarios...');
    void runScenarios(requirementTextRef.current, enhancementRef.current).then(() => setIsBusy(false)).catch((err: unknown) => handleError(err, 'Scenarios'));
  }, [requirementTextRef, enhancementRef, setIsBusy, setFeedback, runScenarios, handleError]);

  const generateTestCases = useCallback((): void => {
    if (!scenariosRef.current.length) { setFeedback('Generate scenarios first.'); return; }
    setIsBusy(true);
    setFeedback('Generating test cases...');
    void runTestCases(scenariosRef.current).then(() => setIsBusy(false)).catch((err: unknown) => handleError(err, 'Test Cases'));
  }, [scenariosRef, setIsBusy, setFeedback, runTestCases, handleError]);

  // Generate All — sequential await instead of chained postMessages
  const generateAll = useCallback((): void => {
    if (!requirementTextRef.current.trim()) { setFeedback('Add requirements text before generation.'); return; }
    setIsBusy(true);
    generateAllStepRef.current = 1;

    void (async () => {
      try {
        setGenerationProgress('Requirement Enhancement (1/4)...');
        setFeedback('Generating all artifacts sequentially...');
        const enhancement = await runEnhancement(requirementTextRef.current);

        generateAllStepRef.current = 2;
        setGenerationProgress('Test Scenarios (2/4)...');
        const scenarios = await runScenarios(requirementTextRef.current, enhancement);

        if (scenarios.length === 0) throw new Error('Scenario generation returned no results. Please try again.');

        generateAllStepRef.current = 3;
        setGenerationProgress('Test Cases (3/4)...');
        const testCases = await runTestCases(scenarios);

        if (testCases.length === 0) throw new Error('Test case generation returned no results. Please try again.');

        generateAllStepRef.current = 4;
        setGenerationProgress('Automation Analysis (4/4)...');
        await runAutomation(requirementTextRef.current, enhancement, scenarios, testCases);

        generateAllStepRef.current = 0;
        onChainSettled?.();
        setGenerationProgress('done');
        setFeedback('All artifacts generated successfully.');
        setTimeout(() => setGenerationProgress(''), 2000);
      } catch (err) {
        handleError(err);
      } finally {
        setIsBusy(false);
      }
    })();
  }, [requirementTextRef, generateAllStepRef, setIsBusy, setFeedback, setGenerationProgress, runEnhancement, runScenarios, runTestCases, runAutomation, onChainSettled, handleError]);

  // ── Xray ────────────────────────────────────────────────────────────────────

  const pushTestCasesToXray = useCallback((): void => {
    if (!testCasesRef.current.length) { setFeedback('Generate test cases first.'); return; }
    setIsBusy(true);
    setXrayPushProgress(null);
    setFeedback('Pushing test cases to Xray...');
    void api.pushToXray(testCasesRef.current, [], settingsRef.current).then(({ pushed }) => {
      setIsBusy(false);
      const statuses = (pushed as Array<{ localId: string; success: string; key: string; url: string; message: string; isValidationError?: boolean }>).map((item) => ({
        localId: item.localId,
        success: item.success === 'true',
        key: item.key,
        url: item.url,
        message: item.message,
        isValidationError: item.isValidationError,
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
  }, [testCasesRef, settingsRef, setIsBusy, setFeedback, setXrayPushedIssues, setXrayPushProgress, handleError]);

  const retryFailedPushes = useCallback((): void => {
    const failedIds = xrayPushedIssuesRef.current.filter((i) => !i.success).map((i) => i.localId);
    if (!failedIds.length) { setFeedback('No failed Xray pushes to retry.'); return; }
    setIsBusy(true);
    setXrayPushProgress(null);
    setFeedback(`Retrying ${failedIds.length} failed push(es)...`);
    void api.pushToXray(testCasesRef.current, failedIds, settingsRef.current).then(({ pushed }) => {
      setIsBusy(false);
      const statuses = (pushed as Array<{ localId: string; success: string; key: string; url: string; message: string }>).map((item) => ({
        localId: item.localId, success: item.success === 'true', key: item.key, url: item.url, message: item.message,
      }));
      setXrayPushedIssues((prev) => {
        const map = new Map(prev.map((i) => [i.localId, i]));
        for (const s of statuses) map.set(s.localId, s);
        return Array.from(map.values());
      });
      const successCount = statuses.filter((i) => i.success).length;
      setFeedback(`Retry complete: ${successCount} succeeded.`);
    }).catch((err: unknown) => handleError(err, 'Xray retry'));
  }, [xrayPushedIssuesRef, testCasesRef, settingsRef, setIsBusy, setFeedback, setXrayPushedIssues, setXrayPushProgress, handleError]);

  const previewXrayPush = useCallback((): void => {
    if (!testCasesRef.current.length) { setFeedback('Generate test cases first.'); return; }
    setIsBusy(true);
    setFeedback('Previewing Xray push...');
    void api.previewXrayPush(testCasesRef.current, settingsRef.current).then(({ preview }) => {
      setIsBusy(false);
      const p = preview as XrayPushPreview;
      setXrayPushPreview(p);
      setFeedback(`Preview ready: ${p.willPush} to push, ${p.duplicates} duplicates, ${p.validationErrors} validation errors.`);
    }).catch((err: unknown) => handleError(err, 'Xray preview'));
  }, [testCasesRef, settingsRef, setIsBusy, setFeedback, setXrayPushPreview, handleError]);

  const clearXrayHistory = useCallback((): void => {
    setIsBusy(true);
    void api.clearXrayHistory().then(({ message }) => {
      setIsBusy(false);
      setXrayPushedIssues([]);
      setFeedback(message);
    }).catch((err: unknown) => handleError(err, 'Clear history'));
  }, [setIsBusy, setFeedback, setXrayPushedIssues, handleError]);

  // Load settings from localStorage on mount
  const _loadSavedSettings = useCallback(() => {
    try {
      const saved = localStorage.getItem('tracelms-settings');
      if (saved) {
        const parsed = JSON.parse(saved) as Settings;
        setSettings(parsed);
        setStatus('TraceLMs Cloud ready.');
      } else {
        setStatus('TraceLMs Cloud ready. Configure your settings to begin.');
      }
    } catch {
      setStatus('TraceLMs Cloud ready.');
    }
  }, [setSettings, setStatus]);

  // Auto-load settings on first render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  void _loadSavedSettings;

  return {
    saveSettings, testLlm, testJira,
    parseSelectedFiles, searchStories, pullFromJira,
    generateEnhancement, generateAll, generateScenarios, generateTestCases,
    pushTestCasesToXray, retryFailedPushes, previewXrayPush, clearXrayHistory,
  };
}
