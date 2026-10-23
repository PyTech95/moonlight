import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { NavLink, Outlet, useParams, Navigate, Link, useLocation } from 'react-router-dom';
import {
  Sun,
  Users,
  CalendarDays,
  LayoutDashboard,
  Settings,
  Plug,
  ClipboardList,
  Sprout,
  MessageSquare,
  MoreHorizontal,
  LogOut,
  ArrowUpRight,
  Menu,
  X,
  ShieldCheck,
  Bell,
  BookOpen,
  ListChecks,
  Image,
  Video,
  UsersRound,
  ClipboardCheck,
  School,
  KeyRound,
  MonitorPlay,
  FileText,
  Wallet,
} from 'lucide-react';
import { Brand } from './PublicLayout';
import { useAuth } from '../lib/context';
import { api, errorText, dateLabel } from '../lib/api';
import { toast } from 'sonner';

const WorkspaceContext = createContext(null);

export const useWorkspace = () => useContext(WorkspaceContext);

const createEmptyWorkspace = () => ({
  children: [],
  appointments: [],
  activities: [],
  announcements: [],
  requests: [],
  practice_videos: [],
  home_plans: [],
  enquiries: [],
  practice_unread: 0,
  video_unread: 0,
  plan_unread: 0,
});

const navigation = {
  parent: [
    ['today', 'Today', Sun],
    ['child', 'My child', Users],
    ['practice', 'Home practice', Video],
    ['schedule', 'Schedule', CalendarDays],
    ['payments', 'Payments', Wallet],
    ['activities', 'Home activities', Sprout],
    ['updates', 'Classroom updates', MessageSquare],
    ['classes', 'Classes', MonitorPlay],
    ['team', 'Support team', UsersRound],
    ['sharing', 'Sharing & consent', ShieldCheck],
    ['more', 'More', MoreHorizontal],
  ],
  staff: [
    ['today', 'Today', Sun],
    ['schedule', 'Week', CalendarDays],
    ['practice', 'Home practice', Video],
    ['children', 'Children', Users],
    ['billing', 'Billing', Wallet],
    ['team', 'Support plans', ClipboardCheck],
    ['classes', 'Classes', BookOpen],
    ['more', 'More', MoreHorizontal],
  ],
  school: [
    ['today', 'Dashboard', LayoutDashboard],
    ['children', 'My children', Users],
    ['team', 'Team space', MessageSquare],
    ['staff', 'School team', UsersRound],
  ],
  admin: [
    ['overview', 'Overview', LayoutDashboard],
    ['enquiries', 'Enquiries & admissions', ClipboardList],
    ['practice', 'Home practice', Video],
    ['children', 'Children', Users],
    ['team', 'Support plans', ClipboardCheck],
    ['classes', 'Classes', MonitorPlay],
    ['schools', 'Schools', School],
    ['accounts', 'Accounts & consent', KeyRound],
    ['schedule', 'Schedule', CalendarDays],
    ['billing', 'Billing', Wallet],
    ['integrations', 'Integrations', Plug],
    ['content', 'Website content', FileText],
    ['media', 'Site images', Image],
    ['settings', 'Settings', Settings],
    ['audit', 'Audit trail', ShieldCheck],
    ['checklist', 'Project checklist', ListChecks],
  ],
};

const hasWorkspace = (role) => Object.prototype.hasOwnProperty.call(navigation, role);

const workspaceHome = (role) => `/portal/${role}/${role === 'admin' ? 'overview' : 'today'}`;

const normalizeWorkspace = (payload) => {
  const empty = createEmptyWorkspace();
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  const result = { ...empty, ...source };

  Object.keys(empty).forEach((key) => {
    if (Array.isArray(empty[key])) {
      result[key] = Array.isArray(source[key]) ? source[key] : [];
    } else {
      const count = Number(source[key]);
      result[key] = Number.isFinite(count) ? Math.max(0, count) : 0;
    }
  });

  return result;
};

