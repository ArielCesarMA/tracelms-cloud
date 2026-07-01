import { memo, useState, useEffect, useCallback } from 'react';
import {
  fetchProjects, createProject, updateProject, archiveProject,
  addStakeholder, removeStakeholder,
  fetchGenerationHistory, fetchGeneration, deleteGeneration,
  fetchApprovalLayers, saveApprovalLayers,
} from '../api/client';
import type { LatestGenerationRecord } from '../api/client';
import type { Project, ProjectMember, GenerationHistoryItem, ApprovalLayer, ApprovalLayerMember } from '../types';
import { useAuth, canManageUsers, ROLE_LABELS } from '../contexts/AuthContext';
import type { ProjectRole } from '../types';

const MAX_LAYERS = 5;
const MAX_MEMBERS = 3;

function emptyLayer(order: number): ApprovalLayer {
  return { order, consensus: 'ALL', members: [] };
}

type Props = {
  activeProjectId: string | null;
  onProjectActivate: (project: Project | null) => void;
  onGenerationLoad: (gen: LatestGenerationRecord) => void;
};

const PROJECT_ROLES: ProjectRole[] = ['LEAD', 'EDITOR', 'REVIEWER', 'VIEWER'];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE:   'Available',
  DRAFT:    'Draft',
  ARCHIVED: 'Archived',
};

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'ACTIVE' ? 'proj-badge proj-badge--active'
    : status === 'DRAFT' ? 'proj-badge proj-badge--draft'
    : 'proj-badge proj-badge--archived';
  return <span className={cls}>{STATUS_LABELS[status] ?? status}</span>;
}

