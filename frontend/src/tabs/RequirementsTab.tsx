import { memo, useMemo, useState, useCallback } from 'react';
import { type JiraIssueSummary, type JiraMode, type ParsedFile, type UploadDraft } from '../types';
import { StepStepper } from '../components/StepStepper';

type Props = {
  requirementText: string;
  requirementsReviewed: boolean;
  generationProgress: string;
  parsedFiles: ParsedFile[];
  uploadDrafts: UploadDraft[];
  jiraMode: JiraMode;
  singleIssueKey: string;
  multipleIssueKeys: string;
  epicKey: string;
  storyQuery: string;
  storyOptions: JiraIssueSummary[];
  selectedStoryKeys: string[];
  pulledIssues: JiraIssueSummary[];
  isBusy: boolean;
  feedback: string;
  onRequirementTextChange: (text: string) => void;
  onReviewedChange: (reviewed: boolean) => void;
  onGenerateAll: () => void;
  onClearAll: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onParseFiles: () => void;
  onJiraModeChange: (mode: JiraMode) => void;
  onSingleKeyChange: (key: string) => void;
  onMultipleKeysChange: (keys: string) => void;
  onEpicKeyChange: (key: string) => void;
  onStoryQueryChange: (query: string) => void;
  onSearchStories: () => void;
  onToggleStoryKey: (key: string) => void;
  onPullJira: () => void;
};

