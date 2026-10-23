import { useEffect, useState } from 'react';
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
import { api, errorText } from '../lib/api';
import { IN_APP } from '../lib/app';
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
  const { user, accept, login, verifyMfa, requestOtp, verifyOtp } = useAuth(),
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
    [code, setCode] = useState(''),
    [otpMode, setOtpMode] = useState(false),
    [otpOptions, setOtpOptions] = useState(null),
    [identifier, setIdentifier] = useState(''),
    [otpToken, setOtpToken] = useState(''),
    [otpCode, setOtpCode] = useState('');
  useEffect(() => {
    api.get('/auth/options').then(({ data }) => setOtpOptions(data)).catch(() => setOtpOptions(null));
  }, []);
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
  const sendCode = async (event) => {
    event.preventDefault();
    setBusy('otp');
    try {
      const data = await requestOtp(identifier);
      setOtpToken(data.challenge_token);
      setOtpCode(data.demo_code || '');
      toast.success(data.message);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy('');
    }
  };
  const checkCode = async (event) => {
    event.preventDefault();
    setBusy('otp-verify');
    try {
      arrive(await verifyOtp(otpToken, otpCode));
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
      {!IN_APP && (
        <Link to="/" className="auth-back" data-testid="login-back-home">
          <ArrowLeft /> Back to website
        </Link>
      )}
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
            {role === 'parent' && otpMode ? (
              <form className="production-login" onSubmit={otpToken ? checkCode : sendCode} data-testid="otp-login-form">
                <div className="auth-method-heading">
                  <KeyRound />
                  <div>
                    <strong>Sign in with a one-time code</strong>
                    <span>
                      {otpToken
                        ? 'Enter the 6-digit code we sent. It works once, for 10 minutes.'
                        : `Enter the mobile number or email the center has for you. We’ll send a code by ${
                            otpOptions?.otp_whatsapp ? 'WhatsApp or email' : 'email'
                          }.`}
                    </span>
                  </div>
                </div>
                {!otpToken ? (
                  <div className="field">
                    <label htmlFor="otp-identifier">Mobile number or email</label>
                    <input id="otp-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username"
                      placeholder="98765 43210" required data-testid="otp-identifier" />
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="otp-code">6-digit code</label>
                    <input id="otp-code" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code"
                      inputMode="numeric" pattern="[0-9]{6}" required data-testid="otp-code" />
                  </div>
                )}
                <div className="login-form-row">
                  <button type="button" className="text-link" onClick={() => (otpToken ? (setOtpToken(''), setOtpCode('')) : setOtpMode(false))} data-testid="otp-back">
                    {otpToken ? 'Send a new code' : 'Use my password instead'}
                  </button>
                  <button className="button primary" disabled={busy.startsWith('otp')} data-testid="otp-submit">
                    {otpToken ? (busy === 'otp-verify' ? 'Checking…' : 'Sign in') : busy === 'otp' ? 'Sending…' : 'Send code'} <ArrowRight />
                  </button>
                </div>
              </form>
            ) : (
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
              {role === 'parent' && otpOptions?.otp && (
                <button type="button" className="text-link otp-switch" onClick={() => setOtpMode(true)} data-testid="otp-switch">
                  <KeyRound size={15} /> No password? Sign in with a one-time code
                </button>
              )}
            </form>
            )}
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
