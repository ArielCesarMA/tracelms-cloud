import { memo, useState, useCallback, useEffect, useRef } from 'react';
import type { ExtractedRequirement, RequirementType, IssueType, RequirementPriority } from '../types';

const REQUIREMENT_TYPES: RequirementType[] = [
  'Functional', 'Business Rule', 'Validation',
  'Non-Functional', 'Security', 'Privacy',
  'Integration', 'Data', 'Notification',
  'UI/UX', 'Reporting',
  'Compliance',
];

const REQUIREMENT_TYPE_GROUPS: { label: string; types: RequirementType[] }[] = [
  { label: 'Functional',   types: ['Functional', 'Business Rule', 'Validation'] },
  { label: 'Quality',      types: ['Non-Functional', 'Security', 'Privacy'] },
  { label: 'Architecture', types: ['Integration', 'Data', 'Notification'] },
  { label: 'Experience',   types: ['UI/UX', 'Reporting'] },
  { label: 'Governance',   types: ['Compliance'] },
];

const NFR_SUBCATEGORY_LABELS: Record<string, string> = {
  response_time: 'Response Time',
  throughput: 'Throughput',
  availability: 'Availability',
  scalability: 'Scalability',
  reliability: 'Reliability',
  recoverability: 'Recoverability',
  capacity: 'Capacity',
  maintainability: 'Maintainability',
  observability: 'Observability',
  internationalization: 'i18n / L10n',
  testability: 'Testability',
  supportability: 'Supportability',
  portability: 'Portability',
};

type EditingCell = { rowId: string; col: 'summary' } | null;

type Props = {
  requirements: ExtractedRequirement[];
  onUpdate: (reqId: string, field: keyof ExtractedRequirement, value: string) => void;
  onDelete: (reqId: string) => void;
  isBusy?: boolean;
};

