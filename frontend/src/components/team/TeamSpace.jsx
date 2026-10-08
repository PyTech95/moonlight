import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorText } from '../../lib/api';
import { EmptyState } from '../PortalLayout';
import { GoalsPanel } from './GoalsPanel';
import { ObservationsPanel } from './ObservationsPanel';
import { ActivitiesPanel } from './ActivitiesPanel';
import { MessagesPanel } from './MessagesPanel';
import { MeetingsPanel } from './MeetingsPanel';
import { DocumentsPanel } from './DocumentsPanel';
import { AccessPanel, ProfilePanel, TasksPanel } from './ProfilePanel';

const tabsFor = b => [
  ['plan', 'Shared support plan', b.viewer.scopes.includes('goals')],
  ['profile', 'Support profile', !!(b.profile || b.safety)],
  ['activities', 'School activities', !!b.activities],
  ['observations', 'Classroom observations', true],
  ['messages', 'Team messages', !!b.messages],
  ['meetings', 'Meetings', !!b.meetings],
  ['documents', 'Documents', !!b.documents],
  ['tasks', `Follow-ups${b.tasks ? ` (${b.tasks.filter(t => t.status === 'open').length})` : ''}`, !!b.tasks],
  ['access', 'Who has access', !!b.school_links],
].filter(t => t[2]);

const PANELS = { plan: GoalsPanel, profile: ProfilePanel, activities: ActivitiesPanel, observations: ObservationsPanel, messages: MessagesPanel, meetings: MeetingsPanel, documents: DocumentsPanel, tasks: TasksPanel, access: AccessPanel };

export const TeamSpace = ({ children }) => {
  const [params, setParams] = useSearchParams();
  const childId = params.get('child') || children[0]?.id;
  const [bundle, setBundle] = useState(null), [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!childId) return;
    setError('');
    try { const { data } = await api.get(`/team/children/${childId}`); setBundle(data); } catch (e) { setBundle(null); setError(errorText(e)); }
  }, [childId]);
  useEffect(() => { load(); }, [load]);
  if (!children.length) return <EmptyState id="team-no-children" title="No children are shared with you" description="A child appears here only after the family approves sharing and your access is approved." />;
  const tabs = bundle ? tabsFor(bundle) : [];
  const tab = tabs.find(t => t[0] === params.get('tab'))?.[0] || tabs[0]?.[0];
  const Panel = PANELS[tab];
  const go = next => setParams(current => { const p = new URLSearchParams(current); Object.entries(next).forEach(([k, v]) => p.set(k, v)); return p; });
  return (
    <div className="tm-space" data-testid="team-space">
      <div className="tm-children" role="tablist" aria-label="Choose child">
        {children.map(c => <button key={c.id} role="tab" aria-selected={c.id === childId} className={c.id === childId ? 'active' : ''} onClick={() => go({ child: c.id })} data-testid={`team-child-${c.id}`}><span className="mini-avatar">{c.initials}</span>{c.name}{c.class_group && <small>{c.class_group}</small>}</button>)}
      </div>
      {error && <div className="error-state" role="alert" data-testid="team-error"><p>{error}</p></div>}
      {bundle && <>
        <div className="tm-viewer" data-testid="team-viewer">Viewing as <strong>{bundle.viewer.label}</strong>{bundle.viewer.kind === 'school' && <> · shared with you: {bundle.viewer.scopes.filter(s => s !== 'observations').join(', ') || 'observations only'}</>}</div>
        <nav className="tm-tabs" aria-label="Team space sections">{tabs.map(([key, label]) => <button key={key} className={key === tab ? 'active' : ''} aria-pressed={key === tab} onClick={() => go({ tab: key })} data-testid={`team-tab-${key}`}>{label}</button>)}</nav>
        {Panel && <Panel bundle={bundle} reload={load} />}
      </>}
    </div>
  );
};
