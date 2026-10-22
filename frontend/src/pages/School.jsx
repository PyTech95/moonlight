import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, CalendarClock, ClipboardCheck, MessageSquare, Target, Users } from 'lucide-react';
import { useWorkspace, PortalHeading, EmptyState } from '../components/PortalLayout';
import { TeamSpace } from '../components/team/TeamSpace';
import { SchoolTeam } from './SchoolTeam';
import { fmt, fmtTime } from '../components/team/teamUi';

const ClassFilter = ({ groups, value, onChange }) => (
  <div className="filter-bar" data-testid="school-class-filter">{['All classes', ...groups].map(g => <button key={g} className={value === g ? 'filter active' : 'filter'} aria-pressed={value === g} onClick={() => onChange(g)} data-testid={`class-filter-${g.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{g}</button>)}</div>
);

const Dashboard = ({ data }) => {
  const [group, setGroup] = useState('All classes');
  const groups = [...new Set(data.children.map(c => c.class_group).filter(Boolean))];
  const visible = new Set(data.children.filter(c => group === 'All classes' || c.class_group === group).map(c => c.id));
  const goals = data.goals.filter(g => visible.has(g.child_id)), feedback = data.activities.filter(a => visible.has(a.child_id) && a.needs_feedback);
  const meetings = data.meetings.filter(m => visible.has(m.child_id)), reviews = data.reviews.filter(r => data.goals.some(g => g.id === r.goal_id && visible.has(g.child_id)));
  const stats = [[Users, 'Children shared with you', visible.size, 'children'], [MessageSquare, 'Unread team messages', data.unread_messages, 'team'], [ClipboardCheck, 'Activities awaiting your feedback', feedback.length, 'team'], [CalendarClock, 'Upcoming meetings', meetings.length, 'team']];
  return <>
    <PortalHeading title={`Welcome, ${data.school?.name || 'school team'}.`} subtitle="Only children whose families approved sharing with you are shown." action={<span className="status yellow">School portal · Demo</span>} />
    {groups.length > 0 && <ClassFilter groups={groups} value={group} onChange={setGroup} />}
    <div className="stat-grid">{stats.map(([Icon, label, value, to], i) => <Link className="stat-card" to={`/portal/school/${to}`} key={label} data-testid={`school-stat-${i}`}><div><Icon size={20} /><ArrowUpRight size={16} /></div><span>{label}</span><strong>{value}</strong></Link>)}</div>
    <div className="admin-columns">
      <section className="portal-section"><h2><Target size={18} /> School support goals</h2>{goals.map(g => <Link to={`/portal/school/team?child=${g.child_id}&tab=plan`} className="tm-list-row" key={g.id} data-testid={`school-goal-${g.id}`}><strong>{g.title}</strong><span>{data.children.find(c => c.id === g.child_id)?.name} · review {fmt(g.review_date)}</span></Link>)}{!goals.length && <p className="tm-empty">No shared goals.</p>}</section>
      <section className="portal-section"><h2><ClipboardCheck size={18} /> Tasks needing your feedback</h2>{feedback.map(a => <Link to={`/portal/school/team?child=${a.child_id}&tab=activities`} className="tm-list-row" key={a.id} data-testid={`school-feedback-${a.id}`}><strong>{a.title}</strong><span>{a.child_name} · {a.frequency}</span></Link>)}{!feedback.length && <p className="tm-empty">You’re up to date this week.</p>}</section>
      <section className="portal-section"><h2><CalendarClock size={18} /> Upcoming coordination meetings</h2>{meetings.map(m => <Link to={`/portal/school/team?child=${m.child_id}&tab=meetings`} className="tm-list-row" key={m.id} data-testid={`school-meeting-${m.id}`}><strong>{m.title}</strong><span>{m.child_name} · {m.status} · {fmtTime(m.scheduled_for || m.proposed_for)}</span></Link>)}{!meetings.length && <p className="tm-empty">No meetings scheduled.</p>}</section>
      <section className="portal-section"><h2>Scheduled progress reviews</h2>{reviews.map(r => <div className="tm-list-row" key={r.goal_id} data-testid={`school-review-${r.goal_id}`}><strong>{fmt(r.review_date)}</strong><span>{r.child_name} · {r.title}</span></div>)}{!reviews.length && <p className="tm-empty">No reviews scheduled.</p>}
        <h2>Your guidance requests</h2>{data.guidance.map(t => <div className="tm-list-row" key={t.id} data-testid={`school-guidance-${t.id}`}><strong>{t.title}</strong><span className={`status ${t.status === 'open' ? 'yellow' : 'sage'}`}>{t.status === 'open' ? 'Waiting' : 'Answered'}</span></div>)}{!data.guidance.length && <p className="tm-empty">No requests yet.</p>}</section>
    </div>
  </>;
};

const Children = ({ data }) => {
  const [group, setGroup] = useState('All classes');
  const groups = [...new Set(data.children.map(c => c.class_group).filter(Boolean))];
  const list = data.children.filter(c => group === 'All classes' || c.class_group === group);
  return <>
    <PortalHeading eyebrow="AUTHORIZED CHILDREN ONLY" title="Children shared with you" subtitle="Each child’s family decides what is shared, and for how long." />
    {groups.length > 0 && <ClassFilter groups={groups} value={group} onChange={setGroup} />}
    {!list.length ? <EmptyState id="school-children-empty" icon={Users} title="No children shared yet" description="You will see a child here after their family approves sharing and your assignment." /> :
      <div className="children-grid">{list.map(c => <Link className="child-record" to={`/portal/school/team?child=${c.id}`} key={c.id} data-testid={`school-child-${c.id}`}><span className="child-avatar">{c.initials}</span><div><h2>{c.name}</h2><p>{c.class_group} · access until {fmt(c.access_expires_at)}</p><span className="status sage">{c.scopes.length} shared categories</span></div><ArrowUpRight size={18} /></Link>)}</div>}
  </>;
};

export default function School() {
  const { view = 'today' } = useParams(), { data, refresh } = useWorkspace();
  if (view === 'children') return <Children data={data} />;
  if (view === 'team') return <><PortalHeading eyebrow="CHILD SUPPORT TEAM" title="Team space" subtitle="Shared goals, classroom feedback and secure team communication." /><TeamSpace children={data.children} /></>;
  if (view === 'staff') return <SchoolTeam data={data} refresh={refresh} />;
  return <Dashboard data={data} />;
}
