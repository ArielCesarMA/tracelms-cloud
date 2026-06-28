import { memo, useState, useEffect, useCallback } from 'react';
import { Tip } from '../components/Tip';
import { type Settings, type AuthUser, type OrgRole } from '../types';
import { useAuth, isOwner, canManageUsers, ROLE_LABELS } from '../contexts/AuthContext';
import { fetchUsers, updateUserRole, updateUserStatus } from '../api/client';

type Props = {
  settings: Settings;
  availableModels: string[];
  isBusy: boolean;
  feedback: string;
  onFieldChange: (key: keyof Settings, value: string) => void;
  onSave: () => void;
  onTestLlm: () => void;
  onTestJira: () => void;
};

const ORG_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];

export const SettingsTab = memo(function SettingsTab({
  settings, availableModels, isBusy, feedback, onFieldChange, onSave, onTestLlm, onTestJira,
}: Props): JSX.Element {
  const { user: authUser } = useAuth();
  const userRole = authUser?.role;
  const showTeam = canManageUsers(userRole);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');

  const loadUsers = useCallback(async () => {
    if (!showTeam) return;
    setTeamLoading(true);
    setTeamError('');
    try {
      const { users: list } = await fetchUsers();
      setUsers(list);
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setTeamLoading(false);
    }
  }, [showTeam]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const handleRoleChange = async (userId: string, role: OrgRole) => {
    try {
      const { user: updated } = await updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => u.id === updated.id ? { ...u, role: updated.role } : u));
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'Failed to update role.');
    }
  };

  const handleStatusToggle = async (userId: string, currentlyActive: boolean) => {
    try {
      const { user: updated } = await updateUserStatus(userId, !currentlyActive);
      setUsers((prev) => prev.map((u) => u.id === updated.id ? { ...u, isActive: updated.isActive } : u));
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'Failed to update status.');
    }
  };

  const isSelfOwner = isOwner(userRole);

  return (
    <section className="panel">
      <h2>Integrations</h2>

      <div className="settings-section">
        <p className="settings-section-title">LLM Configuration</p>
        <div className="field-row">
          <label htmlFor="llmProvider">LLM Provider <Tip text="Provider used for requirement enhancement and generation." /></label>
          <select id="llmProvider" value={settings.llmProvider} onChange={(e) => onFieldChange('llmProvider', e.target.value)}>
            <option value="OpenAI">OpenAI</option>
            <option value="Anthropic">Anthropic</option>
            <option value="Gemini">Gemini</option>
            <option value="Groq">Groq (Free)</option>
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="llmModel">Model</label>
          <select id="llmModel" value={settings.llmModel} onChange={(e) => onFieldChange('llmModel', e.target.value)}>
            {availableModels.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="llmApiKey">LLM API Key</label>
          <input id="llmApiKey" type="password" value={settings.llmApiKey} onChange={(e) => onFieldChange('llmApiKey', e.target.value)} />
        </div>
      </div>

      <div className="settings-section">
        <p className="settings-section-title">Jira Configuration</p>
        <div className="field-row">
          <label htmlFor="jiraUrl">Jira URL</label>
          <input id="jiraUrl" type="text" placeholder="https://your-domain.atlassian.net" value={settings.jiraUrl} onChange={(e) => onFieldChange('jiraUrl', e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="jiraProjectKey">Jira Project Key</label>
          <input id="jiraProjectKey" type="text" placeholder="PROJ" value={settings.jiraProjectKey} onChange={(e) => onFieldChange('jiraProjectKey', e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="jiraEmail">Jira Email</label>
          <input id="jiraEmail" type="text" placeholder="user@company.com" value={settings.jiraEmail} onChange={(e) => onFieldChange('jiraEmail', e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="jiraApiToken">Jira API Token</label>
          <input id="jiraApiToken" type="password" value={settings.jiraApiToken} onChange={(e) => onFieldChange('jiraApiToken', e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="xrayClientId">Xray Client ID</label>
          <input id="xrayClientId" type="password" value={settings.xrayClientId} onChange={(e) => onFieldChange('xrayClientId', e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="xrayClientSecret">Xray Client Secret</label>
          <input id="xrayClientSecret" type="password" value={settings.xrayClientSecret} onChange={(e) => onFieldChange('xrayClientSecret', e.target.value)} />
        </div>
      </div>

      <div className="settings-section">
        <p className="settings-section-title">Xray Push Controls</p>
        <div className="field-row">
          <label htmlFor="xrayBatchSize">Batch Size <Tip text="How many test cases to push per batch. Lower values reduce timeout/rate-limit risk." /></label>
          <input id="xrayBatchSize" type="number" min={1} max={100} value={settings.xrayBatchSize} onChange={(e) => onFieldChange('xrayBatchSize', e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="xrayBatchDelayMs">Delay Between Batches (ms) <Tip text="Wait time between batch submissions to avoid API saturation." /></label>
          <input id="xrayBatchDelayMs" type="number" min={0} max={30000} value={settings.xrayBatchDelayMs} onChange={(e) => onFieldChange('xrayBatchDelayMs', e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="xrayMaxRetries">Max Retries <Tip text="Retry attempts for 429/503 rate-limit and service-unavailable responses." /></label>
          <input id="xrayMaxRetries" type="number" min={1} max={10} value={settings.xrayMaxRetries} onChange={(e) => onFieldChange('xrayMaxRetries', e.target.value)} />
        </div>
      </div>

      <div className="button-row">
        <button type="button" onClick={onSave} disabled={isBusy || !isSelfOwner} title={!isSelfOwner ? 'Only the Owner can save global settings' : undefined}>
          Save Settings
        </button>
        <button type="button" data-variant="secondary" onClick={onTestLlm} disabled={isBusy}>Test LLM</button>
        <button type="button" data-variant="secondary" onClick={onTestJira} disabled={isBusy}>Test Jira / Xray</button>
      </div>
      {!isSelfOwner && <p className="helper-text" style={{ marginTop: 4 }}>Settings are read-only — only the Owner can save changes.</p>}
      <p className="feedback">{feedback}</p>

      {/* ── Team Management (Owner/Admin only) ──────────────────────────────── */}
      {showTeam && (
        <div className="settings-section team-section">
          <p className="settings-section-title">Team</p>
          <p className="helper-text">Manage user roles and access. Role changes take effect within 60 seconds without requiring re-login.</p>

          {teamError && <p className="feedback feedback--error">{teamError}</p>}

          {teamLoading ? (
            <p className="helper-text">Loading team…</p>
          ) : (
            <table className="team-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  {isSelfOwner && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === authUser?.id;
                  const canChangeRole = isSelfOwner && !isSelf;
                  const canToggleStatus = (isSelfOwner || (userRole === 'ADMIN' && u.role !== 'OWNER' && u.role !== 'ADMIN')) && !isSelf;

                  return (
                    <tr key={u.id} className={!u.isActive ? 'team-row--inactive' : ''}>
                      <td>
                        {u.email}
                        {isSelf && <span className="team-you-chip">you</span>}
                      </td>
                      <td>
                        {canChangeRole ? (
                          <select
                            className="team-role-select"
                            value={u.role}
                            onChange={(e) => void handleRoleChange(u.id, e.target.value as OrgRole)}
                          >
                            {ORG_ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`role-badge role-badge--${u.role.toLowerCase()}`}>{ROLE_LABELS[u.role]}</span>
                        )}
                      </td>
                      <td>
                        <span className={u.isActive ? 'team-status team-status--active' : 'team-status team-status--inactive'}>
                          {u.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="team-lastlogin">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                      </td>
                      {isSelfOwner && (
                        <td>
                          {canToggleStatus ? (
                            <button
                              type="button"
                              className={`team-action-btn ${u.isActive ? 'team-action-btn--deactivate' : 'team-action-btn--activate'}`}
                              onClick={() => void handleStatusToggle(u.id, u.isActive)}
                            >
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          ) : (
                            <span className="helper-text">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
});
