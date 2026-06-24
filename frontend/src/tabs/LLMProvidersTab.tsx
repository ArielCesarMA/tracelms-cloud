import { memo } from 'react';
import { llmModelsByProvider } from '../types';

const PROVIDER_META: Record<string, { baseUrl: string; compatibility: string; free: boolean }> = {
  Gemini:    { baseUrl: 'generativelanguage.googleapis.com', compatibility: 'Gemini REST', free: true },
  OpenAI:    { baseUrl: 'api.openai.com/v1',                compatibility: 'OpenAI',       free: false },
  Anthropic: { baseUrl: 'api.anthropic.com/v1',             compatibility: 'Anthropic',    free: false },
  Groq:      { baseUrl: 'api.groq.com/openai/v1',           compatibility: 'OpenAI',       free: true },
};

export const LLMProvidersTab = memo(function LLMProvidersTab(): JSX.Element {
  const providers = Object.entries(llmModelsByProvider);

  return (
    <section className="panel">
      <h2>LLM Providers</h2>
      <p className="helper-text">
        Built-in providers are available out of the box. OpenAI-compatible providers can be added
        in a future release — any service that exposes a <code>/chat/completions</code> endpoint
        works with TraceLMs Cloud.
      </p>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Base URL</th>
              <th>Compatibility</th>
              <th>Models</th>
              <th>Free Tier</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {providers.map(([name, models]) => {
              const meta = PROVIDER_META[name];
              return (
                <tr key={name}>
                  <td style={{ fontWeight: 600 }}>{name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {meta?.baseUrl ?? '—'}
                  </td>
                  <td>
                    <span className="scn-badge scn-badge--af">{meta?.compatibility ?? '—'}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                    {models.join(', ')}
                  </td>
                  <td>
                    {meta?.free
                      ? <span className="scn-badge scn-badge--hp">Yes</span>
                      : <span className="scn-badge scn-badge--low">Paid</span>}
                  </td>
                  <td>
                    <span className="scn-badge scn-badge--hp">Active</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="coming-soon-note">
        <span className="coming-soon-icon">+</span>
        <div>
          <strong>Add Custom Provider</strong>
          <p>Support for user-defined OpenAI-compatible providers (Mistral, Together AI, Ollama, etc.)
          is planned for a future release. Any provider with a <code>/chat/completions</code> endpoint
          and <code>Bearer</code> token auth will be supported.</p>
        </div>
      </div>
    </section>
  );
});
