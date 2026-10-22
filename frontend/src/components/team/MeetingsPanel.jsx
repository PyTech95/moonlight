import { useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/context';
import { TeamNotice } from './MessagesPanel';
import { SelectField, TextField, fmt, fmtTime, useAction } from './teamUi';

const RequestForm = ({ childId, onDone }) => {
  const [form, setForm] = useState({ title: '', proposed_for: '', agenda: '' });
  const { busy, run } = useAction();
  const submit = async e => { e.preventDefault(); if (await run('req', () => api.post(`/team/children/${childId}/meetings`, form), 'Meeting request shared with the team.')) onDone(); };
  return (
    <form className="tm-card tm-form" onSubmit={submit} data-testid="meeting-request-form">
      <h3>Request a coordination meeting</h3>
      <TextField id="meeting-title" label="Purpose" value={form.title} onChange={v => setForm({ ...form, title: v })} required minLength={3} />
      <TextField id="meeting-when" label="Proposed date & time" type="datetime-local" value={form.proposed_for} onChange={v => setForm({ ...form, proposed_for: v })} required />
      <TextField id="meeting-agenda" label="Agenda" area value={form.agenda} onChange={v => setForm({ ...form, agenda: v })} required minLength={3} />
      <button className="button primary" disabled={busy === 'req'} data-testid="meeting-request-submit">Send request</button>
    </form>
  );
};

const MeetingEditor = ({ meeting, onDone }) => {
  const [form, setForm] = useState({ status: meeting.status, scheduled_for: meeting.scheduled_for || meeting.proposed_for, agenda: meeting.agenda, minutes: meeting.minutes || '', review_date: meeting.review_date || '', actions: meeting.actions || [] });
  const [action, setAction] = useState({ text: '', owner: '', due: '' });
  const { busy, run } = useAction();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async e => { e.preventDefault(); if (await run('save', () => api.patch(`/team/meetings/${meeting.id}`, { ...form, version: meeting.version }), 'Meeting updated.')) onDone(); };
  return (
    <form className="tm-form tm-sub" onSubmit={save} data-testid={`meeting-editor-${meeting.id}`}>
      <div className="tm-grid-3">
        <SelectField id={`meeting-status-${meeting.id}`} label="Status" value={form.status} onChange={v => set('status', v)} options={[['requested', 'Requested'], ['scheduled', 'Scheduled'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]} />
        <TextField id={`meeting-scheduled-${meeting.id}`} label="Scheduled for" type="datetime-local" value={form.scheduled_for} onChange={v => set('scheduled_for', v)} />
        <TextField id={`meeting-review-${meeting.id}`} label="Next review date" type="date" value={form.review_date} onChange={v => set('review_date', v)} />
      </div>
      <TextField id={`meeting-agenda-${meeting.id}`} label="Agenda" area value={form.agenda} onChange={v => set('agenda', v)} />
      <TextField id={`meeting-minutes-${meeting.id}`} label="Minutes" area value={form.minutes} onChange={v => set('minutes', v)} />
      <h4>Assigned actions</h4>
      <ul className="tm-list">{form.actions.map((a, i) => <li key={a.id || i}><label className="tm-check"><input type="checkbox" checked={a.done} onChange={e => set('actions', form.actions.map((x, j) => j === i ? { ...x, done: e.target.checked } : x))} data-testid={`meeting-action-done-${meeting.id}-${i}`} /><span>{a.text} · {a.owner || 'Unassigned'} {a.due && `· due ${fmt(a.due)}`}</span></label></li>)}</ul>
      <div className="tm-inline wrap"><input aria-label="Action" placeholder="Action" value={action.text} onChange={e => setAction({ ...action, text: e.target.value })} data-testid={`meeting-action-text-${meeting.id}`} /><input aria-label="Owner" placeholder="Owner" value={action.owner} onChange={e => setAction({ ...action, owner: e.target.value })} data-testid={`meeting-action-owner-${meeting.id}`} /><input aria-label="Due date" type="date" value={action.due} onChange={e => setAction({ ...action, due: e.target.value })} data-testid={`meeting-action-due-${meeting.id}`} /><button type="button" className="text-link" disabled={action.text.length < 2} onClick={() => { set('actions', [...form.actions, { ...action, id: '', done: false }]); setAction({ text: '', owner: '', due: '' }); }} data-testid={`meeting-action-add-${meeting.id}`}><Plus size={14} /> Add</button></div>
      <button className="button primary" disabled={busy === 'save'} data-testid={`meeting-save-${meeting.id}`}>Save meeting</button>
    </form>
  );
};

export const MeetingsPanel = ({ bundle, reload }) => {
  const { user } = useAuth();
  const [requesting, setRequesting] = useState(false), [editing, setEditing] = useState(null);
  const canEdit = m => ['therapist', 'coordinator'].includes(bundle.viewer.kind) || m.author_id === user?.id;
  return (
    <div data-testid="meetings-panel">
      <TeamNotice bundle={bundle} />
      <div className="tm-panel-head"><p className="muted">Meeting requests, agendas, minutes, actions and review dates for this child’s team.</p>{!requesting && <button className="button primary" onClick={() => setRequesting(true)} data-testid="meeting-request-button"><Plus size={16} /> Request meeting</button>}</div>
      {requesting && <RequestForm childId={bundle.child.id} onDone={() => { setRequesting(false); reload(); }} />}
      {!bundle.meetings.length && <p className="tm-empty" data-testid="meetings-empty">No meetings yet.</p>}
      {bundle.meetings.map(m => (
        <article className="tm-card" key={m.id} data-testid={`meeting-${m.id}`}>
          <div className="tm-row"><CalendarClock size={18} /><h3>{m.title}</h3><span className={`status ${m.status === 'scheduled' ? 'sage' : m.status === 'requested' ? 'yellow' : 'lavender'}`} data-testid={`meeting-status-label-${m.id}`}>{m.status}</span></div>
          <p className="tm-meta">{m.status === 'scheduled' ? `Scheduled ${fmtTime(m.scheduled_for)}` : `Proposed ${fmtTime(m.proposed_for)}`} · requested by {m.author_name} ({m.author_label}){m.review_date && ` · review ${fmt(m.review_date)}`}</p>
          <pre className="tm-pre">{m.agenda}</pre>
          {m.minutes && <><h4>Minutes</h4><pre className="tm-pre">{m.minutes}</pre></>}
          {m.actions?.length > 0 && <ul className="tm-list">{m.actions.map(a => <li key={a.id}>{a.done ? '✓' : '○'} {a.text} · {a.owner || 'Unassigned'} {a.due && `· due ${fmt(a.due)}`}</li>)}</ul>}
          {canEdit(m) && (editing === m.id ? <MeetingEditor meeting={m} onDone={() => { setEditing(null); reload(); }} /> : <button className="text-link" onClick={() => setEditing(m.id)} data-testid={`meeting-edit-${m.id}`}>Update agenda, minutes or actions</button>)}
        </article>))}
    </div>
  );
};
