import { memo, useMemo, useState, useCallback, useRef } from 'react';
import {
  type ExtractedRequirement,
  type JiraIssueSummary,
  type JiraMode,
  type UploadDraft,
} from '../types';
import { VISION_CAPABLE_PROVIDERS } from '../utils';
import { StepStepper } from '../components/StepStepper';
import { RequirementTable } from '../components/RequirementTable';

const ACCEPTED_EXTS = '.txt,.md,.docx,.pdf,.xlsx,.xls,.csv,.pptx,.png,.jpg,.jpeg,.webp';
const MAX_REQUIREMENT_CHARS = 50_000;
const WARN_THRESHOLD = 0.8;

type Props = {
  activeProjectId: string | null;
  activeProjectName: string | null;
  onGoToProjects: () => void;
  uploadedRequirements: ExtractedRequirement[];
  jiraRequirements: ExtractedRequirement[];
  instructionText: string;
  manualText: string;
  requirementsReviewed: boolean;
  generationProgress: string;
  uploadDrafts: UploadDraft[];
  jiraMode: JiraMode;
  singleIssueKey: string;
  multipleIssueKeys: string;
  epicKey: string;
  storyQuery: string;
  storyOptions: JiraIssueSummary[];
  selectedStoryKeys: string[];
  isBusy: boolean;
  feedback: string;
  selectedProvider: string;
  onInstructionTextChange: (text: string) => void;
  onManualTextChange: (text: string) => void;
  onReviewedChange: (reviewed: boolean) => void;
  onGenerateAll: () => void;
  onClearAll: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onFilesDropped: (files: File[]) => Promise<void>;
  onParseFiles: () => void;
  documentWarnings: string[];
  onDismissWarnings: () => void;
  onRequirementUpdate: (reqId: string, field: keyof ExtractedRequirement, value: string) => void;
  onRequirementDelete: (reqId: string) => void;
  onJiraRequirementUpdate: (reqId: string, field: keyof ExtractedRequirement, value: string) => void;
  onJiraRequirementDelete: (reqId: string) => void;
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
  activeProjectId, activeProjectName, onGoToProjects,
  uploadedRequirements, jiraRequirements, instructionText, manualText,
  requirementsReviewed, generationProgress,
  uploadDrafts, jiraMode, singleIssueKey, multipleIssueKeys,
  epicKey, storyQuery, storyOptions, selectedStoryKeys,
  isBusy, feedback, selectedProvider,
  onInstructionTextChange, onManualTextChange, onReviewedChange, onGenerateAll, onClearAll,
  onFileChange, onFilesDropped, onParseFiles, documentWarnings, onDismissWarnings,
  onRequirementUpdate, onRequirementDelete,
  onJiraRequirementUpdate, onJiraRequirementDelete,
  onJiraModeChange, onSingleKeyChange, onMultipleKeysChange, onEpicKeyChange,
  onStoryQueryChange, onSearchStories, onToggleStoryKey, onPullJira,
}: Props): JSX.Element {
  const selectedStoryKeySet = useMemo(() => new Set(selectedStoryKeys), [selectedStoryKeys]);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmNoProject, setConfirmNoProject] = useState(false);
  const [genContextOpen, setGenContextOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const { activeStep, secondActiveStep } = useMemo(() => {
    if (generationProgress === 'done') return { activeStep: 6 };
    if (generationProgress === 'nfr-enrichment') return { activeStep: 1 };
    if (generationProgress === 'phase1') return { activeStep: 2, secondActiveStep: 3 };
    if (generationProgress === 'phase2') return { activeStep: 4 };
    if (generationProgress === 'phase3') return { activeStep: 5 };
    return { activeStep: 0 };
  }, [generationProgress]);

  const handleClearRequest = useCallback(() => setConfirmingClear(true), []);
  const handleClearCancel  = useCallback(() => setConfirmingClear(false), []);
  const handleClearConfirm = useCallback(() => { setConfirmingClear(false); onClearAll(); }, [onClearAll]);

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when leaving the drop zone entirely, not when moving over child elements
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const validExts = ACCEPTED_EXTS.split(',');
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = `.${f.name.split('.').pop()?.toLowerCase() ?? ''}`;
      return validExts.includes(ext);
    });
    if (!files.length) return;
    void onFilesDropped(files);
  }, [onFilesDropped]);

  const hasUploadInput = uploadDrafts.length > 0 || manualText.trim().length > 0;
  const hasImageDrafts = uploadDrafts.some((d) => d.isImage && !d.sizeError);
  const showVisionWarning = hasImageDrafts && !VISION_CAPABLE_PROVIDERS[selectedProvider.toLowerCase()];

  const extractLabel = isBusy
    ? (feedback.startsWith('Extracting') || feedback.startsWith('Analysing') ? 'Extracting…' : 'Parsing…')
    : uploadedRequirements.length > 0
    ? 'Re-extract'
    : 'Extract Requirements';

  const hasValidDrafts = uploadDrafts.some((d) => !d.sizeError);
  const hasAnyRequirements = uploadedRequirements.length > 0 || jiraRequirements.length > 0 || manualText.trim().length > 0 || hasValidDrafts;

  // showReviewGate: only true when there is reviewable content (extracted rows or typed text).
  // Staged-only file drafts are not reviewable until extracted — hide the gate in that state.
  const showReviewGate = uploadedRequirements.length > 0 || jiraRequirements.length > 0 || manualText.trim().length > 0;
  // pendingExtractOnly: files staged but nothing yet reviewable — Generate must be blocked.
  const pendingExtractOnly = hasValidDrafts && !showReviewGate;

  // Nudge: highlight the logical next-step button when its precondition is freshly met.
  // Only one button nudges at a time; nudge stops once the step is complete.
  const nudgeExtract = !isBusy && (
    (hasValidDrafts && uploadedRequirements.length === 0) ||   // files staged but not yet extracted
    manualText.trim().length > 0                               // text typed — always nudge
  );
  const hasJiraInput = (
    (jiraMode === 'single'      && singleIssueKey.trim().length > 0) ||
    (jiraMode === 'multiple'    && multipleIssueKeys.trim().length > 0) ||
    (jiraMode === 'epic'        && epicKey.trim().length > 0) ||
    (jiraMode === 'multiStory'  && selectedStoryKeys.length > 0)
  );
  const nudgeJira = !isBusy && hasJiraInput && jiraRequirements.length === 0;

  return (
    <section className="panel">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="requirements-page-header">
        <div className="requirements-page-title">
          <h2>Requirements</h2>
          <p className="helper-text">
            <i className="ti ti-file-upload req-helper-icon" aria-hidden="true" />
            <strong className="req-helper-keyword">Load</strong> requirements from files or Jira,{' '}
            <i className="ti ti-table req-helper-icon" aria-hidden="true" />
            <strong className="req-helper-keyword">review and edit</strong> the extracted table, then{' '}
            <i className="ti ti-bolt req-helper-icon" aria-hidden="true" />
            <strong className="req-helper-keyword">generate</strong> all artifacts.
          </p>
        </div>

        <div className="req-header-actions">
          {confirmingClear ? (
            <div className="req-clear-confirm">
              <span className="req-clear-confirm-label">
                ⚠ This will remove all generated artifacts.
              </span>
              <button type="button" className="req-clear-confirm-yes" onClick={handleClearConfirm}>
                Yes, clear
              </button>
              <button type="button" className="req-clear-confirm-cancel" onClick={handleClearCancel}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="req-clear-btn"
              onClick={handleClearRequest}
              disabled={isBusy}
              title="Clear all generated artifacts — requirements are kept so you can re-generate"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 3.5h12M5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M12 3.5l-.9 8.1a1 1 0 0 1-1 .9H3.9a1 1 0 0 1-1-.9L2 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Clear All
            </button>
          )}
        </div>
      </div>

      <StepStepper activeStep={activeStep} secondActiveStep={secondActiveStep} />

      {/* ── Section 1: File Upload with Extraction ─────────────────────────── */}
      <div className="req-source-box">
        <div className="req-source-header">
          <div className="req-source-header-left">
            <span className="req-source-badge">1</span>
            <div>
              <p className="req-source-title">File Upload</p>
              <p className="req-source-desc">
                Upload documents or screenshots and extract structured requirements via AI.
              </p>
            </div>
          </div>
        </div>

        {/* Vision warning — amber inline banner when images staged + provider lacks vision */}
        {showVisionWarning && (
          <div className="req-vision-warning" role="alert">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1.5L13 12.5H1L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M7 5.5v3M7 10h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <span>
              Your current LLM provider does not support image analysis.
              Switch to <strong>OpenAI</strong>, <strong>Anthropic</strong>, or <strong>Google</strong> in LLM Providers settings.
            </span>
          </div>
        )}

        {/* Drop zone */}
        <div
          ref={dropRef}
          className="req-dropzone"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-drag-over={isDragOver || undefined}
          aria-label="Drop files here or use the file picker"
        >
          <div className="req-dropzone-inner">
            {/* Document icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {/* Camera icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ opacity: 0.65 }}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span className="req-dropzone-label">Drop files here or</span>
            <label className="req-browse-btn">
              Browse files
              <input
                type="file"
                multiple
                accept={ACCEPTED_EXTS}
                onChange={onFileChange}
                disabled={isBusy}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          <p className="req-dropzone-sublabel">
            .txt .md .docx .pdf .xlsx .xls .csv .pptx · Screenshots &amp; scans: .png .jpg .webp
          </p>
          {!!uploadDrafts.length && (
            <div className="req-staged-files">
              {uploadDrafts.map((f) => (
                <span key={f.name} className={`upload-draft-chip${f.sizeError ? ' upload-draft-chip--error' : ''}`}>
                  {f.isImage && f.thumbnailUrl && !f.sizeError && (
                    <img
                      src={f.thumbnailUrl}
                      alt=""
                      className="req-img-chip-thumb"
                      aria-hidden="true"
                    />
                  )}
                  {f.name}
                  {f.sizeError && <span className="req-chip-error">{f.sizeError}</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Manual text entry — stacked input per Q9: always available, not exclusive */}
        <div className="req-manual-divider" aria-hidden="true">
          <span>or type / paste</span>
        </div>
        <textarea
          className="req-manual-textarea"
          value={manualText}
          onChange={(e) => onManualTextChange(e.target.value)}
          placeholder="Paste or type requirements here — user stories, BRD/SRS content, or free-form text. Combined with uploaded files in one extraction call."
          disabled={isBusy}
          rows={3}
          aria-label="Manual requirements input"
          maxLength={MAX_REQUIREMENT_CHARS}
        />
        {manualText.length > 0 && (() => {
          const pct = manualText.length / MAX_REQUIREMENT_CHARS;
          const isWarn = pct >= WARN_THRESHOLD;
          const isOver = manualText.length >= MAX_REQUIREMENT_CHARS;
          return (
            <div style={{
              textAlign: 'right',
              fontSize: 'var(--text-xs)',
              marginTop: 2,
              color: isOver ? '#e05252' : isWarn ? '#b45309' : 'var(--text-tertiary)',
            }}>
              {manualText.length.toLocaleString()} / {MAX_REQUIREMENT_CHARS.toLocaleString()}
              {isWarn && !isOver && ' — approaching limit'}
              {isOver && ' — limit reached'}
            </div>
          );
        })()}

        {/* Injection warning banner — shown when any parsed document contains suspicious patterns */}
        {documentWarnings.length > 0 && (
          <div className="req-injection-warning" role="alert">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1.5L13 12.5H1L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M7 5.5v3M7 10h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <div className="req-injection-warning-body">
              <strong>Suspicious content detected</strong>
              <ul className="req-injection-warning-list">
                {documentWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
              <p className="req-injection-warning-hint">
                The document may contain prompt injection attempts. Content has been flagged and sandboxed — it will not affect generation instructions.
              </p>
            </div>
            <button
              type="button"
              className="req-injection-warning-dismiss"
              onClick={onDismissWarnings}
              aria-label="Dismiss warning"
            >
              ✕
            </button>
          </div>
        )}

        <div className="button-row" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className={`req-extract-btn${nudgeExtract ? ' req-extract-btn--nudge' : ''}`}
            onClick={onParseFiles}
            disabled={isBusy || !hasUploadInput}
          >
            {extractLabel}
          </button>
          {nudgeExtract && (
            <span className="req-next-step-hint" aria-live="polite">
              ← Next step
            </span>
          )}
          {isBusy && (feedback.startsWith('Parsing') || feedback.startsWith('Extracting')) && (
            <span className="req-extract-progress">{feedback}</span>
          )}
        </div>

        {uploadedRequirements.length > 0 && (
          <RequirementTable
            requirements={uploadedRequirements}
            onUpdate={onRequirementUpdate}
            onDelete={onRequirementDelete}
            isBusy={isBusy}
          />
        )}
      </div>

      {/* ── Section 2: Pull from Jira ──────────────────────────────────────── */}
      <div className="req-source-box">
        <div className="req-source-header">
          <div className="req-source-header-left">
            <span className="req-source-badge">2</span>
            <div>
              <p className="req-source-title">Pull from Jira</p>
              <p className="req-source-desc">
                Fetch requirements directly from Jira. Credentials must be configured in Integrations.
              </p>
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
          <button
            type="button"
            className={`req-extract-btn${nudgeJira ? ' req-pull-jira-btn--nudge' : ''}`}
            onClick={onPullJira}
            disabled={isBusy || !hasJiraInput}
          >
            Pull Jira Requirements
          </button>
          {nudgeJira && (
            <span className="req-next-step-hint" aria-live="polite">
              ← Next step
            </span>
          )}
        </div>

        {jiraRequirements.length > 0 && (
          <RequirementTable
            requirements={jiraRequirements}
            onUpdate={onJiraRequirementUpdate}
            onDelete={onJiraRequirementDelete}
            isBusy={isBusy}
          />
        )}
      </div>

      <p className="feedback">{feedback}</p>

      {/* Spacer reserves space so content above isn't hidden behind fixed bar */}
      <div className="req-sticky-bar-spacer" aria-hidden="true" />

      {/* ── Fixed action bar — always visible, anchored to viewport bottom ─── */}
      <div className="req-sticky-bar">

        {/* Generation Instructions row */}
        <div className="req-sticky-instructions">
          <button
            type="button"
            className="req-instructions-toggle"
            onClick={() => setGenContextOpen((v) => !v)}
            aria-expanded={genContextOpen}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5ZM8.5 3.5l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="req-instructions-label">Generation Instructions</span>
            {instructionText.trim() && !genContextOpen && (
              <span className="req-instructions-preview">
                {instructionText.length > 64 ? `${instructionText.slice(0, 64)}…` : instructionText}
              </span>
            )}
            {instructionText.trim() && (
              <span className="req-gen-context-indicator" aria-label="Instructions active" />
            )}
            <span className="req-instructions-chevron" aria-hidden="true">{genContextOpen ? '▾' : '▸'}</span>
          </button>
          {genContextOpen && (
            <textarea
              className="req-gen-context-textarea req-instructions-textarea"
              value={instructionText}
              onChange={(e) => onInstructionTextChange(e.target.value)}
              placeholder="Optional: add special instructions for the LLM — e.g. 'Focus on security edge cases', 'Prioritize GDPR compliance requirements', 'Group by epic where possible'."
              disabled={isBusy}
              rows={3}
            />
          )}
        </div>

        {/* ── No active project gate — adjacent to the action it guards ─────── */}
        {!activeProjectId && !confirmNoProject && (
          <div className="req-project-indicator req-project-indicator--warn" role="status">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <span>No active project — artifacts won&apos;t be auto-saved.{' '}
              <button className="link-btn" onClick={onGoToProjects}>Set an active project →</button>
            </span>
          </div>
        )}

        {/* Inline confirmation — shown when user clicks Generate without a project */}
        {confirmNoProject && (
          <div className="req-confirm-zone" role="alert">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <span>No active project — artifacts won&apos;t be saved. Generate anyway?</span>
            <div className="req-confirm-actions">
              <button
                type="button"
                data-variant="secondary"
                onClick={() => { setConfirmNoProject(false); onGoToProjects(); }}
              >
                Set project
              </button>
              <button
                type="button"
                onClick={() => { setConfirmNoProject(false); onGenerateAll(); }}
              >
                Generate anyway
              </button>
            </div>
          </div>
        )}

        {/* CTA row — review gate + generate */}
        <div className="req-cta-zone">
          {showReviewGate && (
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
          )}

          <button
            type="button"
            onClick={activeProjectId ? onGenerateAll : () => setConfirmNoProject(true)}
            disabled={isBusy || !hasAnyRequirements || pendingExtractOnly || confirmNoProject}
            className={`req-generate-btn${requirementsReviewed ? ' req-generate-btn--ready' : ''}`}
            title={
              !hasAnyRequirements
                ? 'Paste or upload requirements first'
                : pendingExtractOnly
                ? 'Click \'Extract Requirements\' first to process your uploaded files'
                : requirementsReviewed
                ? 'Generate all artifacts'
                : 'Check the box to confirm your requirements are ready'
            }
          >
            ⚡ Generate All Artifacts
          </button>
        </div>
      </div>
    </section>
  );
});
