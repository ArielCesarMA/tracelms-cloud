import { useState, useRef, useEffect, FormEvent } from 'react';
import { login, setAuthToken, getPublicStats, type PublicTestimonial } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { FeedbackMessage } from '../components/FeedbackMessage';

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

// Inline SVGs — aria-hidden, white at 85% opacity to match provider text
const JiraSVG = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="login-integration-icon">
    <path d="M11.975 2L6 8.1l2.55 2.6 3.425-3.5 3.425 3.5L18 8.1 11.975 2z" fill="white" fillOpacity="0.85"/>
    <path d="M11.975 22L18 15.9l-2.55-2.6-3.425 3.5-3.425-3.5L6 15.9 11.975 22z" fill="white" fillOpacity="0.85"/>
    <path d="M9.3 12l2.675-2.73L14.65 12l-2.675 2.73L9.3 12z" fill="white" fillOpacity="0.85"/>
  </svg>
);

const XraySVG = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="login-integration-icon">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke="white" strokeOpacity="0.85" strokeWidth="1.8"/>
    <path d="M7 8.5l3.5 3.5L7 15.5" stroke="white" strokeOpacity="0.85" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13 15.5h4" stroke="white" strokeOpacity="0.85" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

export function LoginPage({ onAuthenticated }: LoginPageProps): JSX.Element {
  const { refetch } = useAuth();
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [error, setError]             = useState('');
  const [errorDetail, setErrorDetail]  = useState('');
  const [loading, setLoading]         = useState(false);
  const [forgotOpen, setForgotOpen]   = useState(false);
  const [generationsCount, setGenerationsCount] = useState<number>(0);
  const [testimonials, setTestimonials]         = useState<PublicTestimonial[]>([]);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPublicStats().then(({ generationsCount: count, testimonials: tList }) => {
      setGenerationsCount(count);
      setTestimonials(tList);
    }).catch(() => { /* silent — login page must always render */ });
  }, []);

  function detectLoginError(raw: string): string {
    const r = raw.toLowerCase();
    if (r.includes('failed to fetch') || r.includes('network error') || r.includes('networkerror') ||
        r.includes('err_connection') || r.includes('err_network') || r.includes('econnrefused')) {
      return 'Unable to reach the server. Check your internet connection and try again.';
    }
    if (r.includes('502') || r.includes('503') || r.includes('504') || r.includes('bad gateway') ||
        r.includes('service unavailable') || r.includes('gateway timeout')) {
      return 'The server is temporarily unavailable. Please try again in a moment.';
    }
    if (r.includes('401') || r.includes('invalid credentials') || r.includes('invalid email') ||
        r.includes('invalid password') || r.includes('wrong password') || r.includes('user not found')) {
      return 'Incorrect email or password. Please try again.';
    }
    if (r.includes('too many') || r.includes('rate limit') || r.includes('429')) {
      return 'Too many sign-in attempts. Wait a moment, then try again.';
    }
    return 'Sign in failed. Check your credentials and try again.';
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setErrorDetail('');
    setLoading(true);
    try {
      const { token } = await login(email.trim(), password);
      setAuthToken(token);
      await refetch(); // populate AuthContext with user data (role, id) before AppInner mounts
      onAuthenticated();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Login failed.';
      setError(detectLoginError(raw));
      setErrorDetail(raw);
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

        {/* Trust stack: infrastructure proof + integration proof */}
        <div className="login-trust-stack">
          <div className="login-powered-by">
            <span className="login-powered-label">Powered by</span>
            <span className="login-powered-providers">OpenAI · Anthropic · Gemini · Groq</span>
          </div>
          <div className="login-integrates-with">
            <span className="login-powered-label">Integrates with</span>
            <span className="login-integration-badges">
              <span className="login-integration-badge">
                <JiraSVG />
                <span>Jira</span>
              </span>
              <span className="login-integration-sep">·</span>
              <span className="login-integration-badge">
                <XraySVG />
                <span>Xray</span>
              </span>
            </span>
          </div>
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

        {/* Usage counter — only renders when volume is meaningful enough for social proof */}
        {generationsCount >= 100 && (
          <div className="login-stat">
            <i className="ti ti-chart-bar" aria-hidden="true" />
            <span>{generationsCount.toLocaleString()} test cases generated</span>
          </div>
        )}

        {/* Customer testimonials — only renders when DB has visible records */}
        {testimonials.length > 0 && (
          <div className="login-testimonials">
            <p className="login-testimonials-label">Trusted by teams at</p>
            <div className="login-testimonials-logos">
              {testimonials.map((t) => (
                t.logoUrl ? (
                  <img
                    key={t.id}
                    src={t.logoUrl}
                    alt={t.companyName}
                    className="login-testimonial-logo"
                    title={t.quote ? `"${t.quote}" — ${t.authorName}, ${t.authorTitle}` : t.companyName}
                  />
                ) : (
                  <span key={t.id} className="login-testimonial-name">{t.companyName}</span>
                )
              ))}
            </div>
          </div>
        )}

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
                <FeedbackMessage message={error} detail={errorDetail} isBusy={loading} />
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
