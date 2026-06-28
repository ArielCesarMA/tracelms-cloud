import { memo, useState, useCallback, useRef, useEffect } from 'react';
import type { GenerationHistoryItem, DocumentType, GeneratedDocument, TestPlanDocument, Settings } from '../types';
import { streamGenerateDocument, fetchDocuments, fetchGenerationHistory } from '../api/client';
import { exportTestPlanDocx } from '../utils/docxGenerator';

type Props = {
  activeProjectId: string | null;
  activeProjectName: string | null;
  settings: Settings;
  isBusy: boolean;
  onBusyChange: (busy: boolean) => void;
};

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  'test-plan': 'Test Plan',
  'test-strategy': 'Test Strategy',
};

const DOC_TYPE_HINTS: Record<DocumentType, string> = {
  'test-plan': 'IEEE 829 — formal test plan for a specific project lifecycle',
  'test-strategy': 'Organization-level artifact defining testing standards, levels, and approach',
};

const DOC_TYPE_SECTIONS: Record<DocumentType, string[]> = {
  'test-plan': [
    'Objectives', 'Test Scope', 'Test Approach', 'Test Environment',
    'Entry and Exit Criteria', 'Test Deliverables', 'Risk and Mitigation',
    'Test Case Summary', 'Automation Strategy', 'Sign-off',
  ],
  'test-strategy': [
    'Purpose and Scope', 'Test Levels', 'Test Types', 'Test Design Techniques',
    'Test Automation Strategy', 'Defect Management', 'Test Metrics and Reporting',
    'Roles and Responsibilities', 'Risk-Based Testing Approach', 'Review and Approval',
  ],
};

