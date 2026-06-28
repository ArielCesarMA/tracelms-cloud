import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { type ScenarioItem, type ScenarioType, type ScenarioPriority } from '../types';
import { downloadFile, escapeCsvCell } from '../utils';
import { CopyButton } from '../components/CopyButton';
import { EmptyState } from '../components/EmptyState';

type Props = {
  scenarios: ScenarioItem[];
  isBusy: boolean;
  feedback: string;
  generatedAt?: Date | null;
  onGenerate: () => void;
  onUpdateField: (index: number, key: keyof ScenarioItem, value: string) => void;
  onAddScenario: () => void;
  onDeleteScenario: (index: number) => void;
};

const SCENARIO_TYPES: { value: ScenarioType; label: string; title: string }[] = [
  { value: 'HP', label: 'HP', title: 'Happy Path' },
  { value: 'AF', label: 'AF', title: 'Alternate Flow' },
  { value: 'EC', label: 'EC', title: 'Edge Case' },
  { value: 'EG', label: 'EG', title: 'Error/Exception' },
  { value: 'BR', label: 'BR', title: 'Business Rule' },
];

const PRIORITIES: ScenarioPriority[] = ['Critical', 'High', 'Medium', 'Low'];

const TYPE_COLORS: Record<ScenarioType, string> = {
  HP: 'scn-badge--hp',
  AF: 'scn-badge--af',
  EC: 'scn-badge--ec',
  EG: 'scn-badge--eg',
  BR: 'scn-badge--br',
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: 'scn-badge--critical',
  High:     'scn-badge--high',
  Medium:   'scn-badge--medium',
  Low:      'scn-badge--low',
};

