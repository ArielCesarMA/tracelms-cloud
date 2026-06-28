import { useEffect, useState } from 'react';
import { llmModelsByProvider, modelMeta, ModelTier } from '../types';
import type { ModelScore } from '../types';
import { fetchModelScores } from '../api/client';
import { ComingSoonBanner } from '../components/ComingSoonBanner';

const TIER_BADGE: Record<ModelTier, string> = {
  'fast':         'scn-badge--fast',
  'economy':      'scn-badge--economy',
  'balanced':     'scn-badge--balanced',
  'best-quality': 'scn-badge--quality',
};

const TIER_LABEL: Record<ModelTier, string> = {
  'fast':         'Fast',
  'economy':      'Economy',
  'balanced':     'Balanced',
  'best-quality': 'Best Quality',
};

const PROVIDER_META: Record<string, { baseUrl: string; compatibility: string; free: boolean }> = {
  Gemini:    { baseUrl: 'generativelanguage.googleapis.com', compatibility: 'Gemini REST', free: true },
  OpenAI:    { baseUrl: 'api.openai.com/v1',                compatibility: 'OpenAI',       free: false },
  Anthropic: { baseUrl: 'api.anthropic.com/v1',             compatibility: 'Anthropic',    free: false },
  Groq:      { baseUrl: 'api.groq.com/openai/v1',           compatibility: 'OpenAI',       free: true },
};

export function LLMProvidersTab(): JSX.Element {
  const providers = Object.entries(llmModelsByProvider);
  const [scores, setScores] = useState<ModelScore[]>([]);
  const [scoresLoading, setScoresLoading] = useState(true);

  useEffect(() => {
    fetchModelScores()
      .then(({ scores: s }) => setScores(s))
      .catch(() => { /* no data yet — silent */ })
      .finally(() => setScoresLoading(false));
  }, []);

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
              <th>Model</th>
              <th>Tier</th>
              <th>Base URL</th>
              <th>Compatibility</th>
              <th>Free Tier</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {providers.flatMap(([name, models]) => {
              const meta = PROVIDER_META[name];
              return models.map((model, idx) => {
                const mm = modelMeta[model];
                const tier = mm?.tier ?? 'balanced';
                return (
                  <tr key={model}>
                    {idx === 0 && (
                      <td rowSpan={models.length} style={{ fontWeight: 600, verticalAlign: 'top', paddingTop: 'var(--space-3)' }}>
                        {name}
                      </td>
                    )}
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{model}</td>
                    <td>
                      <span className={`scn-badge ${TIER_BADGE[tier]}`}>{TIER_LABEL[tier]}</span>
                      {mm?.isReasoningModel && (
                        <span className="scn-badge scn-badge--reasoning" style={{ marginLeft: 4 }}>Reasoning</span>
                      )}
                    </td>
                    {idx === 0 && (
                      <>
                        <td rowSpan={models.length} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', verticalAlign: 'top', paddingTop: 'var(--space-3)' }}>
                          {meta?.baseUrl ?? '—'}
                        </td>
                        <td rowSpan={models.length} style={{ verticalAlign: 'top', paddingTop: 'var(--space-3)' }}>
                          <span className="scn-badge scn-badge--af">{meta?.compatibility ?? '—'}</span>
                        </td>
                        <td rowSpan={models.length} style={{ verticalAlign: 'top', paddingTop: 'var(--space-3)' }}>
                          {meta?.free
                            ? <span className="scn-badge scn-badge--hp">Yes</span>
                            : <span className="scn-badge scn-badge--low">Paid</span>}
                        </td>
                        <td rowSpan={models.length} style={{ verticalAlign: 'top', paddingTop: 'var(--space-3)' }}>
                          <span className="scn-badge scn-badge--hp">Active</span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {/* ── Model Scoring ──────────────────────────────────────────────────── */}
      {!scoresLoading && scores.length > 0 && (
        <div className="model-scoring-card">
          <h3 className="model-scoring-title">
            <i className="ti ti-chart-bar" aria-hidden="true" />
            Model Usage Analytics
          </h3>
          <div className="table-wrap" style={{ marginTop: 'var(--space-3)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Model</th>
                  <th style={{ textAlign: 'right' }}>Runs</th>
                  <th style={{ textAlign: 'right' }}>Avg Tokens</th>
                  <th style={{ textAlign: 'right' }}>Avg Prompt</th>
                  <th style={{ textAlign: 'right' }}>Avg Completion</th>
                  <th style={{ textAlign: 'right' }}>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={`${s.provider}-${s.model}`}>
                    <td style={{ fontWeight: 600 }}>{s.provider}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{s.model}</td>
                    <td style={{ textAlign: 'right' }}>{s.runs.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{s.avgTokens.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{s.avgPromptTokens.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{s.avgCompletionTokens.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`scn-badge ${s.successRate >= 90 ? 'scn-badge--hp' : s.successRate >= 70 ? 'scn-badge--balanced' : 'scn-badge--low'}`}>
                        {s.successRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ComingSoonBanner
        icon="🔌"
        hint="Custom provider management planned for Phase 4 — LLM Provider Management"
      />
    </section>
  );
}
