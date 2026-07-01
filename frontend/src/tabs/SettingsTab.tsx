import { memo } from 'react';
import { Tip } from '../components/Tip';
import { type Settings } from '../types';
import { useAuth, canManageUsers } from '../contexts/AuthContext';

type Props = {
  settings: Settings;
  availableModels: string[];
  isBusy: boolean;
  feedback: string;
  onFieldChange: (key: keyof Settings, value: string) => void;
  onSave: () => void;
  onTestLlm: () => void;
  onTestJira: () => void;
  section: 'llm' | 'jira';
};

export const SettingsTab = memo(function SettingsTab({
  settings, availableModels, isBusy, feedback, onFieldChange, onSave, onTestLlm, onTestJira, section,
}: Props): JSX.Element {
  const { user: authUser } = useAuth();
  const isSelfOwner = canManageUsers(authUser?.role);

  return (
    <section className="panel">
      <h2>{section === 'llm' ? 'LLM Settings' : 'Jira & Xray'}</h2>
      <p className="helper-text" style={{ marginBottom: 'var(--space-5)' }}>
        {section === 'llm'
          ? 'Org-wide LLM provider and API key. All users share this configuration for generation.'
          : 'Org-wide connection to Jira and Xray. Credentials are encrypted at rest. The default project key is a fallback — per-project keys are set in the Projects tab.'}
      </p>

      {section === 'llm' && (
        <div className="settings-section">
          <p className="settings-section-title">LLM Configuration</p>
          <div className="field-row">
            <label htmlFor="llmProvider">LLM Provider <Tip text="Provider used for requirement enhancement and generation." /></label>
            <select id="llmProvider" value={settings.llmProvider} onChange={(e) => onFieldChange('llmProvider', e.target.value)} disabled={!isSelfOwner}>
              <option value="OpenAI">OpenAI</option>
              <option value="Anthropic">Anthropic</option>
              <option value="Gemini">Gemini</option>
              <option value="Groq">Groq (Free)</option>
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="llmModel">Model</label>
            <select id="llmModel" value={settings.llmModel} onChange={(e) => onFieldChange('llmModel', e.target.value)} disabled={!isSelfOwner}>
              {availableModels.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="llmApiKey">API Key</label>
            <input id="llmApiKey" type="password" value={settings.llmApiKey} onChange={(e) => onFieldChange('llmApiKey', e.target.value)} disabled={!isSelfOwner} />
          </div>
        </div>
      )}

      {section === 'jira' && (
        <>
          <div className="settings-section">
            <p className="settings-section-title">Jira Connection</p>
            <div className="field-row">
              <label htmlFor="jiraUrl">Jira URL</label>
              <input id="jiraUrl" type="text" placeholder="https://your-domain.atlassian.net" value={settings.jiraUrl} onChange={(e) => onFieldChange('jiraUrl', e.target.value)} disabled={!isSelfOwner} />
            </div>
            <div className="field-row">
              <label htmlFor="jiraEmail">Jira Email</label>
              <input id="jiraEmail" type="text" placeholder="service-account@company.com" value={settings.jiraEmail} onChange={(e) => onFieldChange('jiraEmail', e.target.value)} disabled={!isSelfOwner} />
            </div>
            <div className="field-row">
              <label htmlFor="jiraApiToken">Jira API Token</label>
              <input id="jiraApiToken" type="password" value={settings.jiraApiToken} onChange={(e) => onFieldChange('jiraApiToken', e.target.value)} disabled={!isSelfOwner} />
            </div>
            <div className="field-row">
              <label htmlFor="jiraProjectKey">Default Project Key <Tip text="Fallback Jira project key when no per-project key is set. Each TraceLMs project can override this." /></label>
              <input id="jiraProjectKey" type="text" placeholder="PROJ" value={settings.jiraProjectKey} onChange={(e) => onFieldChange('jiraProjectKey', e.target.value)} disabled={!isSelfOwner} />
            </div>
          </div>

          <div className="settings-section">
            <p className="settings-section-title">Xray Credentials</p>
            <div className="field-row">
              <label htmlFor="xrayClientId">Client ID</label>
              <input id="xrayClientId" type="password" value={settings.xrayClientId} onChange={(e) => onFieldChange('xrayClientId', e.target.value)} disabled={!isSelfOwner} />
            </div>
            <div className="field-row">
              <label htmlFor="xrayClientSecret">Client Secret</label>
              <input id="xrayClientSecret" type="password" value={settings.xrayClientSecret} onChange={(e) => onFieldChange('xrayClientSecret', e.target.value)} disabled={!isSelfOwner} />
            </div>
          </div>

          <div className="settings-section">
            <p className="settings-section-title">Xray Push Controls</p>
            <div className="field-row">
              <label htmlFor="xrayBatchSize">Batch Size <Tip text="How many test cases to push per batch. Lower values reduce timeout/rate-limit risk." /></label>
              <input id="xrayBatchSize" type="number" min={1} max={100} value={settings.xrayBatchSize} onChange={(e) => onFieldChange('xrayBatchSize', e.target.value)} disabled={!isSelfOwner} />
            </div>
            <div className="field-row">
              <label htmlFor="xrayBatchDelayMs">Delay Between Batches (ms) <Tip text="Wait time between batch submissions to avoid API saturation." /></label>
              <input id="xrayBatchDelayMs" type="number" min={0} max={30000} value={settings.xrayBatchDelayMs} onChange={(e) => onFieldChange('xrayBatchDelayMs', e.target.value)} disabled={!isSelfOwner} />
            </div>
            <div className="field-row">
              <label htmlFor="xrayMaxRetries">Max Retries <Tip text="Retry attempts for 429/503 rate-limit and service-unavailable responses." /></label>
              <input id="xrayMaxRetries" type="number" min={1} max={10} value={settings.xrayMaxRetries} onChange={(e) => onFieldChange('xrayMaxRetries', e.target.value)} disabled={!isSelfOwner} />
            </div>
          </div>
        </>
      )}

      <div className="button-row">
        <button
          type="button"
          onClick={onSave}
          disabled={isBusy || !isSelfOwner}
          title={!isSelfOwner ? 'Only the Owner can save global settings' : undefined}
        >
          Save
        </button>
        {section === 'llm' && (
          <button type="button" data-variant="secondary" onClick={onTestLlm} disabled={isBusy}>Test connection</button>
        )}
        {section === 'jira' && (
          <button type="button" data-variant="secondary" onClick={onTestJira} disabled={isBusy}>Test connection</button>
        )}
      </div>
      {!isSelfOwner && (
        <p className="helper-text" style={{ marginTop: 4 }}>
          Read-only — only the Owner can save global settings.
        </p>
      )}
      <p className="feedback">{feedback}</p>
    </section>
  );
});
