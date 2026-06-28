import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPrompts, updatePrompt, resetPrompt } from '../api/client';
import type { PromptTemplate, PromptStep } from '../types';

const STEP_LABELS: Record<PromptStep, string> = {
  ENHANCEMENT: 'Enhancement',
  SCENARIOS:   'Scenarios',
  TEST_CASES:  'Test Cases',
  AUTOMATION:  'Automation',
};

const STEP_ICONS: Record<PromptStep, string> = {
  ENHANCEMENT: 'ti-sparkles',
  SCENARIOS:   'ti-sitemap',
  TEST_CASES:  'ti-checklist',
  AUTOMATION:  'ti-robot',
};

const STEP_ORDER: PromptStep[] = ['ENHANCEMENT', 'SCENARIOS', 'TEST_CASES', 'AUTOMATION'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PromptsTab({ activeProjectId, activeProjectName }: {
  activeProjectId?: string | null;
  activeProjectName?: string | null;
}): JSX.Element {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [savedStep, setSavedStep] = useState<PromptStep | null>(null);

  const [resetConfirm, setResetConfirm] = useState<PromptTemplate | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { templates: tpls } = await fetchPrompts(activeProjectId);
      setTemplates(tpls);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load prompt templates.');
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (editingTemplate) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [editingTemplate]);

  // Per-step: pick project override first, then global active
  const getEffective = (step: PromptStep): { tpl: PromptTemplate | undefined; isProjectOverride: boolean } => {
    const all = templates.filter((t) => t.step === step);
    if (activeProjectId) {
      const override = all.find((t) => t.projectId === activeProjectId && t.isActive);
      if (override) return { tpl: override, isProjectOverride: true };
    }
    const global = all.find((t) => !t.projectId && t.isActive) ?? all.find((t) => !t.projectId);
    return { tpl: global, isProjectOverride: false };
  };

  const openEditor = (template: PromptTemplate): void => {
    setEditingTemplate(template);
    setEditorContent(template.content);
    setEditorError('');
  };

  const closeEditor = (): void => {
    setEditingTemplate(null);
    setEditorContent('');
    setEditorError('');
  };

  const handleSave = async (): Promise<void> => {
    if (!editingTemplate) return;
    setEditorBusy(true);
    setEditorError('');
    try {
      // If saving in project context and the template being edited is global → create project override
      const saveProjectId = activeProjectId && !editingTemplate.projectId ? activeProjectId : editingTemplate.projectId ?? undefined;
      const { template: updated } = await updatePrompt(editingTemplate.id, editorContent, saveProjectId ?? null);
      setTemplates((prev) => {
        // Remove old templates for this step+scope, add updated
        return [
          ...prev.filter((t) => {
            if (t.step !== updated.step) return true;
            if (updated.projectId) return t.projectId !== updated.projectId;
            return !!t.projectId; // keep project-scoped ones, remove global
          }),
          updated,
        ];
      });
      setSavedStep(updated.step);
      setTimeout(() => setSavedStep(null), 3000);
      closeEditor();
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setEditorBusy(false);
    }
  };

  const handleReset = async (template: PromptTemplate): Promise<void> => {
    setEditorBusy(true);
    setEditorError('');
    setResetConfirm(null);
    try {
      const { template: restored } = await resetPrompt(template.id);
      if (template.projectId) {
        // Remove the project override from state; restored is the global active
        setTemplates((prev) => [
          ...prev.filter((t) => t.id !== template.id),
        ]);
      } else {
        setTemplates((prev) => {
          const filtered = prev.filter((t) => t.step !== template.step || !!t.projectId);
          return restored ? [...filtered, restored] : filtered;
        });
      }
      setSavedStep(template.step);
      setTimeout(() => setSavedStep(null), 3000);
      if (editingTemplate?.id === template.id) closeEditor();
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : 'Reset failed.');
    } finally {
      setEditorBusy(false);
    }
  };

  return (
    <div className="tab-content prompts-tab">
      <div className="tab-header">
        <h2 className="tab-title">Prompt Management</h2>
        <p className="tab-subtitle">
          Edit the system prompts used by each generation step. Changes take effect immediately — no restart required.
        </p>
      </div>

      {activeProjectId && activeProjectName && (
        <div className="prompt-project-context">
          <i className="ti ti-folder-filled" aria-hidden="true" />
          <span>Project context: <strong>{activeProjectName}</strong> — edits create project-specific overrides.</span>
        </div>
      )}

      {loading && <p className="prompts-loading">Loading templates…</p>}
      {error && <p className="prompts-error">{error}</p>}

      {!loading && !error && (
        <div className="prompts-grid">
          {STEP_ORDER.map((step) => {
            const { tpl, isProjectOverride } = getEffective(step);
            if (!tpl) return null;
            const isCustom = !tpl.isDefault && !tpl.projectId;
            const isSaved = savedStep === step;
            return (
              <div key={step} className={`prompt-card${isProjectOverride ? ' prompt-card--project' : isCustom ? ' prompt-card--custom' : ''}`}>
                <div className="prompt-card-header">
                  <span className={`prompt-step-badge prompt-step-badge--${step.toLowerCase().replace('_', '-')}`}>
                    <i className={`ti ${STEP_ICONS[step]}`} aria-hidden="true" />
                    {STEP_LABELS[step]}
                  </span>
                  {isProjectOverride && <span className="prompt-project-chip"><i className="ti ti-folder" /> Project Override</span>}
                  {isCustom && <span className="prompt-custom-chip">Custom</span>}
                  {isSaved && <span className="prompt-saved-chip"><i className="ti ti-circle-check" /> Saved</span>}
                </div>

                <p className="prompt-card-name">{tpl.name}</p>

                <div className="prompt-card-meta">
                  <span>{tpl.content.length.toLocaleString()} chars</span>
                  <span>·</span>
                  <span>Modified {formatDate(tpl.updatedAt)}</span>
                </div>

                <div className="prompt-card-preview">{tpl.content.slice(0, 160)}…</div>

                <div className="prompt-card-actions">
                  <button type="button" className="btn-primary" onClick={() => openEditor(tpl)}>
                    <i className="ti ti-pencil" aria-hidden="true" />
                    {activeProjectId && !isProjectOverride ? 'Create Override' : 'Edit'}
                  </button>
                  {isProjectOverride && (
                    <button
                      type="button"
                      className="btn-ghost btn-danger-ghost"
                      onClick={() => setResetConfirm(tpl)}
                    >
                      <i className="ti ti-trash" aria-hidden="true" /> Remove Override
                    </button>
                  )}
                  {isCustom && (
                    <button
                      type="button"
                      className="btn-ghost btn-danger-ghost"
                      onClick={() => setResetConfirm(tpl)}
                    >
                      <i className="ti ti-refresh" aria-hidden="true" /> Reset to Default
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Editor modal ───────────────────────────────────────────────────── */}
      {editingTemplate && (
        <div className="proj-modal-overlay" role="dialog" aria-modal="true" aria-label="Edit prompt">
          <div className="prompt-editor-modal">
            <div className="prompt-editor-header">
              <h3>
                <i className={`ti ${STEP_ICONS[editingTemplate.step]}`} aria-hidden="true" />
                {STEP_LABELS[editingTemplate.step]} Prompt
                {activeProjectId && !editingTemplate.projectId && (
                  <span className="prompt-editor-scope"> — Project Override</span>
                )}
              </h3>
              <button
                type="button"
                className="btn-ghost prompt-editor-close"
                onClick={closeEditor}
                disabled={editorBusy}
                aria-label="Close editor"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>

            <textarea
              ref={textareaRef}
              className="prompt-editor-area"
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              spellCheck={false}
              disabled={editorBusy}
              aria-label="Prompt content"
            />

            {editorError && <p className="prompt-editor-error">{editorError}</p>}

            <div className="prompt-editor-footer">
              <span className="prompt-char-count">{editorContent.length.toLocaleString()} chars</span>
              <div className="button-row">
                <button type="button" onClick={closeEditor} disabled={editorBusy}>
                  Cancel
                </button>
                {editingTemplate.projectId && (
                  <button
                    type="button"
                    className="btn-ghost btn-danger-ghost"
                    disabled={editorBusy}
                    onClick={() => setResetConfirm(editingTemplate)}
                  >
                    Remove Override
                  </button>
                )}
                {!editingTemplate.isDefault && !editingTemplate.projectId && (
                  <button
                    type="button"
                    className="btn-ghost btn-danger-ghost"
                    disabled={editorBusy}
                    onClick={() => setResetConfirm(editingTemplate)}
                  >
                    Reset to Default
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  disabled={editorBusy || !editorContent.trim()}
                  onClick={() => void handleSave()}
                >
                  {editorBusy ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset / Remove confirm dialog ─────────────────────────────────── */}
      {resetConfirm && (
        <div className="proj-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm action">
          <div className="proj-modal">
            <h3>{resetConfirm.projectId ? 'Remove Project Override?' : 'Reset to Default?'}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              {resetConfirm.projectId
                ? <>This will remove your <strong>{STEP_LABELS[resetConfirm.step]}</strong> project override. The global prompt will take effect for this project.</>
                : <>This will replace your custom <strong>{STEP_LABELS[resetConfirm.step]}</strong> prompt with the original seed content. This action cannot be undone.</>
              }
            </p>
            <div className="button-row">
              <button type="button" onClick={() => setResetConfirm(null)} disabled={editorBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={editorBusy}
                onClick={() => void handleReset(resetConfirm)}
              >
                {editorBusy
                  ? (resetConfirm.projectId ? 'Removing…' : 'Resetting…')
                  : (resetConfirm.projectId ? 'Remove Override' : 'Reset Prompt')
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
