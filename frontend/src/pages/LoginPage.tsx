import { useState, useRef, FormEvent } from 'react';
import { login, setAuthToken } from '../api/client';

interface LoginPageProps {
  onAuthenticated: () => void;
}

const FEATURE_PILLS = [
  { icon: 'ti-bolt',         text: '5-step AI generation pipeline — requirements to test cases' },
  { icon: 'ti-link',         text: 'Pull requirements & push test cases directly to your ALM — no copy-paste' },
  { icon: 'ti-robot',        text: 'Bring your own LLM — connect any AI provider, switch without disruption' },
  { icon: 'ti-file-text',    text: 'Upload any requirement format — documents, spreadsheets, slides and more' },
  { icon: 'ti-circle-check', text: 'Built-in approval workflows — route test cases for review before ALM push' },
];

export function LoginPage({ onAuthenticated }: LoginPageProps): JSX.Element {
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [forgotOpen, setForgotOpen]   = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await login(email.trim(), password);
      setAuthToken(token);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your credentials and try again.');
      emailRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">

      {/* ── Left: Brand Panel ─────────────────────────────────────────────── */}
      <div className="login-brand">
        <div className="login-brand-glow-top" aria-hidden="true" />
        <div className="login-brand-glow-bottom" aria-hidden="true" />

        <div className="login-brand-logo">
          <div className="login-brand-logo-icon" aria-label="TraceLMs Cloud logo">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <circle cx="12" cy="4.5" r="2.5" fill="white"/>
            <line x1="12" y1="7" x2="6" y2="17" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="12" y1="7" x2="18" y2="17" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="6" cy="19.5" r="2.5" fill="white"/>
            <circle cx="18" cy="19.5" r="2.5" fill="white"/>
          </svg>
        </div>
          <span className="login-brand-logo-name">
            trace<span className="login-brand-lms">LMs</span><span className="login-brand-cloud">Cloud</span>
          </span>
        </div>

        <h1 className="login-brand-heading">
          AI-Powered<br />
          <em>Test Generation</em><br />
          from Requirements
        </h1>

        <p className="login-brand-sub">
          Transform software requirements into structured test cases in minutes — with
          LLM-driven enhancement, scenario generation, automation analysis, and direct
          integration with your ALM.
        </p>

        <div className="login-powered-by">
          <span className="login-powered-label">Powered by</span>
          <span className="login-powered-providers">OpenAI · Anthropic · Gemini · Groq</span>
        </div>

        <div className="login-pills">
          {FEATURE_PILLS.map((pill) => (
            <div key={pill.text} className="login-pill">
              <span className="login-pill-icon">
                <i className={`ti ${pill.icon}`} />
              </span>
              <span className="login-pill-text">{pill.text}</span>
            </div>
          ))}
        </div>

        <div className="login-version">v0.1.0 — Early Access</div>
      </div>

      {/* ── Right: Form Panel ─────────────────────────────────────────────── */}
      <div className="login-form-panel">
        <div className="login-form-card">

          <div className="login-form-header">
            <h2 id="login-form-heading">Welcome back</h2>
            <p>Sign in to your TraceLMs Cloud workspace</p>
          </div>

          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate aria-labelledby="login-form-heading">

            <div className="login-field">
              <label htmlFor="login-email">Work Email</label>
              <input
                id="login-email"
                ref={emailRef}
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="login-field">
              <div className="login-field-row">
                <label htmlFor="login-password">Password</label>
                <button
                  type="button"
                  className="login-forgot"
                  onClick={() => setForgotOpen((v) => !v)}
                  tabIndex={0}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              {forgotOpen && (
                <p className="login-forgot-hint">
                  <i className="ti ti-info-circle" aria-hidden="true" />
                  Contact your administrator to reset your password.
                </p>
              )}
            </div>

            <div className="login-remember">
              <label className="login-remember-label">
                <input type="checkbox" disabled />
                Remember me
                <span className="login-sso-badge">Coming soon</span>
              </label>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <i className="ti ti-alert-circle" aria-hidden="true" />
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-submit"
              disabled={loading || !email.trim() || !password}
            >
              {loading
                ? <><i className="ti ti-loader-2 login-spinner" aria-hidden="true" /> Signing in…</>
                : <><i className="ti ti-login" aria-hidden="true" /> Sign in</>
              }
            </button>
          </form>

          <div className="login-divider"><span>or</span></div>

          <button type="button" className="login-sso" disabled title="SSO coming in a future release">
            <i className="ti ti-building" aria-hidden="true" />
            Continue with SSO
            <span className="login-sso-badge">Coming soon</span>
          </button>


        </div>
      </div>

    </div>
  );
}