export const PortalLayout = () => {
  const { role } = useParams();
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  const [mobile, setMobile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [workspace, setWorkspace] = useState(() => ({
    scope: null,
    data: createEmptyWorkspace(),
    error: '',
    busy: true,
  }));

  const requestId = useRef(0);

  // Use the legacy role only when a roles array is unavailable.
  const roles = (Array.isArray(user?.roles) ? user.roles : [user?.role]).filter(
    (value) => typeof value === 'string' && hasWorkspace(value),
  );

  const allowed = Boolean(user && hasWorkspace(role) && roles.includes(role));
  const userId = user?.id ?? user?._id ?? user?.email ?? null;
  const schoolRole = user?.school_role ?? null;

  const scope = JSON.stringify([role, userId, schoolRole]);
  const activeScope = useRef(null);

  const refresh = useCallback(async () => {
    if (loading || !allowed || activeScope.current !== scope) return;

    const currentRequest = ++requestId.current;

    setWorkspace((previous) => ({
      scope,
      data: previous.scope === scope ? previous.data : createEmptyWorkspace(),
      error: '',
      busy: true,
    }));

    try {
      const response = await api.get(role === 'school' ? '/school/workspace' : `/workspace/${role}`);

      if (currentRequest !== requestId.current || activeScope.current !== scope) {
        return;
      }

      setWorkspace({
        scope,
        data: normalizeWorkspace(response.data),
        error: '',
        busy: false,
      });
    } catch (error) {
      if (currentRequest !== requestId.current || activeScope.current !== scope) {
        return;
      }

      setWorkspace((previous) => ({
        scope,
        data: previous.scope === scope ? previous.data : createEmptyWorkspace(),
        error: errorText(error) || 'Please try again.',
        busy: false,
      }));
    }
  }, [allowed, loading, role, scope]);

  useEffect(() => {
    activeScope.current = scope;

    if (!loading && allowed) {
      void refresh();
    } else {
      setWorkspace({
        scope: null,
        data: createEmptyWorkspace(),
        error: '',
        busy: false,
      });
    }

    return () => {
      activeScope.current = null;
      requestId.current += 1;
    };
  }, [allowed, loading, refresh, scope]);

  useEffect(() => {
    setMobile(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobile) return;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobile(false);
    };

    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobile]);

  const signOut = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await logout();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" role="status" data-testid="auth-loading">
        Opening your workspace…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Staff and admin accounts must finish 2-step setup before any workspace data loads.
  if (user.mfa_setup_required) return <Navigate to="/security-setup" replace />;

  if (!allowed) {
    const returnRole = roles.includes(user.role) ? user.role : roles[0];

    return (
      <div className="container section-pad">
        <h1 data-testid="permission-denied">This workspace isn’t available to your account.</h1>
        <p>Changing a page address does not change your permissions.</p>
        <Link to={returnRole ? workspaceHome(returnRole) : '/login'} data-testid="permission-return">
          Return to your workspace
        </Link>
      </div>
    );
  }

  const data = workspace.scope === scope ? workspace.data : createEmptyWorkspace();
  const busy = workspace.scope !== scope || workspace.busy;
  const error = workspace.scope === scope ? workspace.error : '';

  // Reception and finance accounts use the staff workspace with a front-desk menu.
  const STAFF_MENU = {
    reception: ['today', 'schedule', 'children', 'billing', 'classes', 'more'],
    finance: ['billing', 'children', 'more'],
  };
  const staffMenu = STAFF_MENU[user.access_profile];
  const items = navigation[role].filter(
    ([key]) =>
      (role !== 'school' || key !== 'staff' || user.school_role === 'coordinator') &&
      (key !== 'checklist' || user.demo) &&
      (role !== 'staff' || (staffMenu ? staffMenu.includes(key) : key !== 'billing')),
  );
  const initials =
    (user.display_name || '')
      .replace(/[^\p{L}\s]/gu, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || 'ME';

  const current = items.find(([key]) => {
    const path = `/portal/${role}/${key}`;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  });

  // The phone bar holds five items; everything else stays reachable from the menu and More.
  const phoneBar = items.filter(([key]) =>
    role === 'parent'
      ? ['today', 'child', 'practice', 'schedule', 'more'].includes(key)
      : role === 'staff'
        ? (staffMenu ? key !== 'classes' : !['children', 'classes'].includes(key))
        : true,
  );
  const mobileItems = phoneBar.length > 5 ? [...phoneBar.slice(0, 4), ...phoneBar.filter(([key]) => key === 'more')] : phoneBar;

  const notificationPath = `/portal/${role}/${
    role === 'admin' ? 'enquiries' : role === 'parent' ? 'practice' : role === 'school' ? 'team' : 'more'
  }`;

  return (
    <WorkspaceContext.Provider value={{ data, refresh, role, user }}>
      <div className="portal-shell">
        <aside id="workspace-sidebar" className={`sidebar ${mobile ? 'sidebar-open' : ''}`}>
          <Brand />

          <span className="workspace-label">
            {role === 'parent'
              ? 'PARENT PORTAL'
              : role === 'staff'
                ? 'CARE TEAM WORKSPACE'
                : role === 'school'
                  ? 'SCHOOL PORTAL'
                  : 'ADMINISTRATION'}
          </span>

          <nav aria-label="Workspace navigation">
            {items.map(([to, label, Icon]) => (
              <NavLink to={`/portal/${role}/${to}`} key={to} data-testid={`sidebar-${to}`}>
                <Icon size={19} />
                {label}

                {to === 'enquiries' && data.enquiries.length > 0 && (
                  <span className="nav-count">{data.enquiries.length}</span>
                )}

                {role === 'parent' && to === 'practice' && data.practice_unread > 0 && (
                  <span className="nav-count" data-testid="practice-nav-unread-count">
                    {data.practice_unread}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <div className="sidebar-help">
              <Sprout size={25} />
              <strong>A little support goes a long way.</strong>
              <Link to="/contact" data-testid="portal-contact-support">
                Contact the center
                <ArrowUpRight size={15} />
              </Link>
            </div>

            <Link to="/" data-testid="portal-view-website">
              <ArrowUpRight size={18} />
              View website
            </Link>

            <button type="button" data-testid="portal-sign-out" onClick={signOut} disabled={signingOut}>
              <LogOut size={18} />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </aside>

        {mobile && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close menu"
            data-testid="sidebar-backdrop"
            onClick={() => setMobile(false)}
          />
        )}

        <div className="portal-body">
          <header className="portal-topbar">
            <div>
              <button
                type="button"
                className="icon-button portal-mobile-menu"
                aria-label="Toggle workspace navigation"
                aria-expanded={mobile}
                aria-controls="workspace-sidebar"
                onClick={() => setMobile((previous) => !previous)}
                data-testid="portal-menu-toggle"
              >
                {mobile ? <X /> : <Menu />}
              </button>

              <span>My workspace</span>
              <span className="slash">/</span>
              <strong data-testid="portal-page-label">{current?.[1] || 'Workspace'}</strong>
            </div>

            <div>
              <span className="portal-center-label">
                <span className="presence-dot" />
                Gurugram · Sector 37C
              </span>

              <Link
                to={notificationPath}
                className="icon-button portal-bell"
                aria-label={
                  role === 'parent' && data.practice_unread > 0
                    ? `${data.practice_unread} new home-practice updates`
                    : 'Workspace updates'
                }
                data-testid="portal-notifications"
              >
                <Bell size={19} />
                {role === 'parent' && data.practice_unread > 0 && (
                  <span className="notification-dot" data-testid="practice-notification-count">
                    {data.practice_unread}
                  </span>
                )}
              </Link>

              <div className="user-avatar" data-testid="portal-user-avatar" title={user.display_name}>
                {initials}
              </div>
            </div>
          </header>

          {user.demo && (
            <div className="demo-banner">
              <span data-testid="portal-demo-notice">
                <ShieldCheck size={15} />
                <strong>Demonstration workspace</strong>{' '}
                <span>· Do not upload real child information. No live care, payments or external alerts.</span>
              </span>

              <Link to="/login" data-testid="change-demo-persona">
                Change demo persona
                <ArrowUpRight size={14} />
              </Link>
            </div>
          )}

          <main className="portal-content" id="main-content">
            {busy ? (
              <div className="loading-screen" role="status" data-testid="workspace-loading">
                Getting your day ready…
              </div>
            ) : error ? (
              <div className="error-state" role="alert" data-testid="workspace-error">
                <h2>We couldn’t load your workspace.</h2>
                <p>{error}</p>
                <button type="button" className="button primary" onClick={refresh} data-testid="workspace-retry">
                  Try again
                </button>
              </div>
            ) : (
              <Outlet />
            )}
          </main>

          <footer className="portal-footer">
            <span>Moonlight Neurocare · A shared circle of support</span>
            <span>Center time: Asia/Kolkata (IST)</span>
          </footer>
        </div>

        {role !== 'admin' && (
          <nav
            className={`portal-bottom-nav ${role === 'parent' ? 'parent-five' : 'staff-five'}`}
            aria-label="Mobile workspace navigation"
          >
            {mobileItems.map(([to, label, Icon]) => (
              <NavLink to={`/portal/${role}/${to}`} data-testid={`mobile-tab-${to}`} key={to}>
                <Icon size={20} />
                <span>{label}</span>

                {role === 'parent' && to === 'practice' && data.practice_unread > 0 && (
                  <span className="mobile-nav-count" data-testid="mobile-practice-unread-count">
                    {data.practice_unread}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
};

export const PortalHeading = ({ eyebrow, title, subtitle, action }) => (
  <div className="portal-heading">
    <div>
      <span className="eyebrow" data-testid="portal-heading-eyebrow">
        {eyebrow || dateLabel(new Date())}
      </span>
      <h1 data-testid="portal-heading-title">{title}</h1>
      {subtitle && <p data-testid="portal-heading-subtitle">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const EmptyState = ({ icon: Icon = ClipboardList, title, description, id = 'empty-state', action }) => (
  <div className="empty-state" data-testid={id}>
    <Icon size={32} strokeWidth={1.4} />
    <h2>{title}</h2>
    <p>{description}</p>
    {action}
  </div>
);