export const ProjectsTab = memo(function ProjectsTab({ activeProjectId, onProjectActivate, onGenerationLoad }: Props): JSX.Element {
  const { user: authUser } = useAuth();
  const userRole = authUser?.role;
  const canArchive = canManageUsers(userRole); // Owner/Admin can archive
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createKey, setCreateKey] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createError, setCreateError] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editJiraKey, setEditJiraKey] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // Approval chain state
  const [layers, setLayers] = useState<ApprovalLayer[]>([]);
  const [layersBusy, setLayersBusy] = useState(false);
  const [layersSaved, setLayersSaved] = useState(false);

  // Selected project for detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Stakeholder state
  const [stakeholderEmail, setStakeholderEmail] = useState('');
  const [stakeholderName, setStakeholderName] = useState('');
  const [stakeholderRole, setStakeholderRole] = useState<ProjectRole>('VIEWER');
  const [stakeholderBusy, setStakeholderBusy] = useState(false);
  const [stakeholderError, setStakeholderError] = useState('');

  // Generation history
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState<GenerationHistoryItem | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { projects: list } = await fetchProjects();
      setProjects(list as Project[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  // Load generation history when a project is selected
  useEffect(() => {
    if (!selectedId) { setHistory([]); return; }
    setHistoryLoading(true);
    fetchGenerationHistory(selectedId)
      .then(({ generations }) => setHistory(generations as GenerationHistoryItem[]))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [selectedId]);

  // Load approval layers when selected project changes
  useEffect(() => {
    if (!selectedId) { setLayers([]); return; }
    setLayersSaved(false);
    fetchApprovalLayers(selectedId)
      .then(({ layers: fetched }) => setLayers(fetched))
      .catch(() => setLayers([]));
  }, [selectedId]);

  // ── Layer mutation helpers ───────────────────────────────────────────────────

  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) return;
    setLayers((prev) => [...prev, emptyLayer(prev.length + 1)]);
    setLayersSaved(false);
  };

  const removeLayer = (idx: number) => {
    setLayers((prev) => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, order: i + 1 })));
    setLayersSaved(false);
  };

  const setConsensus = (idx: number, consensus: 'ANY' | 'ALL') => {
    setLayers((prev) => prev.map((l, i) => i === idx ? { ...l, consensus } : l));
    setLayersSaved(false);
  };

  const addMember = (layerIdx: number) => {
    setLayers((prev) => prev.map((l, i) =>
      i === layerIdx && l.members.length < MAX_MEMBERS
        ? { ...l, members: [...l.members, { name: '', email: '' }] }
        : l
    ));
    setLayersSaved(false);
  };

  const removeMember = (layerIdx: number, memberIdx: number) => {
    setLayers((prev) => prev.map((l, i) =>
      i === layerIdx
        ? { ...l, members: l.members.filter((_, mi) => mi !== memberIdx) }
        : l
    ));
    setLayersSaved(false);
  };

  const updateMember = (layerIdx: number, memberIdx: number, field: keyof ApprovalLayerMember, value: string) => {
    setLayers((prev) => prev.map((l, i) =>
      i === layerIdx
        ? { ...l, members: l.members.map((m, mi) => mi === memberIdx ? { ...m, [field]: value } : m) }
        : l
    ));
    setLayersSaved(false);
  };

  const handleSaveLayers = async () => {
    if (!selectedId) return;
    setLayersBusy(true);
    setLayersSaved(false);
    try {
      const { layers: saved } = await saveApprovalLayers(selectedId, layers);
      setLayers(saved);
      setLayersSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save approval chain.');
    } finally {
      setLayersBusy(false);
    }
  };

  // ── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createName.trim() || !createKey.trim()) {
      setCreateError('Project name and key are required.');
      return;
    }
    setCreateBusy(true);
    setCreateError('');
    try {
      const { project } = await createProject({ name: createName.trim(), key: createKey.trim(), description: createDesc.trim() });
      setProjects((prev) => [project as Project, ...prev]);
      setShowCreate(false);
      setCreateName(''); setCreateKey(''); setCreateDesc('');
      setSelectedId((project as Project).id);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create project.');
    } finally {
      setCreateBusy(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────

  const startEdit = (p: Project) => {
    setEditId(p.id);
    setEditName(p.name);
    setEditDesc(p.description);
    setEditJiraKey(p.jiraProjectKey ?? '');
  };

  const handleEdit = async () => {
    if (!editId) return;
    setEditBusy(true);
    try {
      const { project } = await updateProject(editId, {
        name: editName.trim(),
        description: editDesc.trim(),
        jiraProjectKey: editJiraKey.trim() || undefined,
      });
      const updated = project as Project;
      setProjects((prev) => prev.map((p) => p.id === editId ? updated : p));
      if (activeProjectId === editId) onProjectActivate(updated);
      setEditId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update project.');
    } finally {
      setEditBusy(false);
    }
  };

  // ── Archive ──────────────────────────────────────────────────────────────────

  const handleArchive = async (id: string) => {
    if (!window.confirm('Archive this project? You can restore it later.')) return;
    try {
      await archiveProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) { setSelectedId(null); }
      if (activeProjectId === id) onProjectActivate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to archive project.');
    }
  };

  // ── Activate ────────────────────────────────────────────────────────────────

  const handleActivate = (p: Project) => {
    const isActive = activeProjectId === p.id;
    onProjectActivate(isActive ? null : p);
  };

  // ── Stakeholders ─────────────────────────────────────────────────────────────

  const handleAddStakeholder = async () => {
    if (!selectedId || !stakeholderEmail.trim()) {
      setStakeholderError('Email is required.');
      return;
    }
    setStakeholderBusy(true);
    setStakeholderError('');
    try {
      const { member } = await addStakeholder(selectedId, {
        email: stakeholderEmail.trim(),
        name: stakeholderName.trim(),
        role: stakeholderRole,
      });
      setProjects((prev) => prev.map((p) =>
        p.id === selectedId
          ? { ...p, members: [...(p.members ?? []), member as ProjectMember] }
          : p
      ));
      setStakeholderEmail(''); setStakeholderName(''); setStakeholderRole('VIEWER');
    } catch (e) {
      setStakeholderError(e instanceof Error ? e.message : 'Failed to add stakeholder.');
    } finally {
      setStakeholderBusy(false);
    }
  };

  const handleRemoveStakeholder = async (sid: string) => {
    if (!selectedId) return;
    try {
      await removeStakeholder(selectedId, sid);
      setProjects((prev) => prev.map((p) =>
        p.id === selectedId
          ? { ...p, members: (p.members ?? []).filter((s) => s.id !== sid) }
          : p
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove stakeholder.');
    }
  };

  // ── Generation history restore ───────────────────────────────────────────────

  const handleLoadGeneration = async (item: GenerationHistoryItem) => {
    setLoadBusy(true);
    setConfirmLoad(null);
    try {
      const { generation } = await fetchGeneration(item.id);
      onGenerationLoad(generation);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load generation.');
    } finally {
      setLoadBusy(false);
    }
  };

  const handleDeleteGeneration = async (item: GenerationHistoryItem) => {
    if (!window.confirm('Delete this generation record? This cannot be undone.')) return;
    try {
      await deleteGeneration(item.id);
      setHistory((prev) => prev.filter((h) => h.id !== item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete generation.');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section className="panel">
      <div className="proj-header">
        <h2>Projects</h2>
        <button type="button" onClick={() => setShowCreate(true)} className="proj-create-btn">
          <i className="ti ti-plus" aria-hidden="true" /> New Project
        </button>
      </div>
      <p className="helper-text">
        Organise your generation runs into named projects. Select a project to set it as the active context — new generations will be linked to it automatically.
      </p>

      {error && <p className="feedback feedback--error">{error}</p>}

      {/* ── Create Modal ──────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="proj-modal-overlay" role="dialog" aria-modal="true" aria-label="Create project">
          <div className="proj-modal">
            <div className="proj-modal-header">
              <h3>New Project</h3>
              <button
                type="button"
                className="proj-modal-close"
                onClick={() => { setShowCreate(false); setCreateError(''); }}
                aria-label="Close"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
            <div className="field-stack">
              <label htmlFor="proj-name">Project Name</label>
              <input id="proj-name" type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="My QA Project" autoFocus />
            </div>
            <div className="field-stack">
              <label htmlFor="proj-key">Project Key</label>
              <input id="proj-key" type="text" value={createKey} onChange={(e) => setCreateKey(e.target.value.toUpperCase())} placeholder="PROJ" maxLength={10} />
              <span className="helper-text">Short unique code, e.g. PROJ</span>
            </div>
            <div className="field-stack">
              <label htmlFor="proj-desc">Description</label>
              <textarea id="proj-desc" rows={4} value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} placeholder="Describe the scope, goals, or context of this project" className="proj-desc-textarea" />
              <span className="helper-text">Optional</span>
            </div>
            {createError && <p className="feedback feedback--error">{createError}</p>}
            <div className="button-row">
              <button type="button" onClick={handleCreate} disabled={createBusy}>
                {createBusy ? 'Creating…' : 'Create Project'}
              </button>
              <button type="button" data-variant="secondary" onClick={() => { setShowCreate(false); setCreateError(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm-load overlay ──────────────────────────────────────────── */}
      {confirmLoad && (
        <div className="proj-modal-overlay" role="dialog" aria-modal="true">
          <div className="proj-modal">
            <h3>Load Generation?</h3>
            <p className="helper-text">
              You have unsaved work in the current session. Loading this generation will overwrite your current requirements, enhancement, scenarios, test cases, and automation.
            </p>
            <p><strong>{confirmLoad.requirementPreview}</strong></p>
            <div className="button-row">
              <button type="button" onClick={() => handleLoadGeneration(confirmLoad)} disabled={loadBusy}>
                {loadBusy ? 'Loading…' : 'Discard & Load'}
              </button>
              <button type="button" data-variant="secondary" onClick={() => setConfirmLoad(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="helper-text">Loading projects…</p>
      ) : projects.length === 0 ? (
        <div className="proj-empty">
          <i className="ti ti-folder-off proj-empty-icon" aria-hidden="true" />
          <p>No projects yet. Create one to start organising your generation runs.</p>
        </div>
      ) : (
        <div className="proj-layout">
          {/* ── Project list ───────────────────────────────────────────────── */}
          <div className="proj-list">
            {projects.map((p) => {
              const isSelected = selectedId === p.id;
              const isActive = activeProjectId === p.id;
              return (
                <div
                  key={p.id}
                  className={`proj-card${isSelected ? ' proj-card--selected' : ''}${isActive ? ' proj-card--active' : ''}`}
                  onClick={() => setSelectedId(isSelected ? null : p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(isSelected ? null : p.id); }}
                >
                  <div className="proj-card-top">
                    <div>
                      <span className="proj-card-key">{p.key}</span>
                      {isActive && <span className="proj-active-chip">Active</span>}
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="proj-card-name">{p.name}</p>
                  {p.description && <p className="proj-card-desc">{p.description}</p>}
                  <div className="proj-card-meta">
                    <span><i className="ti ti-history" aria-hidden="true" /> {p._count?.generations ?? 0} runs</span>
                    <span><i className="ti ti-users" aria-hidden="true" /> {(p.members ?? []).length} members</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Project detail ─────────────────────────────────────────────── */}
          {selectedProject && (
            <div className="proj-detail">
              {/* Header */}
              <div className="proj-detail-header">
                <div>
                  <h3>{selectedProject.name} <span className="proj-card-key">{selectedProject.key}</span></h3>
                  {selectedProject.description && <p className="helper-text">{selectedProject.description}</p>}
                </div>
                <div className="proj-detail-actions">
                  <button
                    type="button"
                    onClick={() => handleActivate(selectedProject)}
                    className={activeProjectId === selectedProject.id ? 'proj-btn-deactivate' : 'proj-btn-activate'}
                  >
                    {activeProjectId === selectedProject.id ? 'Deactivate' : 'Set as Active'}
                  </button>
                  <button type="button" data-variant="secondary" onClick={() => startEdit(selectedProject)}>
                    <i className="ti ti-edit" aria-hidden="true" /> Edit
                  </button>
                  {canArchive && (
                    <button type="button" data-variant="danger" onClick={() => handleArchive(selectedProject.id)}>
                      <i className="ti ti-archive" aria-hidden="true" /> Archive
                    </button>
                  )}
                </div>
              </div>

              {/* Edit form */}
              {editId === selectedProject.id && (
                <div className="proj-edit-form">
                  <div className="field-row">
                    <label>Name</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className="field-row">
                    <label>Description</label>
                    <textarea rows={4} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="proj-desc-textarea" />
                  </div>
                  <div className="field-row">
                    <label htmlFor="editJiraKey">
                      Jira Project Key
                      <span className="helper-text" style={{ marginLeft: 'var(--space-2)', fontWeight: 'normal' }}>
                        — overrides the org default for Xray pushes
                      </span>
                    </label>
                    <input
                      id="editJiraKey"
                      type="text"
                      placeholder="e.g. PROJ"
                      value={editJiraKey}
                      onChange={(e) => setEditJiraKey(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={handleEdit} disabled={editBusy}>{editBusy ? 'Saving…' : 'Save'}</button>
                    <button type="button" data-variant="secondary" onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Approval Chain */}
              <div className="proj-section">
                <h4>Approval Chain</h4>
                <p className="helper-text">
                  Sequential approval layers — up to {MAX_LAYERS} layers, up to {MAX_MEMBERS} approvers each.
                  <strong> Any</strong>: one approval in the layer advances to the next.
                  <strong> All</strong>: everyone in the layer must approve.
                </p>

                <div className="ap-chain">
                  {layers.map((layer, li) => (
                    <div key={li} className="ap-layer">
                      <div className="ap-layer-header">
                        <span className="ap-layer-label">Layer {layer.order}</span>
                        <div className="ap-consensus-toggle">
                          <button
                            type="button"
                            className={`ap-consensus-btn${layer.consensus === 'ANY' ? ' ap-consensus-btn--active' : ''}`}
                            onClick={() => setConsensus(li, 'ANY')}
                          >Any</button>
                          <button
                            type="button"
                            className={`ap-consensus-btn${layer.consensus === 'ALL' ? ' ap-consensus-btn--active' : ''}`}
                            onClick={() => setConsensus(li, 'ALL')}
                          >All</button>
                        </div>
                        <button type="button" className="proj-icon-btn ap-layer-remove" onClick={() => removeLayer(li)} title="Remove layer">
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="ap-members">
                        {layer.members.map((m, mi) => (
                          <div key={mi} className="ap-member-row">
                            <input
                              type="text"
                              placeholder="Full name"
                              value={m.name}
                              onChange={(e) => updateMember(li, mi, 'name', e.target.value)}
                            />
                            <input
                              type="email"
                              placeholder="Email"
                              value={m.email}
                              onChange={(e) => updateMember(li, mi, 'email', e.target.value)}
                            />
                            <button type="button" className="proj-icon-btn" onClick={() => removeMember(li, mi)} title="Remove approver">
                              <i className="ti ti-x" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                        {layer.members.length < MAX_MEMBERS && (
                          <button type="button" className="ap-add-member" onClick={() => addMember(li)}>
                            <i className="ti ti-plus" aria-hidden="true" /> Add approver
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {layers.length < MAX_LAYERS && (
                    <button type="button" className="ap-add-layer" onClick={addLayer}>
                      <i className="ti ti-plus" aria-hidden="true" /> Add Layer
                    </button>
                  )}
                </div>

                <div className="button-row">
                  <button type="button" onClick={handleSaveLayers} disabled={layersBusy}>
                    {layersBusy ? 'Saving…' : 'Save Approval Chain'}
                  </button>
                  {layersSaved && <span className="proj-approver-saved"><i className="ti ti-check" /> Saved</span>}
                </div>
              </div>

              {/* Stakeholders */}
              <div className="proj-section">
                <h4>Team</h4>
                {(selectedProject.members ?? []).length === 0 ? (
                  <p className="helper-text">No team members added yet.</p>
                ) : (
                  <table className="proj-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedProject.members ?? []).map((s) => (
                        <tr key={s.id}>
                          <td>{s.email}</td>
                          <td>{s.name || '—'}</td>
                          <td><span className="proj-role-chip">{s.projectRole ?? ROLE_LABELS[s.projectRole as never] ?? s.projectRole}</span></td>
                          <td>
                            <button type="button" className="proj-icon-btn" onClick={() => handleRemoveStakeholder(s.id)} title="Remove">
                              <i className="ti ti-trash" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Add stakeholder form */}
                <div className="proj-stakeholder-form">
                  <p className="proj-section-subtitle">Add team member</p>
                  <div className="proj-stakeholder-inputs">
                    <input
                      type="email"
                      placeholder="Email"
                      value={stakeholderEmail}
                      onChange={(e) => setStakeholderEmail(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Name (optional)"
                      value={stakeholderName}
                      onChange={(e) => setStakeholderName(e.target.value)}
                    />
                    <select value={stakeholderRole} onChange={(e) => setStakeholderRole(e.target.value as ProjectRole)}>
                      {PROJECT_ROLES.map((r) => <option key={r} value={r}>{r === 'LEAD' ? 'Lead' : r === 'EDITOR' ? 'Editor' : r === 'REVIEWER' ? 'Reviewer' : 'Viewer'}</option>)}
                    </select>
                    <button type="button" onClick={handleAddStakeholder} disabled={stakeholderBusy}>
                      {stakeholderBusy ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  {stakeholderError && <p className="feedback feedback--error">{stakeholderError}</p>}
                  <p className="helper-text" style={{ marginTop: '6px' }}>
                    Note: email notification is a Phase 5 feature — the invitee must be informed manually for now.
                  </p>
                </div>
              </div>

              {/* Generation history */}
              <div className="proj-section">
                <h4>Generation History</h4>
                {historyLoading ? (
                  <p className="helper-text">Loading history…</p>
                ) : history.length === 0 ? (
                  <p className="helper-text">No generation runs linked to this project yet.</p>
                ) : (
                  <table className="proj-table proj-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Requirement Preview</th>
                        <th>Provider / Model</th>
                        <th>Tests</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id}>
                          <td className="proj-history-date">{new Date(h.createdAt).toLocaleDateString()}</td>
                          <td className="proj-history-preview">{h.requirementPreview}</td>
                          <td>{h.llmProvider} / <span className="proj-model-label">{h.llmModel}</span></td>
                          <td>
                            {h.totalTestCases}
                            {h.hasDocuments && (
                              <span className="proj-doc-badge" title="Documents available">
                                <i className="ti ti-file-type-doc" aria-hidden="true" />
                              </span>
                            )}
                          </td>
                          <td><StatusBadge status={h.status} /></td>
                          <td className="proj-history-actions">
                            <button
                              type="button"
                              className="proj-icon-btn proj-icon-btn--load"
                              onClick={() => setConfirmLoad(h)}
                              title="Load this generation"
                              disabled={loadBusy}
                            >
                              <i className="ti ti-player-play" aria-hidden="true" /> Load
                            </button>
                            <button
                              type="button"
                              className="proj-icon-btn proj-icon-btn--delete"
                              onClick={() => handleDeleteGeneration(h)}
                              title="Delete this generation"
                            >
                              <i className="ti ti-trash" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
