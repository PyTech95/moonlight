import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { AuthorTag, Check, SelectField, TextField, fmt, fmtTime, useAction } from './teamUi';

const FIELDS = [['participation', 'Participation and engagement'], ['communication', 'Communication attempts'], ['transitions', 'Transitions between activities'],
  ['accommodations', 'Use of agreed classroom accommodations'], ['peer_interaction', 'Peer interaction'], ['support_needs', 'Practical support needs'],
  ['what_helped', 'What helped'], ['what_was_difficult', 'What was difficult']];
const blank = () => ({ observed_on: new Date().toLocaleDateString('en-CA'), goal_id: '', needs_guidance: false, guidance_question: '', ...Object.fromEntries(FIELDS.map(([k]) => [k, ''])) });

const ObservationForm = ({ bundle, reload }) => {
  const [form, setForm] = useState(blank);
  const { busy, run } = useAction();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async e => { e.preventDefault(); if (await run('save', () => api.post(`/team/children/${bundle.child.id}/observations`, form), form.needs_guidance ? 'Observation saved. A follow-up task was assigned to the therapist.' : 'Observation saved.')) { setForm(blank()); reload(); } };
  return (
    <form className="tm-card tm-form" onSubmit={submit} data-testid="observation-form">
      <h3>Record a classroom observation</h3>
      <p className="tm-hint">Describe what you saw and heard, starting with strengths. Please don’t record diagnoses or interpretations here — use “Need therapist guidance” for questions.</p>
      <div className="tm-grid-2">
        <TextField id="observation-date" label="Date observed" type="date" value={form.observed_on} onChange={v => set('observed_on', v)} required />
        <SelectField id="observation-goal" label="Related shared goal (optional)" value={form.goal_id} onChange={v => set('goal_id', v)} options={[['', 'Not linked to a goal'], ...bundle.goals.map(g => [g.id, g.title])]} />
      </div>
      <div className="tm-grid-2">{FIELDS.map(([k, l]) => <TextField key={k} id={`observation-${k}`} label={l} area value={form[k]} onChange={v => set(k, v)} maxLength={600} />)}</div>
      <Check id="observation-needs-guidance" checked={form.needs_guidance} onChange={v => set('needs_guidance', v)}>Need therapist guidance</Check>
      {form.needs_guidance && <TextField id="observation-guidance-question" label="What guidance would help?" area value={form.guidance_question} onChange={v => set('guidance_question', v)} required minLength={3} />}
      <button className="button primary" disabled={busy === 'save'} data-testid="observation-submit">{busy === 'save' ? 'Saving…' : 'Save observation'}</button>
    </form>
  );
};

export const ObservationsPanel = ({ bundle, reload }) => {
  const isSchool = bundle.viewer.kind === 'school';
  const goalName = id => bundle.goals.find(g => g.id === id)?.title;
  return (
    <div data-testid="observations-panel">
      <p className="muted">Classroom observations come from school staff. School attendance is kept separate from therapy-session attendance.</p>
      {isSchool && <ObservationForm bundle={bundle} reload={reload} />}
      {!bundle.observations.length && <p className="tm-empty" data-testid="observations-empty">No classroom observations yet.</p>}
      {bundle.observations.map(o => (
        <article className="tm-card" key={o.id} data-testid={`observation-${o.id}`}>
          <div className="tm-row"><AuthorTag record={o} /><span className="tm-meta">{o.school_name} · observed {fmt(o.observed_on)}</span><span className="status lavender">Observation — not a diagnosis</span></div>
          {goalName(o.goal_id) && <p className="tm-meta">Goal: {goalName(o.goal_id)}</p>}
          <dl className="tm-dl two">{FIELDS.filter(([k]) => o[k]).map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{o[k]}</dd></div>)}</dl>
          {o.needs_guidance && <div className="tm-guidance" data-testid={`observation-guidance-${o.id}`}><HelpCircle size={16} /><div><strong>Guidance requested:</strong> {o.guidance_question}{o.guidance_status && <span className={`status ${o.guidance_status === 'done' ? 'sage' : 'yellow'}`}>{o.guidance_status === 'done' ? 'Answered' : 'Waiting for therapist'}</span>}{o.guidance_response && <p>Therapist: {o.guidance_response}</p>}</div></div>}
          {o.amendments?.map((a, i) => <p className="tm-amend" key={i}>Amended {fmtTime(a.at)}: {a.body}</p>)}
        </article>))}
    </div>
  );
};
