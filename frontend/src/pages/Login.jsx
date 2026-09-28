import { useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck, Heart, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useOrganization } from '../lib/context';
import { errorText } from '../lib/api';
import { LOGO } from '../lib/content';
import '../styles/editor.css';

export default function Login() {
  const { user, login, verifyMfa } = useAuth();
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');

  if (user) return <Navigate to={`/portal/${user.role}/${user.role === 'admin' ? 'overview' : 'today'}`} replace />;

  const go = next => navigate(`/portal/${next.role}/${next.role === 'admin' ? 'overview' : 'today'}`);

  const signIn = async event => {
    event.preventDefault();
    setBusy('login');
    try {
      const next = await login(email, password);
      if (next.mfa_required) setChallenge(next.challenge_token); else go(next);
    } catch (error) { toast.error(errorText(error)); } finally { setBusy(''); }
  };
  const confirm = async event => {
    event.preventDefault();
    setBusy('mfa');
    try { const next = await verifyMfa(challenge, code); navigate(next.mfa_setup_required ? '/security-setup' : `/portal/${next.role}/${next.role === 'admin' ? 'overview' : 'today'}`); }
    catch (error) { toast.error(errorText(error)); } finally { setBusy(''); }
  };

  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <div className="auth-aside-top">
          <span className="auth-aside-logo"><img src={LOGO} alt="Moonlight Neurocare" /></span>
          <span>moonlight</span>
        </div>
        <div className="auth-aside-body">
          <span className="auth-aside-eyebrow">Secure family & care portal</span>
          <h2>A shared space for your child’s care.</h2>
          <p>{organization?.name || 'Moonlight Neurocare'} keeps family and care-team access thoughtfully separate, private and secure.</p>
          <div className="auth-trust">
            <span><ShieldCheck size={18} /> Encrypted sessions and role-based access</span>
            <span><Heart size={18} /> Built around every child and family</span>
            <span><Sparkles size={18} /> Care plans, updates and home practice in one place</span>
          </div>
        </div>
        <div className="auth-aside-foot">Moonlight Neurocare · Sector 37C, Gurugram</div>
      </aside>

      <section className="auth-main">
        <div className="auth-card">
          <Link to="/" className="auth-back" data-testid="login-back-home"><ArrowLeft size={16} /> Back to website</Link>

          {challenge ? (
            <>
              <h1 data-testid="login-title">Verify it’s you.</h1>
              <p className="auth-sub">Enter the current six-digit code or one recovery code.</p>
              <form className="auth-form" onSubmit={confirm} data-testid="mfa-login-form">
                <div className="auth-field">
                  <label htmlFor="mfa-code"><KeyRound size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Verification code</label>
                  <input id="mfa-code" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" required data-testid="mfa-login-code" />
                </div>
                <button className="auth-btn full" disabled={busy === 'mfa'} data-testid="mfa-login-submit">{busy === 'mfa' ? 'Verifying…' : 'Verify and continue'} <ArrowRight size={16} /></button>
                <button type="button" className="auth-back" style={{ margin: 0 }} onClick={() => { setChallenge(''); setCode(''); }} data-testid="mfa-login-cancel">Use a different account</button>
              </form>
            </>
          ) : (
            <>
              <h1 data-testid="login-title">Welcome back.</h1>
              <p className="auth-sub">Sign in to your Moonlight Neurocare portal.</p>

              <form className="auth-form" onSubmit={signIn} data-testid="production-login-form">
                <div className="auth-field">
                  <label htmlFor="login-email">Email address</label>
                  <input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required data-testid="login-email" />
                </div>
                <div className="auth-field">
                  <label htmlFor="login-password">Password</label>
                  <input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Your password" required data-testid="login-password" />
                </div>
                <div className="auth-row">
                  <Link to="/forgot-password" data-testid="forgot-password-link">Forgot password?</Link>
                  <button className="auth-btn" disabled={busy === 'login'} data-testid="login-submit">{busy === 'login' ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} /></button>
                </div>
              </form>

              <p className="auth-privacy"><ShieldCheck size={15} /> Access is logged. Please sign in only with your own account.</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