export const ScenariosTab = memo(function ScenariosTab({
  scenarios, isBusy, feedback, generatedAt,
  onGenerate, onUpdateField, onAddScenario, onDeleteScenario,
}: Props): JSX.Element {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [filterType, setFilterType] = useState<ScenarioType | 'All'>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'priority' | 'type' | 'insertion'>('priority');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [colWidths, setColWidths] = useState<{ title: number; refs: number }>({ title: 240, refs: 200 });
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef<{ col: 'title' | 'refs'; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((e: React.PointerEvent, col: 'title' | 'refs') => {
    e.preventDefault();
    e.stopPropagation();
    const startW = resizingRef.current?.col === col
      ? resizingRef.current.startW
      : col === 'title' ? colWidths.title : colWidths.refs;
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

  const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const TYPE_ORDER: Record<string, number> = { HP: 0, AF: 1, EC: 2, EG: 3, BR: 4 };

  const hasScenarios = scenarios.length > 0;

  const handleGenerate = useCallback(() => {
    if (hasScenarios && !window.confirm('Regenerating will replace all current scenarios. Continue?')) return;
    onGenerate();
  }, [hasScenarios, onGenerate]);

  const toggleCollapse = useCallback((index: number) => {
    setCollapsed((prev) => ({ ...prev, [index]: !prev[index] }));
  }, []);

  const collapseAll = useCallback(() => {
    const all: Record<number, boolean> = {};
    scenarios.forEach((_, i) => { all[i] = true; });
    setCollapsed(all);
  }, [scenarios]);

  const expandAll = useCallback(() => setCollapsed({}), []);

  const allCollapsed = scenarios.length > 0 && scenarios.every((_, i) => !!collapsed[i]);

  const summary = useMemo(() => {
    const byType: Partial<Record<ScenarioType, number>> = {};
    const byPriority: Record<string, number> = {};
    scenarios.forEach(({ type, priority }) => {
      if (type) byType[type] = (byType[type] ?? 0) + 1;
      if (priority) byPriority[priority] = (byPriority[priority] ?? 0) + 1;
    });
    return { byType, byPriority };
  }, [scenarios]);

  const filtered = useMemo(() => {
    const base = scenarios
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => {
        if (filterType !== 'All' && s.type !== filterType) return false;
        if (filterPriority !== 'All' && s.priority !== filterPriority) return false;
        return true;
      });

    if (sortBy === 'insertion') return base;

    return [...base].sort((a, b) => {
      if (sortBy === 'priority') {
        const pd = (PRIORITY_ORDER[a.s.priority] ?? 99) - (PRIORITY_ORDER[b.s.priority] ?? 99);
        if (pd !== 0) return pd;
        return (TYPE_ORDER[a.s.type ?? ''] ?? 99) - (TYPE_ORDER[b.s.type ?? ''] ?? 99);
      }
      const td = (TYPE_ORDER[a.s.type ?? ''] ?? 99) - (TYPE_ORDER[b.s.type ?? ''] ?? 99);
      if (td !== 0) return td;
      return (PRIORITY_ORDER[a.s.priority] ?? 99) - (PRIORITY_ORDER[b.s.priority] ?? 99);
    });
  }, [scenarios, filterType, filterPriority, sortBy]);

  function exportJson(): void {
    downloadFile('tracelm-scenarios.json', JSON.stringify(scenarios, null, 2), 'application/json;charset=utf-8');
  }

  function exportCsv(): void {
    const header = ['ID', 'Title', 'Type', 'Priority', 'RequirementRefs', 'Preconditions', 'Flow', 'ExpectedOutcome'];
    const lines = scenarios.map((s) => [
      s.id, s.title, s.type ?? '', s.priority,
      s.requirementRefs.join(' | '), s.preconditions.join(' | '),
      s.flow.join(' | '), s.expectedOutcome,
    ]);
    const csv = [header, ...lines].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
    downloadFile('tracelm-scenarios.csv', csv, 'text/csv;charset=utf-8');
  }

  return (
    <section className="panel">
      <h2>Test Scenarios</h2>
      <p className="helper-text">Generate and refine scenarios from requirements and enhancement output.</p>

      <div className="button-row">
        <button type="button" onClick={handleGenerate} disabled={isBusy}>Generate Scenarios</button>
        <button type="button" data-variant="secondary" onClick={onAddScenario} disabled={isBusy}>+ Add Scenario</button>
        <button type="button" data-variant="secondary" onClick={exportJson} disabled={!hasScenarios}>Export JSON</button>
        <button type="button" data-variant="secondary" onClick={exportCsv} disabled={!hasScenarios}>Export CSV</button>
        {hasScenarios && (
          <button type="button" data-variant="ghost" onClick={allCollapsed ? expandAll : collapseAll}>
            {allCollapsed ? 'Expand All' : 'Collapse All'}
          </button>
        )}
      </div>

      {!hasScenarios ? (
        <EmptyState
          icon="📋"
          title="No Test Scenarios Yet"
          action="Click Generate Scenarios above to start."
          tip="Tip: Running Requirement Enhancement first improves scenario quality."
        />
      ) : (
        <>
          {/* Compact horizontal stat strip */}
          <div className="scn-stat-strip">
            <span className="scn-stat-total">{scenarios.length} scenarios</span>
            <span className="scn-stat-sep" />
            {SCENARIO_TYPES.map(({ value, title }) =>
              summary.byType[value] ? (
                <span key={value} className={`scn-badge ${TYPE_COLORS[value]}`} title={title}>
                  {value} <strong>{summary.byType[value]}</strong>
                </span>
              ) : null
            )}
            <span className="scn-stat-sep" />
            {PRIORITIES.map((p) =>
              summary.byPriority[p] ? (
                <span key={p} className={`scn-badge ${PRIORITY_COLORS[p]}`}>
                  {p} <strong>{summary.byPriority[p]}</strong>
                </span>
              ) : null
            )}
            {generatedAt && (
              <span className="scn-stat-ts">· {generatedAt.toLocaleString()}</span>
            )}
          </div>

          <div className="scn-filter-row">
            <label className="scn-filter-label">
              Sort:
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                <option value="priority">Priority (Critical first)</option>
                <option value="type">Type (HP first)</option>
                <option value="insertion">Insertion order</option>
              </select>
            </label>
            <label className="scn-filter-label">
              Type:
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as ScenarioType | 'All')}>
                <option value="All">All</option>
                {SCENARIO_TYPES.map(({ value, title }) => (
                  <option key={value} value={value}>{value} — {title}</option>
                ))}
              </select>
            </label>
            <label className="scn-filter-label">
              Priority:
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                <option value="All">All</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            {(filterType !== 'All' || filterPriority !== 'All') && (
              <span className="scn-filter-count">{filtered.length} of {scenarios.length} shown</span>
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
                className={`scn-view-btn${viewMode === 'table' ? ' active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                <i className="ti ti-table" />
                Table
              </button>
            </div>
          </div>

          {viewMode === 'table' ? (
            <div className={`scn-table-wrap${isResizing ? ' scn-table-wrap--resizing' : ''}`}>
              <table className="scn-table">
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: colWidths.title }} />
                  <col style={{ width: colWidths.refs }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 72 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th className="scn-th-resizable">
                      Title
                      <span
                        className="scn-col-resize"
                        onPointerDown={(e) => handleResizeStart(e, 'title')}
                      />
                    </th>
                    <th className="scn-th-resizable">
                      Req Refs
                      <span
                        className="scn-col-resize"
                        onPointerDown={(e) => handleResizeStart(e, 'refs')}
                      />
                    </th>
                    <th>Flow Steps</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(({ s: scenario, i: index }) => {
                    const isExpanded = expandedRow === index;
                    return (
                      <>
                        <tr
                          key={scenario.id}
                          className={`scn-table-row${isExpanded ? ' scn-table-row--expanded' : ''}`}
                          onClick={() => setExpandedRow(isExpanded ? null : index)}
                          title="Click to expand details"
                        >
                          <td className="scn-table-num">{index + 1}</td>
                          <td className="scn-table-id">{scenario.id}</td>
                          <td>
                            {scenario.type && (
                              <span
                                className={`scn-badge ${TYPE_COLORS[scenario.type]}`}
                                title={SCENARIO_TYPES.find((t) => t.value === scenario.type)?.title}
                              >
                                {scenario.type}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`scn-badge ${PRIORITY_COLORS[scenario.priority] ?? ''}`}>
                              {scenario.priority}
                            </span>
                          </td>
                          <td className="scn-table-title">{scenario.title || <em>Untitled</em>}</td>
                          <td className="scn-table-refs">
                            {scenario.requirementRefs.join(', ') || <span className="scn-table-empty">—</span>}
                          </td>
                          <td className="scn-table-steps">
                            {scenario.flow.length > 0
                              ? <span className="scn-table-count">{scenario.flow.length} steps</span>
                              : <span className="scn-table-empty">—</span>}
                          </td>
                          <td className="scn-table-actions" onClick={(e) => e.stopPropagation()}>
                            <CopyButton text={JSON.stringify(scenario, null, 2)} title="Copy scenario as JSON" />
                            <button
                              type="button"
                              className="scenario-delete-btn"
                              title="Delete this scenario"
                              onClick={() => onDeleteScenario(index)}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${scenario.id}-detail`} className="scn-table-detail">
                            <td colSpan={8}>
                              <div className="scn-detail-grid">
                                {scenario.preconditions.length > 0 && (
                                  <div className="scn-detail-block">
                                    <div className="scn-detail-label">Preconditions</div>
                                    <ul className="scn-detail-list">
                                      {scenario.preconditions.map((p, pi) => <li key={pi}>{p}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {scenario.flow.length > 0 && (
                                  <div className="scn-detail-block">
                                    <div className="scn-detail-label">Flow</div>
                                    <ol className="scn-detail-list">
                                      {scenario.flow.map((f, fi) => <li key={fi}>{f}</li>)}
                                    </ol>
                                  </div>
                                )}
                                {scenario.expectedOutcome && (
                                  <div className="scn-detail-block scn-detail-block--full">
                                    <div className="scn-detail-label">Expected Outcome</div>
                                    <p className="scn-detail-text">{scenario.expectedOutcome}</p>
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
          ) : (
            <div className="scenario-list">
              {filtered.map(({ s: scenario, i: index }) => {
                const isCollapsed = !!collapsed[index];
                return (
                  <article key={scenario.id} className="scenario-card">
                    <div
                      className="scenario-card-header"
                      onClick={() => toggleCollapse(index)}
                      role="button"
                      aria-expanded={!isCollapsed}
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCollapse(index)}
                    >
                      <span className="scenario-card-index">#{index + 1}</span>
                      {scenario.type && (
                        <span
                          className={`scn-badge ${TYPE_COLORS[scenario.type]}`}
                          title={SCENARIO_TYPES.find((t) => t.value === scenario.type)?.title}
                        >
                          {scenario.type}
                        </span>
                      )}
                      <span className={`scn-badge ${PRIORITY_COLORS[scenario.priority] ?? ''}`}>
                        {scenario.priority}
                      </span>
                      <span className="scenario-card-title">{scenario.title || <em>Untitled</em>}</span>
                      <div className="scenario-card-header-actions" onClick={(e) => e.stopPropagation()}>
                        <CopyButton text={JSON.stringify(scenario, null, 2)} title="Copy scenario as JSON" />
                        <button
                          type="button"
                          className="scenario-delete-btn"
                          title="Delete this scenario"
                          onClick={() => onDeleteScenario(index)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="scenario-card-body">
                        <div className="field-row">
                          <label htmlFor={`id-${index}`}>ID</label>
                          <input id={`id-${index}`} type="text" value={scenario.id} onChange={(e) => onUpdateField(index, 'id', e.target.value)} />
                        </div>
                        <div className="field-row">
                          <label htmlFor={`title-${index}`}>Title</label>
                          <input id={`title-${index}`} type="text" value={scenario.title} onChange={(e) => onUpdateField(index, 'title', e.target.value)} />
                        </div>
                        <div className="field-row">
                          <label htmlFor={`type-${index}`}>Type</label>
                          <select
                            id={`type-${index}`}
                            value={scenario.type ?? 'HP'}
                            onChange={(e) => onUpdateField(index, 'type', e.target.value)}
                          >
                            {SCENARIO_TYPES.map(({ value, title }) => (
                              <option key={value} value={value}>{value} — {title}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field-row">
                          <label htmlFor={`priority-${index}`}>Priority</label>
                          <select
                            id={`priority-${index}`}
                            value={scenario.priority}
                            onChange={(e) => onUpdateField(index, 'priority', e.target.value)}
                          >
                            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div className="field-stack">
                          <label htmlFor={`refs-${index}`}>Requirement Refs (one per line)</label>
                          <textarea id={`refs-${index}`} className="small-text" value={scenario.requirementRefs.join('\n')} onChange={(e) => onUpdateField(index, 'requirementRefs', e.target.value)} />
                        </div>
                        <div className="field-stack">
                          <label htmlFor={`pre-${index}`}>Preconditions (one per line)</label>
                          <textarea id={`pre-${index}`} className="small-text" value={scenario.preconditions.join('\n')} onChange={(e) => onUpdateField(index, 'preconditions', e.target.value)} />
                        </div>
                        <div className="field-stack">
                          <label htmlFor={`flow-${index}`}>Flow (one per line)</label>
                          <textarea id={`flow-${index}`} className="small-text" value={scenario.flow.join('\n')} onChange={(e) => onUpdateField(index, 'flow', e.target.value)} />
                        </div>
                        <div className="field-stack">
                          <label htmlFor={`outcome-${index}`}>Expected Outcome</label>
                          <textarea id={`outcome-${index}`} className="small-text" value={scenario.expectedOutcome} onChange={(e) => onUpdateField(index, 'expectedOutcome', e.target.value)} />
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <p className="feedback">{feedback}</p>
    </section>
  );
});
