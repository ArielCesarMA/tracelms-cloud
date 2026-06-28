import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type TestCaseItem, type XrayPushPreview, type XrayPushProgress, type XrayPushedIssue } from '../types';
import { useAuth, canPush, canWrite } from '../contexts/AuthContext';
import { CopyButton } from '../components/CopyButton';
import { EmptyState } from '../components/EmptyState';
import { downloadFile, escapeCsvCell } from '../utils';
import { patchGenerationTestCases } from '../api/client';

type Props = {
  testCases: TestCaseItem[];
  xrayPushPreview: XrayPushPreview | null;
  xrayPushProgress: XrayPushProgress | null;
  xrayPushedIssues: XrayPushedIssue[];
  isBusy: boolean;
  feedback: string;
  generationId: string | null;
  onGenerateTestCases: () => void;
  onTestCasesChange: (updated: TestCaseItem[]) => void;
  onPreviewPush: () => void;
  onPushToXray: () => void;
  onRetryFailed: () => void;
  onClearHistory: () => void;
};

// Per-card mutable edit draft (keyed by filteredTestCases index)
type EditDraft = {
  title: string;
  steps: string;        // joined by \n
  expectedResult: string;
  testData: string;
  layer: string;
  priority: string;
};

type Layer = 'Unit' | 'API' | 'UI';
type ViewMode = 'cards' | 'gherkin' | 'table';