export const RequirementsTab = memo(function RequirementsTab({
  requirementText, requirementsReviewed, generationProgress,
  parsedFiles, uploadDrafts, jiraMode, singleIssueKey, multipleIssueKeys,
  epicKey, storyQuery, storyOptions, selectedStoryKeys,
  pulledIssues, isBusy, feedback,
  onRequirementTextChange, onReviewedChange, onGenerateAll, onClearAll,
  onFileChange, onParseFiles, onJiraModeChange,
  onSingleKeyChange, onMultipleKeysChange, onEpicKeyChange,
  onStoryQueryChange, onSearchStories, onToggleStoryKey, onPullJira,
}: Props): JSX.Element {
  const selectedStoryKeySet = useMemo(() => new Set(selectedStoryKeys), [selectedStoryKeys]);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const { activeStep, secondActiveStep } = useMemo(() => {
    if (generationProgress === 'done') return { activeStep: 5 };
    if (generationProgress === 'phase1') return { activeStep: 1, secondActiveStep: 2 };
    if (generationProgress === 'phase2') return { activeStep: 3 };
    if (generationProgress === 'phase3') return { activeStep: 4 };
    const match = generationProgress.match(/\((\d)\/4\)/);
    return match ? { activeStep: parseInt(match[1], 10) } : { activeStep: 0 };
  }, [generationProgress]);

  const handleClearRequest = useCallback(() => setConfirmingClear(true), []);
  const handleClearCancel  = useCallback(() => setConfirmingClear(false), []);
  const handleClearConfirm = useCallback(() => {
    setConfirmingClear(false);
    onClearAll();
  }, [onClearAll]);

  return (
    <section className="panel">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="requirements-page-header">
        <div className="requirements-page-title">
          <h2>Requirements</h2>
          <p className="helper-text">
            Load requirements via any source below, confirm they are ready, then generate all artifacts.
          </p>
        </div>

        {/* Top-right action zone */}
        <div className="req-header-actions">

          {/* Clear All — destructive, ghost, with inline confirm guard */}
          {confirmingClear ? (
            <div className="req-clear-confirm">
              <span className="req-clear-confirm-label">
                ⚠ This will remove all generated artifacts.
              </span>
              <button
                type="button"
                className="req-clear-confirm-yes"
                onClick={handleClearConfirm}
              >
                Yes, clear
              </button>
              <button
                type="button"
                className="req-clear-confirm-cancel"
                onClick={handleClearCancel}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="req-clear-btn"
              onClick={handleClearRequest}
              disabled={isBusy}
              title="Discard all requirements and generated artifacts"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 3.5h12M5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M12 3.5l-.9 8.1a1 1 0 0 1-1 .9H3.9a1 1 0 0 1-1-.9L2 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Clear All
            </button>
          )}

          {/* Save & New — primary, placeholder until Projects are live */}
          <button
            type="button"
            className="req-save-btn"
            disabled
            title="Save this generation run to a project — available when Projects are set up (coming soon)"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M11.5 12.5h-9a1 1 0 0 1-1-1v-9l2-2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4.5 12.5v-4h5v4M4.5 1.5v3h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Save &amp; New
            <span className="req-save-badge">Soon</span>
          </button>

        </div>
      </div>

      <StepStepper activeStep={activeStep} secondActiveStep={secondActiveStep} />

      {/* ── Section 1: Requirement Editor ──────────────────────────────────── */}
      <div className="req-source-box">
        <div className="req-source-header">
          <div className="req-source-header-left">
            <span className="req-source-badge">1</span>
            <div>
              <p className="req-source-title">Requirement Editor</p>
              <p className="req-source-desc">Type or paste your requirements directly — user stories, BRD/SRS content, or any free-form text.</p>
            </div>
          </div>
        </div>
        <div className="field-stack">
          <textarea
            id="requirementsText"
            className="requirements-text"
            value={requirementText}
            onChange={(e) => onRequirementTextChange(e.target.value)}
            placeholder="Paste requirement text, user stories, BRD/SRS content, or pulled Jira details..."
            disabled={isBusy}
          />
        </div>
      </div>

      {/* ── Section 2: File Upload ──────────────────────────────────────────── */}
      <div className="req-source-box">
        <div className="req-source-header">
          <div className="req-source-header-left">
            <span className="req-source-badge">2</span>
            <div>
              <p className="req-source-title">File Upload Parsing</p>
              <p className="req-source-desc">Upload a document and parse its content into the Requirement Editor above. Supports .txt, .md, .docx, .pdf.</p>
            </div>
          </div>
        </div>
        <div className="button-row">
          <input type="file" multiple accept=".txt,.md,.docx,.pdf" onChange={onFileChange} disabled={isBusy} />
          <button
            type="button"
            data-variant="secondary"
            onClick={onParseFiles}
            disabled={isBusy || !uploadDrafts.length}
          >
            Parse Selected Files
          </button>
        </div>
        {!!uploadDrafts.length && !parsedFiles.length && (
          <div className="upload-drafts">
            <span className="upload-drafts-label">Staged ({uploadDrafts.length}):</span>
            {uploadDrafts.map((f) => (
              <span key={f.name} className="upload-draft-chip">{f.name}</span>
            ))}
          </div>
        )}
        {!!parsedFiles.length && (
          <ul className="list" style={{ marginTop: 'var(--space-2)' }}>
            {parsedFiles.map((file) => (
              <li key={file.name}>
                {file.name}: {file.error ? `Error — ${file.error}` : 'Parsed ✓'}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Section 3: Pull from Jira ──────────────────────────────────────── */}
      <div className="req-source-box">
        <div className="req-source-header">
          <div className="req-source-header-left">
            <span className="req-source-badge">3</span>
            <div>
              <p className="req-source-title">Pull from Jira</p>
              <p className="req-source-desc">Fetch requirements directly from Jira issues, epics, or stories. Jira credentials must be saved in Integrations.</p>
            </div>
          </div>
        </div>
        <div className="field-row">
          <label htmlFor="jiraMode">Mode</label>
          <select id="jiraMode" value={jiraMode} onChange={(e) => onJiraModeChange(e.target.value as JiraMode)}>
            <option value="single">Single Issue</option>
            <option value="multiple">Multiple Issues (comma-separated)</option>
            <option value="epic">Epic Children</option>
            <option value="multiStory">Multi-Story Picker</option>
          </select>
        </div>
        {jiraMode === 'single' && (
          <div className="field-row">
            <label htmlFor="singleIssueKey">Issue Key</label>
            <input id="singleIssueKey" type="text" placeholder="PROJ-123" value={singleIssueKey} onChange={(e) => onSingleKeyChange(e.target.value)} />
          </div>
        )}
        {jiraMode === 'multiple' && (
          <div className="field-stack">
            <label htmlFor="multipleIssueKeys">Issue Keys</label>
            <textarea id="multipleIssueKeys" className="small-text" placeholder="PROJ-101, PROJ-102, PROJ-103" value={multipleIssueKeys} onChange={(e) => onMultipleKeysChange(e.target.value)} />
          </div>
        )}
        {jiraMode === 'epic' && (
          <div className="field-row">
            <label htmlFor="epicKey">Epic Key</label>
            <input id="epicKey" type="text" placeholder="PROJ-EPIC-1" value={epicKey} onChange={(e) => onEpicKeyChange(e.target.value)} />
          </div>
        )}
        {jiraMode === 'multiStory' && (
          <>
            <div className="button-row">
              <input type="text" placeholder="Search stories by summary" value={storyQuery} onChange={(e) => onStoryQueryChange(e.target.value)} disabled={isBusy} />
              <button type="button" onClick={onSearchStories} disabled={isBusy}>Search Stories</button>
            </div>
            <div className="story-list">
              {storyOptions.map((story) => (
                <label key={story.key} className="story-item">
                  <input type="checkbox" checked={selectedStoryKeySet.has(story.key)} onChange={() => onToggleStoryKey(story.key)} />
                  <span>{story.key}: {story.summary}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="button-row" style={{ marginTop: 'var(--space-3)' }}>
          <button type="button" data-variant="secondary" onClick={onPullJira} disabled={isBusy}>
            Pull Jira Requirements
          </button>
        </div>
        {!!pulledIssues.length && (
          <ul className="list" style={{ marginTop: 'var(--space-2)' }}>
            {pulledIssues.map((issue) => (
              <li key={issue.key}>{issue.key}: {issue.summary}</li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Generation footer ──────────────────────────────────────────────── */}
      <div className="req-generate-footer">
        {/* Left — spacer keeps the CTA zone right-aligned */}
        <div />

        {/* Right — review gate + generate button as one unified CTA zone */}
        <div className="req-cta-zone">
          <label
            className={`req-review-gate${requirementsReviewed ? ' req-review-gate--checked' : ''}`}
            title="Confirm your requirements are complete before generating"
          >
            <input
              type="checkbox"
              checked={requirementsReviewed}
              onChange={(e) => onReviewedChange(e.target.checked)}
              disabled={isBusy}
            />
            <span>Requirements reviewed and ready</span>
          </label>

          <button
            type="button"
            onClick={onGenerateAll}
            disabled={isBusy}
            className={`req-generate-btn${requirementsReviewed ? ' req-generate-btn--ready' : ''}`}
            title={requirementsReviewed
              ? 'Generate all artifacts'
              : 'Check the box to confirm your requirements are ready'}
          >
            ⚡ Generate All Artifacts
          </button>
        </div>
      </div>

      <p className="feedback">{feedback}</p>
    </section>
  );
});
