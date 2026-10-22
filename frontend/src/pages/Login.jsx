import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  School,
  GraduationCap,
} from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth, useOrganization } from '../lib/context';
import { errorText } from '../lib/api';
import { Brand } from '../components/PublicLayout';

// One sign-in for everyone (website and mobile app). The account decides which workspace opens;
// the cards only explain who signs in here and what to expect.
const ROLES = [
  {
    key: 'parent',
    label: 'Parent / guardian',
    Icon: UserRound,
    blurb: 'Your child’s plan, home practice videos and updates.',
    hint: 'Use the email address the center invited you with. First time? Open the invitation link in your email to set your password.',
  },
  {
    key: 'staff',
    label: 'Therapist / staff',
    Icon: UsersRound,
    blurb: 'Your caseload, sessions and family guidance.',
    hint: 'Use your work email. After your password you’ll confirm with your authenticator app.',
  },
  {
    key: 'school',
    label: 'School',
    Icon: School,
    blurb: 'Coordinators and teachers supporting a child.',
    hint: 'Use the email your school coordinator or the center invited. You’ll only see children whose families approved it.',
  },
  {
    key: 'admin',
    label: 'Center admin',
    Icon: ShieldCheck,
    blurb: 'Enquiries, accounts, website and center settings.',
    hint: 'Admin accounts always confirm with an authenticator app after the password.',
  },
];
const ROLE_LABEL = { parent: 'Parent', staff: 'Therapist / staff', school: 'School', admin: 'Center admin' };

// Demo personas exist only when the backend runs in demo mode (staging), never on the live site.
const DEMO_PERSONAS = [
  ['parent', 'Parent / guardian', UserRound],
  ['staff', 'Therapist / staff', UsersRound],
  ['admin', 'Center head / admin', ShieldCheck],
  ['school', 'School coordinator', School],
  ['teacher', 'Teacher · School A', GraduationCap],
  ['teacherb', 'Teacher · School B', GraduationCap],
];

export const workspaceHome = (account) =>
  account?.mfa_setup_required
    ? '/security-setup'
    : `/portal/${account.role}/${account.role === 'admin' ? 'overview' : 'today'}`;

export default function Login() {
  const { user, accept, login, verifyMfa } = useAuth(),
    { organization } = useOrganization(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const initialRole = ROLES.some((r) => r.key === params.get('role')) ? params.get('role') : 'parent';
  const [role, setRole] = useState(initialRole),
    [demoRole, setDemoRole] = useState('parent'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(''),
    [challenge, setChallenge] = useState(''),
    [code, setCode] = useState('');
  const showDemo = organization?.app_mode === 'demo';
  const active = ROLES.find((r) => r.key === role);
  if (user) return <Navigate to={workspaceHome(user)} replace />;

  const arrive = (account) => {
    if (account.role !== role && ROLE_LABEL[account.role]) {
      toast.message(`Signed in as ${ROLE_LABEL[account.role]}.`);
    }
    navigate(workspaceHome(account));
  };
  const enterDemo = async () => {
    setBusy('demo');
    try {
      arrive(await accept(demoRole));
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy('');
    }
  };
  const signIn = async (event) => {
    event.preventDefault();
    setBusy('login');
    try {
      const next = await login(email, password);
      if (next.challenge_token) setChallenge(next.challenge_token);
      else arrive(next);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy('');
    }
  };
  const confirm = async (event) => {
    event.preventDefault();
    setBusy('mfa');
    try {
      arrive(await verifyMfa(challenge, code));
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy('');
    }
  };
  return (
    <main className="auth-page">
      <Link to="/" className="auth-back" data-testid="login-back-home">
        <ArrowLeft /> Back to website
      </Link>
      <section className="auth-panel">
        <Brand />
        <span className="eyebrow">SECURE LOGIN</span>
        <h1 data-testid="login-title">Sign in to Moonlight.</h1>
        <p>
          One login for families, therapists, schools and the {organization?.name || 'Moonlight Neurocare'} team. Your
          account opens the right workspace.
        </p>
        {challenge ? (
          <form className="production-login" onSubmit={confirm} data-testid="mfa-login-form">
            <div className="auth-method-heading">
              <KeyRound />
              <div>
                <strong>Authenticator verification</strong>
                <span>Enter the current six-digit code from your authenticator app, or one recovery code.</span>
              </div>
            </div>
            <div className="field">
              <label htmlFor="mfa-code">Verification code</label>
              <input
                id="mfa-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                required
                data-testid="mfa-login-code"
              />
            </div>
            <button className="button primary" disabled={busy === 'mfa'} data-testid="mfa-login-submit">
              {busy === 'mfa' ? 'Verifying…' : 'Verify and continue'} <ArrowRight />
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setChallenge('');
                setCode('');
              }}
              data-testid="mfa-login-cancel"
            >
              Use a different account
            </button>
          </form>
        ) : (
          <>
            <div className="role-picker" role="radiogroup" aria-label="Who is signing in?">
              {ROLES.map(({ key, label, Icon, blurb }) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={role === key}
                  className={role === key ? 'persona-card selected' : 'persona-card'}
                  onClick={() => setRole(key)}
                  data-testid={`login-role-${key}`}
                  key={key}
                >
                  <Icon />
                  <span>
                    <strong>{label}</strong>
                    <small>{blurb}</small>
                  </span>
                </button>
              ))}
            </div>
            <form className="production-login" onSubmit={signIn} data-testid="production-login-form">
              <div className="auth-method-heading">
                <LockKeyhole />
                <div>
                  <strong>{active.label} sign in</strong>
                  <span data-testid="login-role-hint">{active.hint}</span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="login-email">Email address</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  data-testid="login-email"
                />
              </div>
              <div className="field">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  data-testid="login-password"
                />
              </div>
              <div className="login-form-row">
                <Link to="/forgot-password" data-testid="forgot-password-link">
                  Forgot password?
                </Link>
                <button className="button primary" disabled={busy === 'login'} data-testid="login-submit">
                  {busy === 'login' ? 'Signing in…' : 'Sign in'} <ArrowRight />
                </button>
              </div>
            </form>
            <p className="auth-help" data-testid="login-no-account">
              Don’t have an account yet? Accounts are created by invitation from the center.{' '}
              <Link to="/contact">Contact the center</Link>.
            </p>
            {showDemo && (
              <>
                <div className="auth-divider">
                  <span>Demo access · staging only</span>
                </div>
                <div className="persona-list">
                  {DEMO_PERSONAS.map(([key, label, Icon]) => (
                    <button
                      type="button"
                      className={demoRole === key ? 'persona-card selected' : 'persona-card'}
                      onClick={() => setDemoRole(key)}
                      data-testid={`demo-role-${key}`}
                      key={key}
                    >
                      <Icon />
                      <span>
                        <strong>{label}</strong>
                      </span>
                      {demoRole === key && <Sparkles />}
                    </button>
                  ))}
                </div>
                <button
                  className="button outlined demo-entry"
                  onClick={enterDemo}
                  disabled={busy === 'demo'}
                  data-testid="enter-demo"
                >
                  {busy === 'demo' ? 'Opening demo…' : 'Open selected demo'} <ArrowRight />
                </button>
              </>
            )}
          </>
        )}
        <p className="auth-privacy">
          <ShieldCheck /> Every sign-in is logged. Never share your password or verification codes.
        </p>
      </section>
    </main>
  );
}