export const RequirementTable = memo(function RequirementTable({
  requirements, onUpdate, onDelete, isBusy = false,
}: Props): JSX.Element | null {
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [detailRow, setDetailRow] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState('');
  const [undoState, setUndoState] = useState<{ row: ExtractedRequirement; index: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [summaryDraft, setSummaryDraft] = useState('');
  // Close detail row on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingCell(null);
        setDetailRow(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const startSummaryEdit = useCallback((req: ExtractedRequirement) => {
    if (isBusy) return;
    setEditingCell({ rowId: req.reqId, col: 'summary' });
    setSummaryDraft(req.summary);
  }, [isBusy]);

  const commitSummary = useCallback((reqId: string) => {
    onUpdate(reqId, 'summary', summaryDraft);
    setEditingCell(null);
  }, [summaryDraft, onUpdate]);

  const openDetail = useCallback((req: ExtractedRequirement) => {
    if (detailRow === req.reqId) {
      setDetailRow(null);
    } else {
      setDetailRow(req.reqId);
      setEditingDesc(req.description);
    }
  }, [detailRow]);

  const commitDesc = useCallback((reqId: string) => {
    onUpdate(reqId, 'description', editingDesc);
  }, [editingDesc, onUpdate]);

  const handleDelete = useCallback((req: ExtractedRequirement, index: number) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState({ row: req, index });
    onDelete(req.reqId);
    if (detailRow === req.reqId) setDetailRow(null);
    undoTimerRef.current = setTimeout(() => setUndoState(null), 5000);
  }, [onDelete, detailRow]);

  const handleUndo = useCallback(() => {
    if (!undoState) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    // Re-insert via synthetic update — caller must handle index-based re-insert
    // We emit a special marker via onUpdate with field '__undo__'
    onUpdate(undoState.row.reqId, '__undo__' as keyof ExtractedRequirement, JSON.stringify({ row: undoState.row, index: undoState.index }));
    setUndoState(null);
  }, [undoState, onUpdate]);

  if (!requirements.length) return null;

  return (
    <div className="req-table-wrapper">
      {/* ── Undo toast ── */}
      {undoState && (
        <div className="req-undo-toast">
          <span>Requirement deleted.</span>
          <button type="button" className="req-undo-btn" onClick={handleUndo}>Undo</button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="req-table-scroll">
        <table className="req-table">
          <thead>
            <tr>
              <th className="req-th req-th--reqid req-col-sticky-0">Req ID</th>
              <th className="req-th req-th--summary req-col-sticky-1">Summary</th>
              <th className="req-th req-th--description">Description</th>
              <th className="req-th req-th--issuetype">Issue Type</th>
              <th className="req-th req-th--reqtype">Requirement Type</th>
              <th className="req-th req-th--priority">Priority</th>
              <th className="req-th req-th--actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {requirements.map((req, idx) => (
              <>
              <tr
                key={req.reqId}
                className={`req-tr${detailRow === req.reqId ? ' req-tr--active scn-table-row--expanded' : ''}`}
                onClick={() => openDetail(req)}
              >
                {/* Req ID — sticky col 0 */}
                <td className="req-td req-col-sticky-0">
                  <span className="req-id-cell">{req.reqId}</span>
                  <span className={`req-source-chip req-source-chip--${req.source}`}>{req.source}</span>
                </td>

                {/* Summary — sticky col 1, click-to-edit */}
                <td
                  className="req-td req-td--summary req-col-sticky-1"
                  onClick={(e) => { e.stopPropagation(); startSummaryEdit(req); }}
                >
                  {editingCell?.rowId === req.reqId && editingCell.col === 'summary' ? (
                    <input
                      className="req-inline-input"
                      value={summaryDraft}
                      autoFocus
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      onBlur={() => commitSummary(req.reqId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitSummary(req.reqId);
                        if (e.key === 'Escape') setEditingCell(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="req-summary-text" title={req.summary}>{req.summary}</span>
                  )}
                </td>

                {/* Description — truncated preview; ⋯ button opens detail panel */}
                <td className="req-td req-td--description" onClick={(e) => { e.stopPropagation(); openDetail(req); }}>
                  <span className="req-desc-preview">{req.description}</span>
                  <button
                    type="button"
                    className="req-desc-expand-btn"
                    title="View and edit full description"
                    aria-label={`Expand description for ${req.reqId}`}
                    onClick={(e) => { e.stopPropagation(); openDetail(req); }}
                  >⋯</button>
                </td>

                {/* Issue Type */}
                <td className="req-td" onClick={(e) => e.stopPropagation()}>
                  <div className="req-select-wrap">
                    <select
                      className="req-select"
                      value={req.issueType}
                      disabled={isBusy}
                      onChange={(e) => onUpdate(req.reqId, 'issueType', e.target.value)}
                    >
                      <option value="Epic">Epic</option>
                      <option value="Story">Story</option>
                    </select>
                    {req.lowConfidence && (
                      <span className="req-low-confidence" title="Classification uncertain — please verify">?</span>
                    )}
                  </div>
                </td>

                {/* Requirement Type */}
                <td className="req-td" onClick={(e) => e.stopPropagation()}>
                  <select
                    className="req-select req-select--wide"
                    value={req.requirementType}
                    disabled={isBusy}
                    onChange={(e) => onUpdate(req.reqId, 'requirementType', e.target.value)}
                  >
                    {REQUIREMENT_TYPE_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.types.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {req.source === 'jira' && req.requirementType === 'Functional' && (
                    <span className="req-default-marker">(default)</span>
                  )}
                  {req.requirementType === 'Non-Functional' && req.nfrSubcategory && (
                    <span className="nfr-subcategory-chip">
                      {NFR_SUBCATEGORY_LABELS[req.nfrSubcategory] ?? req.nfrSubcategory}
                    </span>
                  )}
                </td>

                {/* Priority */}
                <td className="req-td" onClick={(e) => e.stopPropagation()}>
                  <select
                    className={`req-select req-priority-select req-priority--${req.priority.toLowerCase()}`}
                    value={req.priority}
                    disabled={isBusy}
                    onChange={(e) => onUpdate(req.reqId, 'priority', e.target.value)}
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </td>

                {/* Delete */}
                <td className="req-td req-td--actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="req-delete-btn"
                    title="Delete this requirement"
                    disabled={isBusy}
                    onClick={() => handleDelete(req, idx)}
                    aria-label={`Delete ${req.reqId}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
              {detailRow === req.reqId && (
                <tr key={`${req.reqId}-detail`} className="scn-table-detail req-table-detail">
                  <td colSpan={7}>
                    <div className="scn-detail-grid req-desc-detail-grid">
                      <div className="scn-detail-block scn-detail-block--full">
                        <div className="scn-detail-label">{req.reqId} — Description</div>
                        <textarea
                          className="req-detail-textarea"
                          value={editingDesc}
                          autoFocus
                          onChange={(e) => setEditingDesc(e.target.value)}
                          onBlur={() => commitDesc(req.reqId)}
                          disabled={isBusy}
                          placeholder="No description provided."
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

// ── Card layout (< 540px) — exported for completeness; used via CSS media query
export type { Props as RequirementTableProps };