const ALL_LAYERS: Layer[] = ['Unit', 'API', 'UI'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const TEST_TYPES = ['Functional', 'Negative', 'Edge', 'Integration'];

const PRIORITY_COLORS: Record<string, string> = {
  Critical: 'scn-badge--critical',
  High:     'scn-badge--high',
  Medium:   'scn-badge--medium',
  Low:      'scn-badge--low',
};

const TYPE_COLORS: Record<string, string> = {
  Functional:  'tc-badge--functional',
  Negative:    'tc-badge--negative',
  Edge:        'tc-badge--edge',
  Integration: 'tc-badge--integration',
};

const GHERKIN_KEYWORD_RE = /^(\s*)(Feature:|Background:|Scenario Outline:|Scenario:|Examples:|Given |When |Then |And |But )(.*)$/;

function GherkinBlock({ text }: { text: string }): JSX.Element {
  const lines = text.split('\n');
  return (
    <div className="gherkin-block tc-gherkin-rendered">
      {lines.map((line, i) => {
        const m = line.match(GHERKIN_KEYWORD_RE);
        if (m) {
          return (
            <div key={i} className="tc-gherkin-line">
              <span>{m[1]}</span>
              <strong className="tc-gherkin-kw">{m[2]}</strong>
              <span>{m[3]}</span>
            </div>
          );
        }
        return <div key={i} className="tc-gherkin-line">{line || ' '}</div>;
      })}
    </div>
  );
}

export const TestCasesTab = memo(function TestCasesTab({
  testCases, xrayPushPreview, xrayPushProgress, xrayPushedIssues,
  isBusy, feedback, generationId,
  onGenerateTestCases, onTestCasesChange,
  onPreviewPush, onPushToXray, onRetryFailed, onClearHistory,
}: Props): JSX.Element {
  const hasFailures = xrayPushedIssues.some((i) => !i.success);
  const { user: authUser } = useAuth();
  const userCanPush = canPush(authUser?.role);
  const userCanWrite = canWrite(authUser?.role);

  const [activeLayers, setActiveLayers] = useState<Set<Layer>>(new Set(ALL_LAYERS));
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [colWidths, setColWidths] = useState({ title: 220, expected: 200 });
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef<{ col: 'title' | 'expected'; startX: number; startW: number } | null>(null);

  // ── Inline editing state ────────────────────────────────────────────────────
  const [editingCards, setEditingCards] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, EditDraft>>({});
  const [dirtyCards, setDirtyCards] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Clear edit state when new test cases are generated
  useEffect(() => {
    setEditingCards(new Set());
    setDrafts({});
    setDirtyCards(new Set());
    setSaveError('');
  }, [testCases]);

  useEffect(() => {
    setActiveLayers(new Set(ALL_LAYERS));
  }, [testCases]);

  const toggleLayer = useCallback((layer: Layer) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) {
        if (next.size > 1) next.delete(layer);
      } else {
        next.add(layer);
      }
      return next;
    });
  }, []);

  const filteredTestCases = useMemo(
    () => testCases.filter((tc) => activeLayers.has(tc.layer)),
    [testCases, activeLayers]
  );

  const summary = useMemo(() => {
    const byLayer: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byType: Record<string, number> = {};
    testCases.forEach(({ layer, priority, testType }) => {
      if (layer) byLayer[layer] = (byLayer[layer] ?? 0) + 1;
      if (priority) byPriority[priority] = (byPriority[priority] ?? 0) + 1;
      if (testType) byType[testType] = (byType[testType] ?? 0) + 1;
    });
    return { byLayer, byPriority, byType };
  }, [testCases]);

  const handleResizeStart = useCallback((e: React.PointerEvent, col: 'title' | 'expected') => {
    e.preventDefault();
    e.stopPropagation();
    const startW = col === 'title' ? colWidths.title : colWidths.expected;
    resizingRef.current = { col, startX: e.clientX, startW };
    setIsResizing(true);
    function onMove(ev: PointerEvent) {
      const r = resizingRef.current;
      if (!r) return;
      setColWidths((prev) => ({ ...prev, [r.col]: Math.max(80, r.startW + (ev.clientX - r.startX)) }));
    }
    function onUp() {
      resizingRef.current = null;
      setIsResizing(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [colWidths]);

  const toggleCard = useCallback((i: number) => {
    setExpandedCards((prev) => ({ ...prev, [i]: !prev[i] }));
  }, []);

  const startEditing = useCallback((i: number, tc: TestCaseItem) => {
    setDrafts((prev) => ({
      ...prev,
      [i]: {
        title: tc.title,
        steps: tc.steps.join('\n'),
        expectedResult: tc.expectedResult,
        testData: tc.testData ?? '',
        layer: tc.layer,
        priority: tc.priority,
      },
    }));
    setEditingCards((prev) => { const s = new Set(prev); s.add(i); return s; });
    setExpandedCards((prev) => ({ ...prev, [i]: true }));
  }, []);

  const cancelEditing = useCallback((i: number) => {
    setEditingCards((prev) => { const s = new Set(prev); s.delete(i); return s; });
    setDirtyCards((prev) => { const s = new Set(prev); s.delete(i); return s; });
    setDrafts((prev) => { const d = { ...prev }; delete d[i]; return d; });
  }, []);

  const updateDraft = useCallback((i: number, field: keyof EditDraft, value: string) => {
    setDrafts((prev) => ({ ...prev, [i]: { ...prev[i], [field]: value } }));
    setDirtyCards((prev) => { const s = new Set(prev); s.add(i); return s; });
  }, []);

  const doneEditing = useCallback((i: number) => {
    setEditingCards((prev) => { const s = new Set(prev); s.delete(i); return s; });
    // Keep draft + dirty state so save bar remains visible
  }, []);

  const handleSaveEdits = useCallback(async () => {
    if (dirtyCards.size === 0) return;
    setIsSaving(true);
    setSaveError('');
    try {
      // Merge all dirty drafts back into the test cases array
      const updated = testCases.map((tc, i) => {
        const draft = drafts[i];
        if (!draft || !dirtyCards.has(i)) return tc;
        return {
          ...tc,
          title: draft.title.trim() || tc.title,
          steps: draft.steps.split('\n').map((s) => s.trim()).filter(Boolean),
          expectedResult: draft.expectedResult.trim() || tc.expectedResult,
          testData: draft.testData.trim(),
          layer: draft.layer as TestCaseItem['layer'],
          priority: draft.priority as TestCaseItem['priority'],
        };
      });
      onTestCasesChange(updated);
      if (generationId) {
        await patchGenerationTestCases(generationId, updated);
      }
      setDirtyCards(new Set());
      setEditingCards(new Set());
      setDrafts({});
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed. Edits kept locally.');
    } finally {
      setIsSaving(false);
    }
  }, [testCases, drafts, dirtyCards, generationId, onTestCasesChange]);

  const exportGherkin = useCallback((): void => {
    downloadFile(
      'tracelm-test-cases.feature',
      filteredTestCases.map((tc) => tc.gherkin).join('\n\n'),
      'text/plain;charset=utf-8'
    );
  }, [filteredTestCases]);

  const exportCsv = useCallback((): void => {
    const header = ['ID', 'Title', 'ScenarioID', 'RequirementRefs', 'Layer', 'Priority', 'Preconditions', 'Detailed Steps', 'ExpectedResult', 'Test Data'];
    const lines = filteredTestCases.map((tc) => [
      tc.id, tc.title, tc.scenarioId, tc.requirementRefs.join(' | '),
      tc.layer, tc.priority, tc.preconditions.join(' | '),
      tc.steps.join(' | '), tc.expectedResult, tc.testData,
    ]);
    const csv = [header, ...lines].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
    downloadFile('tracelm-test-cases.csv', csv, 'text/csv;charset=utf-8');
  }, [filteredTestCases]);

  return (
    <section className="panel">
      <h2>Test Cases</h2>
      <p className="helper-text">Generate test cases from scenarios with Gherkin and structured table output.</p>

      <div className="button-row">
        <button type="button" onClick={onGenerateTestCases} disabled={isBusy}>Generate Test Cases</button>
        <button type="button" data-variant="secondary" onClick={exportGherkin} disabled={!filteredTestCases.length}>Export .feature</button>
        <button type="button" data-variant="secondary" onClick={exportCsv} disabled={!filteredTestCases.length}>Export CSV</button>
        <button type="button" data-variant="secondary" onClick={onPreviewPush} disabled={isBusy || !testCases.length || !userCanPush} title={!userCanPush ? 'Requires Editor or above' : undefined}>Preview Push</button>
        <button type="button" onClick={onPushToXray} disabled={isBusy || !testCases.length || !userCanPush} title={!userCanPush ? 'Requires Editor or above' : undefined}>Push to Xray</button>
      </div>

      {!testCases.length ? (
        <EmptyState
          icon="🧪"
          title="No Test Cases Yet"
          action="Click Generate Test Cases above to start."
          tip="Tip: Generate Test Scenarios first — test cases are built from scenarios."
        />
      ) : (
        <>
          {/* Stat strip */}
          <div className="scn-stat-strip">
            <span className="scn-stat-total">{testCases.length} test cases</span>
            <span className="scn-stat-sep" />
            {ALL_LAYERS.map((layer) => summary.byLayer[layer] ? (
              <span key={layer} className={`layer-chip layer-chip--${layer} layer-chip--active`}>
                {layer} <strong>{summary.byLayer[layer]}</strong>
              </span>
            ) : null)}
            <span className="scn-stat-sep" />
            {TEST_TYPES.map((t) => summary.byType[t] ? (
              <span key={t} className={`scn-badge ${TYPE_COLORS[t] ?? ''}`}>
                {t} <strong>{summary.byType[t]}</strong>
              </span>
            ) : null)}
            <span className="scn-stat-sep" />
            {PRIORITIES.map((p) => summary.byPriority[p] ? (
              <span key={p} className={`scn-badge ${PRIORITY_COLORS[p] ?? ''}`}>
                {p} <strong>{summary.byPriority[p]}</strong>
              </span>
            ) : null)}
          </div>

          {/* Filter + view toggle row */}
          <div className="scn-filter-row">
            <span className="layer-filter-label">Layer:</span>
            {ALL_LAYERS.map((layer) => {
              const count = testCases.filter((tc) => tc.layer === layer).length;
              const isEmpty = count === 0;
              const isActive = activeLayers.has(layer);
              return (
                <button
                  key={layer}
                  type="button"
                  className={`layer-chip layer-chip--${layer}${isActive && !isEmpty ? ' layer-chip--active' : ''}${isEmpty ? ' layer-chip--empty' : ''}`}
                  onClick={() => !isEmpty && toggleLayer(layer)}
                  disabled={isEmpty}
                  aria-pressed={isActive && !isEmpty}
                  title={isEmpty ? `No ${layer} test cases` : `${count} ${layer} — click to toggle`}
                >
                  {layer} <span className="layer-chip-count">{count}</span>
                </button>
              );
            })}
            {filteredTestCases.length !== testCases.length && (
              <span className="scn-filter-count">{filteredTestCases.length} of {testCases.length} shown</span>
            )}
            <div className="scn-view-toggle">
              <span className="scn-view-label">View:</span>
              <button
                type="button"
                className={`scn-view-btn${viewMode === 'cards' ? ' active' : ''}`}
                onClick={() => setViewMode('cards')}
              >
                <i className="ti ti-layout-grid" />
                Cards
              </button>
              <button
                type="button"
                className={`scn-view-btn${viewMode === 'gherkin' ? ' active' : ''}`}
                onClick={() => setViewMode('gherkin')}
              >
                <i className="ti ti-code" />
                Gherkin
              </button>
              <button
                type="button"
                className={`scn-view-btn${viewMode === 'table' ? ' active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                <i className="ti ti-table" />
                Table
              </button>
            </div>
          </div>

          {/* CARDS VIEW */}
          {viewMode === 'cards' && (
            <>
              <div className="tc-card-list">
                {filteredTestCases.map((tc, i) => {
                  const isExpanded = !!expandedCards[i];
                  const isEditing = editingCards.has(i);
                  const isDirty = dirtyCards.has(i);
                  const draft = drafts[i];
                  return (
                    <article key={tc.id} className={`tc-card${isDirty ? ' tc-card--dirty' : ''}`}>
                      <div
                        className="tc-card-header"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => !isEditing && toggleCard(i)}
                        onKeyDown={(e) => !isEditing && (e.key === 'Enter' || e.key === ' ') && toggleCard(i)}
                      >
                        <span className="scn-table-num">#{i + 1}</span>
                        <span className="tc-card-id">{tc.id}</span>
                        <span className="tc-card-title">
                          {isDirty && draft ? draft.title : tc.title}
                        </span>
                        {tc.testType && (
                          <span className={`scn-badge ${TYPE_COLORS[tc.testType] ?? ''}`}>{tc.testType}</span>
                        )}
                        <span className={`scn-badge ${PRIORITY_COLORS[isDirty && draft ? draft.priority : tc.priority] ?? ''}`}>
                          {isDirty && draft ? draft.priority : tc.priority}
                        </span>
                        <span className={`layer-chip layer-chip--${isDirty && draft ? draft.layer : tc.layer} layer-chip--active tc-card-layer`}>
                          {isDirty && draft ? draft.layer : tc.layer}
                        </span>
                        {isDirty && <span className="tc-dirty-chip">Edited</span>}
                        {userCanWrite && !isEditing && (
                          <button
                            type="button"
                            className="tc-edit-btn"
                            aria-label="Edit this test case"
                            onClick={(e) => { e.stopPropagation(); startEditing(i, tc); }}
                            title="Edit"
                          >
                            <i className="ti ti-pencil" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {isExpanded && !isEditing && (
                        <div className="tc-card-body">
                          {tc.preconditions.length > 0 && (
                            <div className="scn-detail-block">
                              <div className="scn-detail-label">Preconditions</div>
                              <ul className="scn-detail-list">{tc.preconditions.map((p, pi) => <li key={pi}>{p}</li>)}</ul>
                            </div>
                          )}
                          {tc.steps.length > 0 && (
                            <div className="scn-detail-block">
                              <div className="scn-detail-label">Steps</div>
                              <ol className="scn-detail-list">{tc.steps.map((s, si) => <li key={si}>{s}</li>)}</ol>
                            </div>
                          )}
                          {tc.expectedResult && (
                            <div className="scn-detail-block">
                              <div className="scn-detail-label">Expected Result</div>
                              <p className="scn-detail-text">{tc.expectedResult}</p>
                            </div>
                          )}
                          {tc.testData && (
                            <div className="scn-detail-block">
                              <div className="scn-detail-label">Test Data</div>
                              <p className="scn-detail-text">{tc.testData}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {isEditing && draft && (
                        <div className="tc-card-edit-body">
                          <div className="tc-edit-row">
                            <label className="tc-edit-label">Title</label>
                            <input
                              className="tc-edit-input"
                              value={draft.title}
                              onChange={(e) => updateDraft(i, 'title', e.target.value)}
                            />
                          </div>
                          <div className="tc-edit-row tc-edit-row--selects">
                            <div>
                              <label className="tc-edit-label">Layer</label>
                              <select
                                className="tc-edit-select"
                                value={draft.layer}
                                onChange={(e) => updateDraft(i, 'layer', e.target.value)}
                              >
                                {ALL_LAYERS.map((l) => <option key={l} value={l}>{l}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="tc-edit-label">Priority</label>
                              <select
                                className="tc-edit-select"
                                value={draft.priority}
                                onChange={(e) => updateDraft(i, 'priority', e.target.value)}
                              >
                                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="tc-edit-row">
                            <label className="tc-edit-label">Steps <span className="tc-edit-hint">(one per line)</span></label>
                            <textarea
                              className="tc-edit-textarea"
                              rows={5}
                              value={draft.steps}
                              onChange={(e) => updateDraft(i, 'steps', e.target.value)}
                            />
                          </div>
                          <div className="tc-edit-row">
                            <label className="tc-edit-label">Expected Result</label>
                            <textarea
                              className="tc-edit-textarea"
                              rows={3}
                              value={draft.expectedResult}
                              onChange={(e) => updateDraft(i, 'expectedResult', e.target.value)}
                            />
                          </div>
                          <div className="tc-edit-row">
                            <label className="tc-edit-label">Test Data</label>
                            <textarea
                              className="tc-edit-textarea"
                              rows={2}
                              value={draft.testData}
                              onChange={(e) => updateDraft(i, 'testData', e.target.value)}
                            />
                          </div>
                          <div className="tc-edit-actions">
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => cancelEditing(i)}
                            >
                              Discard
                            </button>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => doneEditing(i)}
                            >
                              <i className="ti ti-check" aria-hidden="true" /> Done
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              {/* Sticky save bar */}
              {dirtyCards.size > 0 && (
                <div className="tc-save-bar" role="status">
                  <span className="tc-save-bar-msg">
                    <i className="ti ti-pencil" aria-hidden="true" />
                    {dirtyCards.size} test case{dirtyCards.size !== 1 ? 's' : ''} edited
                    {!generationId && ' · edits are local only (no generation saved)'}
                  </span>
                  {saveError && <span className="tc-save-bar-error">{saveError}</span>}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveEdits()}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving…' : `Save Edits (${dirtyCards.size})`}
                  </button>
                </div>
              )}
            </>
          )}

          {/* GHERKIN VIEW */}
          {viewMode === 'gherkin' && (
            <div className="tc-gherkin-view">
              {filteredTestCases.map((tc) => (
                <div key={tc.id} className="tc-gherkin-item">
                  <div className="tc-gherkin-item-header">
                    <div className="tc-gherkin-item-title">
                      <span className="tc-gherkin-item-id">{tc.id}</span>
                      <span className="tc-gherkin-item-name">{tc.title}</span>
                    </div>
                    <div className="tc-gherkin-item-badges">
                      {tc.testType && (
                        <span className={`scn-badge ${TYPE_COLORS[tc.testType] ?? ''}`}>{tc.testType}</span>
                      )}
                      <span className={`scn-badge ${PRIORITY_COLORS[tc.priority] ?? ''}`}>{tc.priority}</span>
                      <span className={`layer-chip layer-chip--${tc.layer} layer-chip--active tc-card-layer`}>{tc.layer}</span>
                      <CopyButton text={tc.gherkin} title="Copy Gherkin" />
                    </div>
                  </div>
                  <GherkinBlock text={tc.gherkin} />
                </div>
              ))}
            </div>
          )}

          {/* TABLE VIEW */}
          {viewMode === 'table' && (
            <div className={`scn-table-wrap${isResizing ? ' scn-table-wrap--resizing' : ''}`}>
              <table className="scn-table">
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: colWidths.title }} />
                  <col style={{ width: colWidths.expected }} />
                  <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Layer</th>
                    <th className="scn-th-resizable">
                      Title
                      <span className="scn-col-resize" onPointerDown={(e) => handleResizeStart(e, 'title')} />
                    </th>
                    <th className="scn-th-resizable">
                      Expected Result
                      <span className="scn-col-resize" onPointerDown={(e) => handleResizeStart(e, 'expected')} />
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredTestCases.map((tc, i) => {
                    const isExpanded = expandedRow === i;
                    return (
                      <>
                        <tr
                          key={tc.id}
                          className={`scn-table-row${isExpanded ? ' scn-table-row--expanded' : ''}`}
                          onClick={() => setExpandedRow(isExpanded ? null : i)}
                          title="Click to expand details"
                        >
                          <td className="scn-table-num">{i + 1}</td>
                          <td className="scn-table-id">{tc.id}</td>
                          <td>
                            {tc.testType && (
                              <span className={`scn-badge ${TYPE_COLORS[tc.testType] ?? ''}`}>{tc.testType}</span>
                            )}
                          </td>
                          <td>
                            <span className={`scn-badge ${PRIORITY_COLORS[tc.priority] ?? ''}`}>{tc.priority}</span>
                          </td>
                          <td>
                            <span className={`layer-chip layer-chip--${tc.layer} layer-chip--active tc-layer-sm`}>{tc.layer}</span>
                          </td>
                          <td className="scn-table-title">{tc.title}</td>
                          <td className="scn-table-refs">{tc.expectedResult || <span className="scn-table-empty">—</span>}</td>
                          <td className="scn-table-actions" onClick={(e) => e.stopPropagation()}>
                            <CopyButton text={tc.gherkin} title="Copy Gherkin" />
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${tc.id}-detail`} className="scn-table-detail">
                            <td colSpan={8}>
                              <div className="scn-detail-grid tc-detail-grid">
                                {tc.preconditions.length > 0 && (
                                  <div className="scn-detail-block">
                                    <div className="scn-detail-label">Preconditions</div>
                                    <ul className="scn-detail-list">{tc.preconditions.map((p, pi) => <li key={pi}>{p}</li>)}</ul>
                                  </div>
                                )}
                                {tc.steps.length > 0 && (
                                  <div className="scn-detail-block">
                                    <div className="scn-detail-label">Steps</div>
                                    <ol className="scn-detail-list">{tc.steps.map((s, si) => <li key={si}>{s}</li>)}</ol>
                                  </div>
                                )}
                                {tc.testData && (
                                  <div className="scn-detail-block">
                                    <div className="scn-detail-label">Test Data</div>
                                    <p className="scn-detail-text">{tc.testData}</p>
                                  </div>
                                )}
                                {tc.gherkin && (
                                  <div className="scn-detail-block scn-detail-block--full">
                                    <div className="scn-detail-label">Gherkin</div>
                                    <div className="tc-gherkin-wrap">
                                      <GherkinBlock text={tc.gherkin} />
                                      <CopyButton text={tc.gherkin} title="Copy Gherkin" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!!xrayPushPreview && (
        <article className="enh-card">
          <h3>Xray Push Preview</h3>
          <p>
            <strong>Summary:</strong>{' '}
            {xrayPushPreview.willPush} to push &nbsp;·&nbsp;
            {xrayPushPreview.duplicates} duplicates &nbsp;·&nbsp;
            {xrayPushPreview.validationErrors} validation errors
            &nbsp;(of {xrayPushPreview.totalCases} total)
          </p>
          <ul className="preview-list">
            {xrayPushPreview.details.map((detail) => {
              const statusMap = {
                valid: { cls: 'preview-item--valid', badge: '✓ Ready' },
                duplicate: { cls: 'preview-item--duplicate', badge: '⊘ Duplicate' },
                'validation-error': { cls: 'preview-item--error', badge: '✗ Error' },
              } as const;
              const { cls, badge } = statusMap[detail.status] ?? statusMap['validation-error'];
              return (
                <li key={detail.id} className={`preview-item ${cls}`}>
                  <span className="preview-item-badge">{badge}</span>
                  <div className="preview-item-body">
                    <span className="preview-item-id">{detail.id}</span>
                    <div className="preview-item-title">{detail.title}</div>
                    {detail.message && <div className="preview-item-hint">{detail.message}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </article>
      )}

      {/* Push progress — shown during active push */}
      {!!xrayPushProgress && (
        <div className="xray-progress-bar">
          <span className="xray-progress-label">
            Batch {xrayPushProgress.batchIndex} of {xrayPushProgress.totalBatches}
            {xrayPushProgress.status === 'retrying' && ' · retrying…'}
          </span>
          <div className="xray-progress-track">
            <div
              className="xray-progress-fill"
              style={{ width: `${Math.round((xrayPushProgress.batchIndex / xrayPushProgress.totalBatches) * 100)}%` }}
            />
          </div>
          <span className="xray-progress-msg">{xrayPushProgress.message}</span>
        </div>
      )}

      {/* Push results panel — appears after push, replaces old issues list */}
      {!!xrayPushedIssues.length && (
        <div className="xray-results">
          <div className="xray-results__header">
            <span className="xray-results__title">Xray Push Results</span>
            <span className="xray-results__summary">
              {xrayPushedIssues.filter((i) => i.success && i.errorClass !== 'duplicate').length} pushed
              {xrayPushedIssues.filter((i) => i.errorClass === 'duplicate').length > 0 && (
                <> · {xrayPushedIssues.filter((i) => i.errorClass === 'duplicate').length} skipped (duplicate)</>
              )}
              {hasFailures && (
                <> · <span className="xray-results__fail-count">{xrayPushedIssues.filter((i) => !i.success).length} failed</span></>
              )}
            </span>
            {userCanWrite && (
              <button
                type="button"
                className="xray-results__clear"
                onClick={onClearHistory}
                disabled={isBusy}
                title="Clear push history"
              >
                <i className="ti ti-trash" /> Clear
              </button>
            )}
          </div>

          <ul className="xray-results__list">
            {xrayPushedIssues.map((issue) => {
              const isDuplicate = issue.errorClass === 'duplicate';
              const isFail = !issue.success;
              return (
                <li key={issue.localId} className={`xray-result-item${isFail ? ' xray-result-item--fail' : isDuplicate ? ' xray-result-item--dup' : ' xray-result-item--ok'}`}>
                  <span className="xray-result-icon" aria-hidden>
                    {isFail ? '✗' : isDuplicate ? '⊘' : '✓'}
                  </span>
                  <span className="xray-result-id">{issue.localId}</span>
                  {issue.success && issue.key && issue.url ? (
                    <a className="xray-result-key" href={issue.url} target="_blank" rel="noreferrer">{issue.key}</a>
                  ) : isDuplicate ? (
                    <span className="xray-result-dup-label">Already in Xray</span>
                  ) : null}
                  {isFail && issue.message && (
                    <div className="xray-result-error">
                      <span className="xray-result-error-msg">{issue.message}</span>
                      {issue.fixPath && (
                        <span className="xray-result-fix">Fix: {issue.fixPath}</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Failure banner — only when permanent failures exist */}
          {hasFailures && userCanPush && (
            <div className="xray-results__failure-banner">
              <div className="xray-results__failure-text">
                <span className="xray-results__failure-icon">⚠</span>
                <span>
                  <strong>{xrayPushedIssues.filter((i) => !i.success).length} test case{xrayPushedIssues.filter((i) => !i.success).length !== 1 ? 's' : ''} failed to push.</strong>
                  {' '}Fix the issue shown above, then retry.
                </span>
              </div>
              <button
                type="button"
                className="xray-results__retry-btn"
                onClick={onRetryFailed}
                disabled={isBusy}
              >
                Retry Failed ({xrayPushedIssues.filter((i) => !i.success).length})
              </button>
            </div>
          )}
        </div>
      )}

      <p className="feedback">{feedback}</p>
    </section>
  );
});