function SectionBlock({ section }: { section: GeneratedDocument['sections'][number] }): JSX.Element {
  return (
    <div className="doc-section">
      <h3 className="doc-section__heading">
        <span className="doc-section__num">{section.id}</span>
        {section.heading}
      </h3>
      {section.content && (
        <p className="doc-section__content">{section.content}</p>
      )}
      {section.subsections && (
        <div className="doc-section__subsections">
          {section.subsections.map((sub) => (
            <div key={sub.id} className="doc-subsection">
              <h4 className="doc-subsection__heading">
                <span className="doc-section__num">{sub.id}</span>
                {sub.heading}
              </h4>
              <p className="doc-section__content">{sub.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentPreview({ doc }: { doc: GeneratedDocument }): JSX.Element {
  const typeLabel = doc.documentType === 'test-strategy'
    ? 'Test Strategy'
    : 'Test Plan · IEEE 829';
  return (
    <div className="doc-preview" id="doc-print-area">
      <div className="doc-preview__header">
        <h1 className="doc-preview__title">{doc.title}</h1>
        <dl className="doc-preview__meta">
          <div className="doc-meta-row"><dt>Type</dt><dd>{typeLabel}</dd></div>
          <div className="doc-meta-row"><dt>Version</dt><dd>{doc.version}</dd></div>
          <div className="doc-meta-row"><dt>Date</dt><dd>{doc.date}</dd></div>
          <div className="doc-meta-row"><dt>Project</dt><dd>{doc.projectName}</dd></div>
          <div className="doc-meta-row"><dt>Prepared By</dt><dd>{doc.preparedBy}</dd></div>
        </dl>
      </div>
      <div className="doc-preview__divider" />
      <div className="doc-preview__body">
        {doc.sections.map((s) => (
          <SectionBlock key={s.id} section={s} />
        ))}
      </div>
    </div>
  );
}

function UnsavedBanner(): JSX.Element {
  return (
    <div className="doc-unsaved-banner">
      <span className="doc-unsaved-banner__icon">◆</span>
      <span className="doc-unsaved-banner__msg">Document generated — download or print before leaving this tab.</span>
    </div>
  );
}

export const DocumentsTab = memo(function DocumentsTab({
  activeProjectId,
  activeProjectName,
  settings,
  isBusy,
  onBusyChange,
}: Props): JSX.Element {
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedGenId, setSelectedGenId] = useState<string>('');
  const [documentType, setDocumentType] = useState<DocumentType>('test-plan');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [streamedChunks, setStreamedChunks] = useState('');
  const [generatedDocs, setGeneratedDocs] = useState<Record<DocumentType, GeneratedDocument | null>>({ 'test-plan': null, 'test-strategy': null });
  const [exportedTypes, setExportedTypes] = useState<Record<DocumentType, boolean>>({ 'test-plan': false, 'test-strategy': false });
  const [isLoading, setIsLoading] = useState(false);

  const generatedDoc = generatedDocs[documentType];
  const isExported = exportedTypes[documentType];

  const streamRef = useRef('');

  useEffect(() => {
    setHistoryLoading(true);
    fetchGenerationHistory(activeProjectId ?? undefined)
      .then(({ generations }) => setGenerationHistory(generations))
      .catch(() => setError('Failed to load generation history.'))
      .finally(() => setHistoryLoading(false));
  }, [activeProjectId]);

  const completedGenerations = generationHistory.filter((g) => g.totalTestCases > 0);

  const handleGenerate = useCallback(async () => {
    if (!selectedGenId) return;
    setError('');
    setGeneratedDocs((prev) => ({ ...prev, [documentType]: null }));
    setExportedTypes((prev) => ({ ...prev, [documentType]: false }));
    setStreamedChunks('');
    streamRef.current = '';
    onBusyChange(true);
    setStatus('Connecting to LLM…');

    try {
      const doc = await streamGenerateDocument(
        selectedGenId,
        activeProjectName ?? 'Project',
        documentType,
        { llmProvider: settings.llmProvider, llmModel: settings.llmModel, llmApiKey: settings.llmApiKey },
        (e) => {
          if (e.event === 'status') setStatus((e.data as { message: string }).message);
          else if (e.event === 'model-info' && (e.data as { isReasoning: boolean }).isReasoning) {
            setStatus(`Reasoning model active — generating ${DOC_TYPE_LABELS[documentType]}…`);
          } else if (e.event === 'chunk') {
            streamRef.current += (e.data as { text: string }).text;
            setStreamedChunks(streamRef.current);
          }
        },
      );

      if (doc) {
        setGeneratedDocs((prev) => ({ ...prev, [documentType]: doc }));
        setStatus('');
      } else {
        setError('LLM returned an incomplete document. Try again or switch to a more capable model.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document generation failed.');
      setStatus('');
    } finally {
      onBusyChange(false);
    }
  }, [selectedGenId, activeProjectName, documentType, settings, onBusyChange]);

  const handleLoadSaved = useCallback(async () => {
    if (!selectedGenId) return;
    setError('');
    setIsLoading(true);
    try {
      const { documents } = await fetchDocuments(selectedGenId);
      const saved = documents?.[documentType] ?? null;
      if (saved) {
        setGeneratedDocs((prev) => ({ ...prev, [documentType]: saved }));
        setExportedTypes((prev) => ({ ...prev, [documentType]: true }));
        setStatus('');
      } else {
        setError(`No saved ${DOC_TYPE_LABELS[documentType]} for this generation. Generate one first.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved document.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedGenId, documentType]);

  const handleDownloadDocx = useCallback(async () => {
    if (!generatedDoc) return;
    if (generatedDoc.documentType === 'test-plan') {
      await exportTestPlanDocx(generatedDoc as TestPlanDocument);
    } else {
      await exportTestPlanDocx(generatedDoc as unknown as TestPlanDocument);
    }
    setExportedTypes((prev) => ({ ...prev, [documentType]: true }));
  }, [generatedDoc, documentType]);

  const handlePrint = useCallback(() => {
    window.print();
    setExportedTypes((prev) => ({ ...prev, [documentType]: true }));
  }, [documentType]);

  const selectedGen = completedGenerations.find((g) => g.id === selectedGenId);

  return (
    <div className="doc-hub">
      <div className="doc-hub__toolbar">
        <div className="doc-hub__toolbar-left">
          <h2 className="doc-hub__title">Document Generation Hub</h2>
          <p className="doc-hub__subtitle">Generate a formal quality document from any completed generation.</p>
        </div>
      </div>

      <div className="doc-hub__controls">
        {/* Document type selector */}
        <div className="form-group">
          <label className="form-label">Document Type</label>
          <div className="doc-hub__type-selector">
            {(Object.entries(DOC_TYPE_LABELS) as [DocumentType, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`doc-hub__type-btn${documentType === key ? ' active' : ''}`}
                onClick={() => { setDocumentType(key); setError(''); setStreamedChunks(''); }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="doc-hub__type-hint">{DOC_TYPE_HINTS[documentType]}</p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="doc-gen-select">Generation Source</label>
          {historyLoading ? (
            <p className="doc-hub__empty">Loading generations…</p>
          ) : completedGenerations.length === 0 ? (
            <p className="doc-hub__empty">No completed generations found. Run a full generation first (Requirements → Automation).</p>
          ) : (
            <select
              id="doc-gen-select"
              className="form-select"
              value={selectedGenId}
              onChange={(e) => { setSelectedGenId(e.target.value); setGeneratedDocs({ 'test-plan': null, 'test-strategy': null }); setExportedTypes({ 'test-plan': false, 'test-strategy': false }); setError(''); setStreamedChunks(''); }}
            >
              <option value="">— Select a generation —</option>
              {completedGenerations.map((g) => (
                <option key={g.id} value={g.id}>
                  {new Date(g.createdAt).toLocaleString()} · {g.totalTestCases} TCs · {g.llmProvider}/{g.llmModel}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="doc-hub__actions">
          <button
            className="btn btn--accent doc-hub__generate-btn"
            onClick={handleGenerate}
            disabled={!selectedGenId || isBusy || isLoading}
          >
            {isBusy ? 'Generating…' : `Generate ${DOC_TYPE_LABELS[documentType]}`}
          </button>
          <button
            className="btn btn--outline"
            onClick={handleLoadSaved}
            disabled={!selectedGenId || isBusy || isLoading}
          >
            {isLoading ? 'Loading…' : 'Load Saved'}
          </button>
        </div>

        {selectedGen && (
          <div className="doc-hub__gen-meta">
            <span className="doc-hub__gen-meta-item"><strong>TCs:</strong> {selectedGen.totalTestCases}</span>
            <span className="doc-hub__gen-meta-item"><strong>Scenarios:</strong> {selectedGen.totalScenarios}</span>
            <span className="doc-hub__gen-meta-item"><strong>Model:</strong> {selectedGen.llmProvider}/{selectedGen.llmModel}</span>
            <span className="doc-hub__gen-meta-item"><strong>Status:</strong> {selectedGen.status}</span>
          </div>
        )}
      </div>

      {error && <div className="feedback feedback--error">{error}</div>}

      {status && !generatedDoc && (
        <div className="doc-hub__streaming">
          <div className="doc-hub__stream-status">
            <span className="spinner" />
            <span>{status}</span>
          </div>
          <div className="doc-hub__skeleton">
            {DOC_TYPE_SECTIONS[documentType].map((name, i) => {
              const CHARS_PER_SECTION = 400;
              const filled = Math.floor(streamedChunks.length / CHARS_PER_SECTION);
              const state = i < filled ? 'done' : i === filled ? 'active' : 'pending';
              return (
                <div key={name} className={`doc-hub__skeleton-row doc-hub__skeleton-row--${state}`}>
                  <span className="doc-hub__skeleton-num">{i + 1}</span>
                  <span className="doc-hub__skeleton-name">{name}</span>
                  {state === 'done' && <span className="doc-hub__skeleton-check">✓</span>}
                  {state === 'active' && <span className="doc-hub__skeleton-pulse" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {generatedDoc && (
        <div className="doc-hub__result">
          {!isExported && (
            <UnsavedBanner />
          )}

          <div className="doc-hub__export-bar">
            <span className="doc-hub__doc-title">{generatedDoc.title}</span>
            <div className="doc-hub__export-actions">
              <button className="btn btn--accent btn--sm" onClick={handleDownloadDocx}>
                <i className="ti ti-file-type-docx" /> Download .docx
              </button>
              <button className="btn btn--outline btn--sm" onClick={handlePrint}>
                <i className="ti ti-printer" /> Print / PDF
              </button>
            </div>
          </div>

          <DocumentPreview doc={generatedDoc} />
        </div>
      )}
    </div>
  );
});
