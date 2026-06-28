import { useState, useEffect } from 'react';
import type { OrgRole, Settings } from '../types';
import { UsersTab }       from '../tabs/UsersTab';
import { LLMProvidersTab } from '../tabs/LLMProvidersTab';
import { PromptsTab }     from '../tabs/PromptsTab';
import { SettingsTab }    from '../tabs/SettingsTab';
import { ErrorBoundary }  from '../components/ErrorBoundary';

// ─── Nav tree definition ──────────────────────────────────────────────────────

type AdminLeaf = {
  id: string;
  label: string;
  icon: string;
  built: boolean;
};

type AdminGroup = {
  id: string;
  label: string;
  icon: string;
  ownerOnly?: boolean;
  items: AdminLeaf[];
};

const NAV_GROUPS: AdminGroup[] = [
  {
    id: 'people',
    label: 'People',
    icon: 'ti-users',
    items: [
      { id: 'users',             label: 'Users',              icon: 'ti-user',            built: true  },
      { id: 'roles',             label: 'Roles & Permissions', icon: 'ti-shield-lock',    built: false },
    ],
  },
  {
    id: 'ai-config',
    label: 'AI Configuration',
    icon: 'ti-brain',
    items: [
      { id: 'llm-settings',      label: 'LLM Settings',       icon: 'ti-sliders',         built: true  },
      { id: 'prompts',           label: 'Prompts',            icon: 'ti-message-bolt',    built: true  },
      { id: 'output-templates',  label: 'Output Templates',   icon: 'ti-template',        built: false },
      { id: 'llm-providers',    label: 'LLM Providers',      icon: 'ti-cpu',             built: true  },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: 'ti-plug',
    items: [
      { id: 'jira',              label: 'Jira',               icon: 'ti-brand-atlassian', built: true  },
      { id: 'azure-devops',      label: 'Azure DevOps',       icon: 'ti-brand-azure',     built: false },
      { id: 'github',            label: 'GitHub',             icon: 'ti-brand-github',    built: false },
    ],
  },
  {
    id: 'audit',
    label: 'Audit Logs',
    icon: 'ti-clipboard-list',
    items: [
      { id: 'audit-logs',        label: 'Audit Logs',         icon: 'ti-clipboard-list',  built: false },
    ],
  },
  {
    id: 'system',
    label: 'System Settings',
    icon: 'ti-adjustments',
    ownerOnly: true,
    items: [
      { id: 'sys-general',       label: 'General',            icon: 'ti-settings',        built: false },
      { id: 'sys-security',      label: 'Security',           icon: 'ti-lock',            built: false },
      { id: 'sys-notifications', label: 'Notifications',      icon: 'ti-bell',            built: false },
      { id: 'sys-branding',      label: 'Branding',           icon: 'ti-palette',         built: false },
      { id: 'sys-proj-defaults', label: 'Project Defaults',   icon: 'ti-folder-cog',      built: false },
      { id: 'sys-numbering',     label: 'Numbering',          icon: 'ti-list-numbers',    built: false },
      { id: 'sys-flags',         label: 'Feature Flags',      icon: 'ti-flag',            built: false },
      { id: 'sys-backup',        label: 'Backup & Maintenance', icon: 'ti-database',      built: false },
    ],
  },
];

const ADMIN_HIDDEN_GROUPS = new Set(['system']);

// ─── Coming-soon stub ─────────────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }): JSX.Element {
  return (
    <div className="admin-coming-soon">
      <i className="ti ti-rocket admin-coming-soon-icon" aria-hidden="true" />
      <h3 className="admin-coming-soon-title">{label}</h3>
      <p className="admin-coming-soon-desc">
        This feature is on the roadmap and will be available in a future release.
      </p>
      <span className="admin-coming-soon-chip">Coming soon</span>
    </div>
  );
}

// ─── AdminNavGroup ────────────────────────────────────────────────────────────

