import { memo } from 'react';

const PIPELINE_STEPS = [
  { step: 1, label: 'Requirements',  desc: 'Paste or upload your requirement document (.txt, .md, .docx, .pdf) or pull directly from Jira.' },
  { step: 2, label: 'Enhancement',   desc: 'AI analyses your requirements and surfaces missing functional/non-functional items, risks, and clarifying questions.' },
  { step: 3, label: 'Scenarios',     desc: 'Generates structured test scenarios (Happy Path, Alternate Flow, Edge Case, Error/Exception, Business Rule) with priority ratings.' },
  { step: 4, label: 'Test Cases',    desc: 'Expands each scenario into detailed Xray-ready test cases with Gherkin syntax, steps, expected results, and test data.' },
  { step: 5, label: 'Automation',    desc: 'Analyses every test case for automation feasibility, ROI score, Playwright suitability, and recommended execution order.' },
];

const PROVIDERS = [
  { name: 'Google Gemini',  models: 'gemini-2.0-flash, gemini-2.5-flash, gemini-2.5-pro', free: true,  note: 'Free tier: 15 RPM / 1,500 req/day' },
  { name: 'Groq',           models: 'llama-3.3-70b-versatile, mixtral-8x7b, gemma2-9b',   free: true,  note: 'Very generous free tier, no daily cap' },
  { name: 'OpenAI',         models: 'gpt-4o, gpt-4.1, gpt-4.1-mini, gpt-4o-mini',         free: false, note: 'Pay-per-token, no free tier' },
  { name: 'Anthropic',      models: 'claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus',  free: false, note: 'Pay-per-token, no free tier' },
];

export const GuideTab = memo(function GuideTab(): JSX.Element {
  return (
    <section className="panel">
      <h2>Guide</h2>

      {/* What is TraceLMs Cloud */}
      <div className="guide-section">
        <h3>What is TraceLMs Cloud?</h3>
        <p className="helper-text" style={{ marginBottom: 0 }}>
          TraceLMs Cloud is an AI-powered test generation platform that converts software requirements
          into production-ready Xray test cases. It integrates with Jira and Xray via REST API,
          supports multiple LLM providers, and processes requirement documents in .txt, .md, .docx,
          and .pdf formats. The entire pipeline — from raw requirements to automation analysis — runs
          in five sequential steps with full streaming output so you see progress in real time.
        </p>
      </div>

      {/* Pipeline */}
      <div className="guide-section">
        <h3>The 5-Step Pipeline</h3>
        <div className="guide-pipeline">
          {PIPELINE_STEPS.map(({ step, label, desc }) => (
            <div key={step} className="guide-pipeline-step">
              <div className="guide-step-dot">{step}</div>
              <div className="guide-step-body">
                <strong>{label}</strong>
                <p>{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="helper-text" style={{ marginTop: 'var(--space-3)' }}>
          Use <strong>Generate All</strong> to run all five steps automatically in the optimal order
          (Enhancement + Scenarios run in parallel, then Test Cases, then Automation). Or run each
          step individually from its own tab.
        </p>
      </div>

      {/* LLM Providers */}
      <div className="guide-section">
        <h3>Supported LLM Providers</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Recommended Models</th>
                <th>Free Tier</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.map(({ name, models, free, note }) => (
                <tr key={name}>
                  <td style={{ fontWeight: 600 }}>{name}</td>
                  <td style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{models}</td>
                  <td>
                    {free
                      ? <span className="scn-badge scn-badge--hp">Yes</span>
                      : <span className="scn-badge scn-badge--low">Paid</span>}
                  </td>
                  <td style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Jira / Xray */}
      <div className="guide-section">
        <h3>Jira / Xray Integration</h3>
        <p className="helper-text" style={{ marginBottom: 'var(--space-3)' }}>
          TraceLMs Cloud pushes generated test cases to Xray (Cloud) via its REST API. Configure
          your credentials in <strong>Settings → Integrations</strong> before pushing.
        </p>
        <ul className="guide-list">
          <li><strong>Jira URL</strong> — your Atlassian domain, e.g. <code>https://company.atlassian.net</code></li>
          <li><strong>Jira Project Key</strong> — the project where test issues will be created</li>
          <li><strong>Jira Email + API Token</strong> — used for Jira REST API authentication</li>
          <li><strong>Xray Client ID + Secret</strong> — from the Xray API Keys page in Jira settings</li>
        </ul>
        <p className="helper-text" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
          Duplicate test cases are detected via fingerprints and skipped automatically. Push history
          is tracked per session. Batch size and retry controls are configurable in Integrations.
        </p>
      </div>

      {/* Version */}
      <div className="guide-section guide-section--last">
        <h3>Version</h3>
        <p className="helper-text" style={{ marginBottom: 0 }}>
          TraceLMs Cloud <strong>v0.1.0</strong> — Storage layer powered by Supabase (PostgreSQL) + Prisma.
          Frontend: React 18 + Vite 5. Backend: Node.js 20 + Express 4 + TypeScript 5.5.
        </p>
      </div>
    </section>
  );
});
