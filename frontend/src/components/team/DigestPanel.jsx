import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, HelpCircle, Sparkles } from 'lucide-react';
import { api, errorText } from '../../lib/api';
import { fmt, fmtTime } from './teamUi';

const Digest = ({ d, testid }) => (
  <div data-testid={testid}>
    <div className="dg-totals"><span><strong>{d.totals.observations}</strong> classroom observations</span><span><strong>{d.totals.activity_feedback}</strong> activity feedback notes</span><span><strong>{d.totals.contributions}</strong> school plan contributions</span></div>
    {d.observations.length > 0 && <><h4>From the classroom</h4><ul className="dg-list">{d.observations.map((o, i) => <li key={i}><span className="tm-meta">{fmt(o.observed_on)} · {o.author}{o.goal && ` · ${o.goal}`}</span>{o.what_helped && <p><Sparkles size={13} /> What helped: {o.what_helped}</p>}{o.participation && <p>Participation: {o.participation}</p>}{o.communication && <p>Communication: {o.communication}</p>}{o.what_was_difficult && <p>Was difficult: {o.what_was_difficult}</p>}</li>)}</ul></>}
    {d.activities.length > 0 && <><h4>School activities</h4><ul className="dg-list">{d.activities.map((a, i) => <li key={i}><strong>{a.title}</strong> · tried {a.Attempted}× · partly {a['Partly attempted']}× · not tried {a['Not attempted']}×{a.feedback.length > 0 && <p>“{a.feedback.slice(-2).join('” · “')}”</p>}</li>)}</ul></>}
    {d.guidance_answered.length > 0 && <><h4>Therapist guidance given to school</h4><ul className="dg-list">{d.guidance_answered.map((g, i) => <li key={i}><HelpCircle size={13} /> {g.response}</li>)}</ul></>}
    {d.upcoming_meetings.length > 0 && <><h4>Coming up</h4><ul className="dg-list">{d.upcoming_meetings.map((m, i) => <li key={i}><CalendarDays size={13} /> {m.title} · {m.status} · {fmtTime(m.scheduled_for || m.proposed_for)}</li>)}</ul></>}
    {!d.totals.observations && !d.totals.activity_feedback && !d.totals.contributions && <p className="tm-empty">No school updates during this week.</p>}
    <p className="tm-hint">Activity attempts show participation only — they are not a measure of clinical progress.</p>
  </div>
);

export const DigestPanel = ({ bundle }) => {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => { api.get(`/team/children/${bundle.child.id}/digests`).then(r => setData(r.data)).catch(e => setError(errorText(e))); }, [bundle.child.id]);
  if (error) return <div className="error-state" role="alert">{error}</div>;
  if (!data) return <p className="tm-empty">Loading weekly digest…</p>;
  return (
    <div data-testid="digest-panel">
      <p className="muted">{data.schedule}</p>
      <article className="tm-card dg-preview"><div className="tm-row"><h3>This week so far</h3><span className="status lavender">Live preview</span></div><Digest d={data.preview} testid="digest-preview" /></article>
      {data.items.map(item => <details className="tm-card" key={item.id} open={item.unread} data-testid={`digest-${item.week_ending}`}><summary><strong>Week ending {fmt(item.week_ending)}</strong>{item.unread && <span className="status yellow">New</span>}<span className="tm-meta"> · <CheckCircle2 size={12} /> prepared {fmtTime(item.generated_at)}</span></summary><Digest d={item} testid={`digest-body-${item.week_ending}`} /></details>)}
      {!data.items.length && <p className="tm-empty" data-testid="digest-empty">The first weekly digest will appear here on Saturday morning.</p>}
    </div>
  );
};