function AdminNavGroup({
  group,
  activeId,
  onSelect,
  defaultOpen,
}: {
  group: AdminGroup;
  activeId: string;
  onSelect: (id: string) => void;
  defaultOpen: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const hasActive = group.items.some((i) => i.id === activeId);

  useEffect(() => { if (hasActive) setOpen(true); }, [hasActive]);

  return (
    <div className="admin-nav-group">
      <button
        className={`admin-nav-group-header${hasActive ? ' admin-nav-group-header--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <i className={`ti ${group.icon} admin-nav-group-icon`} aria-hidden="true" />
        <span className="admin-nav-group-label">{group.label}</span>
        <i className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'} admin-nav-chevron`} aria-hidden="true" />
      </button>

      {open && (
        <ul className="admin-nav-items" role="list">
          {group.items.map((item) => (
            <li key={item.id}>
              <button
                className={`admin-nav-item${activeId === item.id ? ' admin-nav-item--active' : ''}${!item.built ? ' admin-nav-item--soon' : ''}`}
                onClick={() => onSelect(item.id)}
                aria-current={activeId === item.id ? 'page' : undefined}
              >
                <i className={`ti ${item.icon} admin-nav-item-icon`} aria-hidden="true" />
                <span>{item.label}</span>
                {!item.built && <span className="admin-nav-soon-dot" aria-label="Coming soon" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── AdminPage props ──────────────────────────────────────────────────────────

interface AdminPageProps {
  currentUserRole: OrgRole;
  currentUserId: string;
  onBack: () => void;
  // SettingsTab (Jira / Integrations)
  settings: Settings;
  availableModels: string[];
  isBusy: boolean;
  feedback: string;
  onFieldChange: (key: keyof Settings, value: string) => void;
  onSave: () => void;
  onTestLlm: () => void;
  onTestJira: () => void;
  // PromptsTab
  activeProjectId: string | null;
  activeProjectName: string | null;
}

// ─── AdminPage ────────────────────────────────────────────────────────────────

export function AdminPage({
  currentUserRole,
  currentUserId,
  onBack,
  settings,
  availableModels,
  isBusy,
  feedback,
  onFieldChange,
  onSave,
  onTestLlm,
  onTestJira,
  activeProjectId,
  activeProjectName,
}: AdminPageProps): JSX.Element {
  const isOwner = currentUserRole === 'OWNER';

  const visibleGroups = NAV_GROUPS.filter((g) =>
    isOwner ? true : !ADMIN_HIDDEN_GROUPS.has(g.id)
  );

  const firstBuilt = visibleGroups.flatMap((g) => g.items).find((i) => i.built);
  const [activeId, setActiveId] = useState(firstBuilt?.id ?? 'users');

  const activeItem  = visibleGroups.flatMap((g) => g.items).find((i) => i.id === activeId);
  const activeGroup = visibleGroups.find((g) => g.items.some((i) => i.id === activeId));

  function renderContent(): JSX.Element {
    if (!activeItem?.built) return <ComingSoon label={activeItem?.label ?? ''} />;

    switch (activeId) {
      case 'users':
        return (
          <ErrorBoundary tabName="Users">
            <UsersTab currentUserId={currentUserId} currentUserRole={currentUserRole} />
          </ErrorBoundary>
        );
      case 'llm-providers':
        return (
          <ErrorBoundary tabName="LLM Providers">
            <LLMProvidersTab />
          </ErrorBoundary>
        );
      case 'prompts':
        return (
          <ErrorBoundary tabName="Prompts">
            <PromptsTab activeProjectId={activeProjectId} activeProjectName={activeProjectName} />
          </ErrorBoundary>
        );
      case 'llm-settings':
        return (
          <ErrorBoundary tabName="LLM Settings">
            <SettingsTab
              settings={settings}
              availableModels={availableModels}
              isBusy={isBusy}
              feedback={feedback}
              onFieldChange={onFieldChange}
              onSave={onSave}
              onTestLlm={onTestLlm}
              onTestJira={onTestJira}
              section="llm"
            />
          </ErrorBoundary>
        );
      case 'jira':
        return (
          <ErrorBoundary tabName="Jira & Xray">
            <SettingsTab
              settings={settings}
              availableModels={availableModels}
              isBusy={isBusy}
              feedback={feedback}
              onFieldChange={onFieldChange}
              onSave={onSave}
              onTestLlm={onTestLlm}
              onTestJira={onTestJira}
              section="jira"
            />
          </ErrorBoundary>
        );
      default:
        return <ComingSoon label={activeItem?.label ?? ''} />;
    }
  }

  return (
    <div className="admin-page">

      {/* ── Admin nav ─────────────────────────────────────────────────────── */}
      <aside className="admin-nav" aria-label="Administration navigation">
        <div className="admin-nav-header">
          <button className="admin-back-btn" onClick={onBack} aria-label="Back to app">
            <i className="ti ti-arrow-left" aria-hidden="true" />
          </button>
          <span className="admin-nav-title">Administration</span>
        </div>

        <nav className="admin-nav-body">
          {visibleGroups.map((group) => (
            <AdminNavGroup
              key={group.id}
              group={group}
              activeId={activeId}
              onSelect={setActiveId}
              defaultOpen={group.items.some((i) => i.id === activeId)}
            />
          ))}
        </nav>

        <div className="admin-nav-footer">
          <span className={`admin-nav-role-badge admin-nav-role-badge--${currentUserRole.toLowerCase()}`}>
            {currentUserRole}
          </span>
        </div>
      </aside>

      {/* ── Admin content ─────────────────────────────────────────────────── */}
      <main className="admin-content" aria-label={activeItem?.label ?? 'Administration'}>
        <div className="admin-content-header">
          <div>
            <p className="admin-breadcrumb">
              Administration
              {activeGroup && <> / {activeGroup.label}</>}
            </p>
            <h1 className="admin-content-title">{activeItem?.label ?? 'Administration'}</h1>
          </div>
        </div>

        <div className="admin-content-body">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
