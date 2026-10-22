import { useState } from 'react';
import { Info, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { SelectField, TextField, AuthorTag, fmtTime, useAction } from './teamUi';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const blank = goalId => ({ goal_id: goalId || '', title: '', instructions: '', frequency: '', duration: '', materials: '', adaptations: '', precautions: '', media_video_id: '' });

const ActivityForm = ({ bundle, onDone }) => {
  const [form, setForm] = useState(() => blank(bundle.goals[0]?.id));
  const { busy, run } = useAction();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async e => { e.preventDefault(); if (await run('save', () => api.post(`/team/children/${bundle.child.id}/activities`, form), 'School activity published.')) onDone(); };
  return (
    <form className="tm-card tm-form" onSubmit={submit} data-testid="activity-form">
      <h3>Publish a school activity</h3>
      <SelectField id="activity-goal" label="Shared goal" value={form.goal_id} onChange={v => set('goal_id', v)} options={bundle.goals.map(g => [g.id, g.title])} />
      <TextField id="activity-title" label="Activity title" value={form.title} onChange={v => set('title', v)} required minLength={3} />
      <TextField id="activity-instructions" label="Practical instructions" area value={form.instructions} onChange={v => set('instructions', v)} required minLength={10} />
      <div className="tm-grid-2">
        <TextField id="activity-frequency" label="Suggested frequency" value={form.frequency} onChange={v => set('frequency', v)} required minLength={2} />
        <TextField id="activity-duration" label="Suggested duration" value={form.duration} onChange={v => set('duration', v)} required minLength={2} />
      </div>
      <TextField id="activity-materials" label="Materials" value={form.materials} onChange={v => set('materials', v)} />
      <TextField id="activity-adaptations" label="Classroom adaptations" area value={form.adaptations} onChange={v => set('adaptations', v)} />
      <TextField id="activity-precautions" label="Precautions (you are confirming clinical review)" area value={form.precautions} onChange={v => set('precautions', v)} />
      <SelectField id="activity-video" label="Optional demonstration video" value={form.media_video_id} onChange={v => set('media_video_id', v)} options={[['', 'No video'], ...(bundle.videos || []).map(v => [v.id, v.title])]} />
      <p className="tm-hint">A video is only visible to school if the family separately approves that video for school use.</p>
      <button className="button primary" disabled={busy === 'save' || !form.goal_id} data-testid="activity-submit">Publish activity</button>
    </form>
  );
};

const Respond = ({ activity, reload }) => {
  const [form, setForm] = useState({ status: 'Attempted', feedback: '' });
  const { busy, run } = useAction();
  const submit = async e => { e.preventDefault(); if (await run('r', () => api.post(`/team/activities/${activity.id}/responses`, form), 'Thanks — feedback shared with the team.')) { setForm({ status: 'Attempted', feedback: '' }); reload(); } };
  return (
    <form className="tm-inline wrap" onSubmit={submit} data-testid={`activity-respond-${activity.id}`}>
      <select aria-label="Attempt status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} data-testid={`activity-response-status-${activity.id}`}>{['Attempted', 'Partly attempted', 'Not attempted'].map(s => <option key={s}>{s}</option>)}</select>
      <input aria-label="Short feedback" placeholder="Short feedback (what helped, what was hard)" value={form.feedback} onChange={e => setForm({ ...form, feedback: e.target.value })} maxLength={600} data-testid={`activity-response-feedback-${activity.id}`} />
      <button className="button outlined" disabled={busy === 'r'} data-testid={`activity-response-submit-${activity.id}`}>Save</button>
    </form>
  );
};

export const ActivitiesPanel = ({ bundle, reload }) => {
  const clinical = ['therapist', 'coordinator'].includes(bundle.viewer.kind);
  const [adding, setAdding] = useState(false);
  const goal = id => bundle.goals.find(g => g.id === id)?.title || 'Shared goal';
  return (
    <div data-testid="activities-panel">
      <div className="tm-panel-head"><p className="tm-note"><Info size={15} /> Marking an activity as attempted records participation only. It is not evidence of clinical improvement. Home Plan checklists stay separate and link to the same goals.</p>
        {clinical && !adding && <button className="button primary" onClick={() => setAdding(true)} disabled={!bundle.goals.length} data-testid="activity-new-button"><Plus size={16} /> New school activity</button>}</div>
      {adding && <ActivityForm bundle={bundle} onDone={() => { setAdding(false); reload(); }} />}
      {!bundle.activities?.length && <p className="tm-empty" data-testid="activities-empty">No school activities yet.</p>}
      {bundle.activities?.map(a => (
        <article className="tm-card" key={a.id} data-testid={`school-activity-${a.id}`}>
          <span className="eyebrow">{goal(a.goal_id)}</span>
          <h3>{a.title}</h3>
          <p>{a.instructions}</p>
          <dl className="tm-dl"><div><dt>Frequency</dt><dd>{a.frequency}</dd></div><div><dt>Duration</dt><dd>{a.duration}</dd></div><div><dt>Materials</dt><dd>{a.materials || '—'}</dd></div></dl>
          {a.adaptations && <p><strong>Classroom adaptations:</strong> {a.adaptations}</p>}
          {a.precautions && <p className="tm-precaution"><strong>Precautions</strong> (reviewed by {a.precautions_reviewed_by}): {a.precautions}</p>}
          {a.media_video_id && bundle.viewer.kind === 'school' && <video className="tm-video" controls preload="metadata" src={`${BACKEND}/api/team/children/${bundle.child.id}/videos/${a.media_video_id}/media`} data-testid={`activity-video-${a.id}`} />}
          <span className="tm-meta">Published by {a.author_name} · {fmtTime(a.created_at)}</span>
          <h4>Teacher feedback</h4>
          {a.responses.map(r => <div className="tm-response" key={r.id}><AuthorTag record={r} /><span className="status sage">{r.status}</span><span>{r.feedback}</span><span className="tm-meta">{fmtTime(r.created_at)}</span></div>)}
          {!a.responses.length && <p className="tm-empty small">No feedback yet.</p>}
          {bundle.viewer.kind === 'school' && <Respond activity={a} reload={reload} />}
        </article>))}
    </div>
  );
};
