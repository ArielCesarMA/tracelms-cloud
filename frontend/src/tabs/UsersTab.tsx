import { useState, useEffect, useCallback } from 'react';
import { fetchUsers, updateUserRole, updateUserStatus, inviteUser } from '../api/client';
import type { AuthUser, OrgRole } from '../types';

const ROLE_OPTIONS: OrgRole[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];

const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER:  'Owner',
  ADMIN:  'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  OWNER:  'Full org control — can manage all users including other Owners',
  ADMIN:  'User management and settings — cannot touch Owner accounts',
  EDITOR: 'Generate, push to ALM, manage projects',
  VIEWER: 'Read-only access across all tabs',
};

interface UsersTabProps {
  currentUserId: string;
  currentUserRole: OrgRole;
}

interface InviteForm {
  email: string;
  role: OrgRole;
  temporaryPassword: string;
}

const INVITE_DEFAULTS: InviteForm = { email: '', role: 'EDITOR', temporaryPassword: '' };

export function UsersTab({ currentUserId, currentUserRole }: UsersTabProps): JSX.Element {
  const [users, setUsers]         = useState<AuthUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState<string | null>(null);

  // Invite modal state
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteForm, setInviteForm]   = useState<InviteForm>(INVITE_DEFAULTS);
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [showPassword, setShowPassword]   = useState(false);

  const isOwner = currentUserRole === 'OWNER';
  const canInvite = isOwner || currentUserRole === 'ADMIN';

  // Roles available to this inviter
  const inviteRoleOptions: OrgRole[] = isOwner
    ? ['ADMIN', 'EDITOR', 'VIEWER']
    : ['EDITOR', 'VIEWER'];

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { users: list } = await fetchUsers();
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleRoleChange(userId: string, role: OrgRole): Promise<void> {
    setSaving(userId);
    setError('');
    try {
      const { user: updated } = await updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => u.id === updated.id ? { ...u, role: updated.role } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Role update failed.');
    } finally {
      setSaving(null);
    }
  }

  async function handleStatusToggle(userId: string, isActive: boolean): Promise<void> {
    setSaving(userId);
    setError('');
    try {
      const { user: updated } = await updateUserStatus(userId, isActive);
      setUsers((prev) => prev.map((u) => u.id === updated.id ? { ...u, isActive: updated.isActive } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status update failed.');
    } finally {
      setSaving(null);
    }
  }

  async function handleInvite(): Promise<void> {
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);
    try {
      const { user: created } = await inviteUser(inviteForm.email, inviteForm.role, inviteForm.temporaryPassword);
      setUsers((prev) => [...prev, created]);
      setInviteSuccess(`Account created for ${created.email} with role ${ROLE_LABELS[created.role as OrgRole]}.`);
      setInviteForm(INVITE_DEFAULTS);
      setShowPassword(false);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Invite failed.');
    } finally {
      setInviteLoading(false);
    }
  }

  function closeInviteModal(): void {
    setShowInvite(false);
    setInviteForm(INVITE_DEFAULTS);
    setInviteError('');
    setInviteSuccess('');
    setShowPassword(false);
  }

  function canEditUser(target: AuthUser): boolean {
    if (target.id === currentUserId) return false;
    if (currentUserRole === 'OWNER') return true;
    if (currentUserRole === 'ADMIN' && (target.role === 'OWNER' || target.role === 'ADMIN')) return false;
    return currentUserRole === 'ADMIN';
  }

  return (
    <div className="users-tab">
      <div className="users-tab-header">
        <div>
          <h2 className="users-tab-title">Team Members</h2>
          <p className="users-tab-desc">
            Manage who has access to TraceLMs Cloud and what they can do.
            {!isOwner && ' Role changes require Owner access.'}
          </p>
        </div>
        <div className="users-tab-actions">
          {canInvite && (
            <button className="users-invite-btn" onClick={() => setShowInvite(true)}>
              <i className="ti ti-user-plus" aria-hidden="true" />
              Invite Member
            </button>
          )}
          <button className="users-tab-refresh" onClick={() => { void load(); }} title="Refresh" aria-label="Refresh user list">
            <i className="ti ti-refresh" aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <div className="users-tab-error" role="alert">
          <i className="ti ti-alert-circle" aria-hidden="true" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="users-tab-loading">
          <i className="ti ti-loader-2 users-spinner" aria-hidden="true" />
          Loading team members…
        </div>
      ) : (
        <div className="users-table-wrap">
          <table className="users-table" aria-label="Team members">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                {(isOwner || currentUserRole === 'ADMIN') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const editable = canEditUser(user);
                const isSelf   = user.id === currentUserId;
                const isBusy   = saving === user.id;

                return (
                  <tr key={user.id} className={`users-row${!user.isActive ? ' users-row--inactive' : ''}`}>

                    <td className="users-cell-email">
                      <div className="users-avatar" aria-hidden="true">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="users-email-block">
                        <span className="users-email">{user.email}</span>
                        {isSelf && <span className="users-self-badge">You</span>}
                      </div>
                    </td>

                    <td className="users-cell-role">
                      {editable && isOwner ? (
                        <select
                          className="users-role-select"
                          value={user.role}
                          disabled={isBusy}
                          onChange={(e) => { void handleRoleChange(user.id, e.target.value as OrgRole); }}
                          title={ROLE_DESCRIPTIONS[user.role as OrgRole]}
                          aria-label={`Role for ${user.email}`}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r} title={ROLE_DESCRIPTIONS[r]}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`users-role-badge users-role-badge--${(user.role ?? 'EDITOR').toLowerCase()}`}
                          title={ROLE_DESCRIPTIONS[(user.role ?? 'EDITOR') as OrgRole]}
                        >
                          {ROLE_LABELS[(user.role ?? 'EDITOR') as OrgRole]}
                        </span>
                      )}
                    </td>

                    <td className="users-cell-status">
                      <span className={`users-status-dot${user.isActive ? ' users-status-dot--active' : ' users-status-dot--inactive'}`} aria-hidden="true" />
                      <span className={user.isActive ? 'users-status-label' : 'users-status-label users-status-label--inactive'}>
                        {user.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>

                    <td className="users-cell-login">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="users-never">Never</span>}
                    </td>

                    {(isOwner || currentUserRole === 'ADMIN') && (
                      <td className="users-cell-actions">
                        {editable ? (
                          <button
                            className={`users-action-btn${user.isActive ? ' users-action-btn--deactivate' : ' users-action-btn--activate'}`}
                            disabled={isBusy}
                            onClick={() => { void handleStatusToggle(user.id, !user.isActive); }}
                            title={user.isActive ? 'Deactivate user' : 'Reactivate user'}
                            aria-label={user.isActive ? `Deactivate ${user.email}` : `Reactivate ${user.email}`}
                          >
                            {isBusy
                              ? <i className="ti ti-loader-2 users-spinner" aria-hidden="true" />
                              : user.isActive
                                ? <><i className="ti ti-user-off" aria-hidden="true" /> Deactivate</>
                                : <><i className="ti ti-user-check" aria-hidden="true" /> Reactivate</>
                            }
                          </button>
                        ) : (
                          <span className="users-no-action">—</span>
                        )}
                      </td>
                    )}

                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="users-table-footer">
            <span className="users-count">{users.length} member{users.length !== 1 ? 's' : ''}</span>
            <span className="users-hint">
              {isOwner
                ? 'Role changes take effect on next login.'
                : 'Contact your Owner to change roles.'}
            </span>
          </div>
        </div>
      )}

      {/* ── Invite Member modal ─────────────────────────────────────────────── */}
      {showInvite && (
        <div className="proj-modal-overlay" role="dialog" aria-modal="true" aria-label="Invite team member" onClick={(e) => { if (e.target === e.currentTarget) closeInviteModal(); }}>
          <div className="proj-modal users-invite-modal">
            <h3>Invite Team Member</h3>

            <div className="field-stack">
              <label className="invite-label" htmlFor="invite-email">Email address</label>
              <input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                required
                autoFocus
              />
            </div>

            <div className="field-stack">
              <label className="invite-label" htmlFor="invite-role">Role</label>
              <select
                id="invite-role"
                value={inviteForm.role}
                onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as OrgRole }))}
              >
                {inviteRoleOptions.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}</option>
                ))}
              </select>
            </div>

            <div className="field-stack">
              <label className="invite-label" htmlFor="invite-pw">Temporary password</label>
              <div className="invite-pw-wrap">
                <input
                  id="invite-pw"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={inviteForm.temporaryPassword}
                  onChange={(e) => setInviteForm((f) => ({ ...f, temporaryPassword: e.target.value }))}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className="invite-pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true" />
                </button>
              </div>
              <p className="helper-text">Share credentials with the user directly — no email is sent automatically.</p>
            </div>

            {inviteError   && <p className="feedback feedback--error">{inviteError}</p>}
            {inviteSuccess && <p className="feedback feedback--success">{inviteSuccess}</p>}

            <div className="button-row">
              <button type="button" onClick={() => { void handleInvite(); }} disabled={inviteLoading}>
                {inviteLoading ? 'Creating…' : 'Create Account'}
              </button>
              <button type="button" data-variant="secondary" onClick={closeInviteModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
