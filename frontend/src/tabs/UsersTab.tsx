import { useState, useEffect, useCallback } from 'react';
import { fetchUsers, updateUserRole, updateUserStatus } from '../api/client';
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

export function UsersTab({ currentUserId, currentUserRole }: UsersTabProps): JSX.Element {
  const [users, setUsers]     = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState<string | null>(null); // userId being patched

  const isOwner = currentUserRole === 'OWNER';

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

  function canEditUser(target: AuthUser): boolean {
    if (target.id === currentUserId) return false; // cannot edit self
    if (currentUserRole === 'OWNER') return true;
    // ADMIN cannot edit OWNER or ADMIN accounts
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
        <button className="users-tab-refresh" onClick={() => { void load(); }} title="Refresh" aria-label="Refresh user list">
          <i className="ti ti-refresh" aria-hidden="true" />
        </button>
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

                    {/* Email + self badge */}
                    <td className="users-cell-email">
                      <div className="users-avatar" aria-hidden="true">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="users-email-block">
                        <span className="users-email">{user.email}</span>
                        {isSelf && <span className="users-self-badge">You</span>}
                      </div>
                    </td>

                    {/* Role — dropdown for editable rows, badge for others */}
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

                    {/* Active status */}
                    <td className="users-cell-status">
                      <span className={`users-status-dot${user.isActive ? ' users-status-dot--active' : ' users-status-dot--inactive'}`} aria-hidden="true" />
                      <span className={user.isActive ? 'users-status-label' : 'users-status-label users-status-label--inactive'}>
                        {user.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>

                    {/* Last login */}
                    <td className="users-cell-login">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="users-never">Never</span>}
                    </td>

                    {/* Actions — deactivate/reactivate */}
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
    </div>
  );
}
