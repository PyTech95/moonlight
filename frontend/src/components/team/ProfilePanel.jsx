import { useState } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { SCOPE_LABELS, TextField, fmt, fmtTime, useAction } from './teamUi';

const PROFILE = [['strengths', 'Strengths and interests'], ['communication', 'Communication'], ['sensory', 'Sensory needs'], ['regulation', 'Regulation and calming'], ['helpful_strategies', 'Helpful strategies']];
const SAFETY = [['allergies', 'Allergies'], ['safety_alerts', 'Safety alerts'], ['emergency_plan', 'Emergency plan']];

export const ProfilePanel = ({ bundle, reload }) => {
  const clinical = ['therapist', 'coordinator'].includes(bundle.viewer.kind);
  const [form, setForm] = useState(null);
  const { busy, run } = useAction();
  const start = () => setForm({ ...Object.fromEntries([...PROFILE, ...SAFETY].map(([k]) => [k, bundle.profile?.[k] || bundle.safety?.[k] || ''])) });
  const save = async e => { e.preventDefault(); if (await run('s', () => api.patch(`/team/children/${bundle.child.id}/profile`, { ...form, version: bundle.profile.version }), 'Support profile updated.')) { setForm(null); reload(); } };
  if (form) return (
    <form className="tm-card tm-form" onSubmit={save} data-testid="profile-form">
      {[...PROFILE, ...SAFETY].map(([k, l]) => <TextField key={k} id={`profile-${k}`} label={l} area value={form[k]} onChange={v => setForm({ ...form, [k]: v })} />)}
      <div className="tm-actions"><button className="button primary" disabled={busy === 's'} data-testid="profile-save">Save profile</button><button type="button" className="text-link" onClick={() => setForm(null)}>Cancel</button></div>
    </form>
  );
  return (
    <div className="tm-grid-2" data-testid="profile-panel">
      {bundle.profile && <article className="tm-card"><h3>Practical support profile</h3><dl className="tm-dl stack">{PROFILE.map(([k, l]) => <div key={k}><dt>{l}</dt><dd data-testid={`profile-${k}-value`}>{bundle.profile[k] || '—'}</dd></div>)}</dl>{clinical && <button className="text-link" onClick={start} data-testid="profile-edit">Edit profile</button>}</article>}
      {bundle.safety && <article className="tm-card tm-safety"><h3><ShieldAlert size={18} /> Relevant safety information</h3><dl className="tm-dl stack">{SAFETY.map(([k, l]) => <div key={k}><dt>{l}</dt><dd data-testid={`safety-${k}-value`}>{bundle.safety[k] || '—'}</dd></div>)}</dl></article>}
      <p className="muted small">Clinical notes, full medical history, family conversations, home videos and billing are never part of this profile.</p>
    </div>
  );
};

export const TasksPanel = ({ bundle, reload }) => {
  const [answers, setAnswers] = useState({});
  const { busy, run } = useAction();
  const done = async id => { if (await run(id, () => api.post(`/team/tasks/${id}/complete`, { response: answers[id] || '' }), 'Response shared.')) reload(); };
  const open = bundle.tasks.filter(t => t.status === 'open');
  return (
    <div data-testid="tasks-panel">
      {!open.length && <p className="tm-empty" data-testid="tasks-empty">No open follow-up tasks.</p>}
      {bundle.tasks.map(t => (
        <article className="tm-card" key={t.id} data-testid={`task-${t.id}`}>
          <div className="tm-row"><h3>{t.title}</h3><span className={`status ${t.status === 'open' ? 'yellow' : 'sage'}`}>{t.status === 'open' ? 'Open' : 'Done'}</span></div>
          <p>{t.detail}</p>
          <p className="tm-meta">From {t.created_by_name} · {fmtTime(t.created_at)} · assigned to {t.assigned_name}</p>
          {t.status === 'open' ? <div className="tm-inline"><input aria-label="Response" placeholder={t.kind === 'guidance' ? 'Your guidance for the teacher' : 'Review outcome'} value={answers[t.id] || ''} onChange={e => setAnswers({ ...answers, [t.id]: e.target.value })} data-testid={`task-response-${t.id}`} /><button className="text-link" disabled={(answers[t.id] || '').length < 3 || busy === t.id} onClick={() => done(t.id)} data-testid={`task-complete-${t.id}`}><CheckCircle2 size={14} /> Complete</button></div> : <p className="tm-amend">Response: {t.response}</p>}
        </article>))}
    </div>
  );
};

export const AccessPanel = ({ bundle }) => (
  <div data-testid="access-panel">
    <p className="muted">Schools see only what the family has chosen to share, for a limited time.{bundle.viewer.kind === 'parent' && <> <Link to="/portal/parent/sharing" className="text-link" data-testid="access-manage-link">Manage sharing</Link></>}</p>
    {!bundle.school_links.length && <p className="tm-empty" data-testid="access-empty">No schools are linked.</p>}
    {bundle.school_links.map(l => (
      <article className="tm-card" key={l.id} data-testid={`access-link-${l.id}`}>
        <div className="tm-row"><h3>{l.school_name}</h3><span className={`status ${l.status === 'active' ? 'sage' : l.status === 'pending' ? 'yellow' : 'lavender'}`}>{l.status}</span></div>
        <p className="tm-meta">{l.purpose}{l.expires_at && ` · access until ${fmt(l.expires_at)}`}{l.ended_at && ` · ended ${fmtTime(l.ended_at)}`}</p>
        {l.status === 'active' && <><ul className="tm-chips">{l.scopes.map(s => <li key={s}>{SCOPE_LABELS[s]}</li>)}</ul><p className="tm-meta">Professionals: {l.professionals.join(', ') || 'None approved yet'}</p></>}
      </article>))}
  </div>
);
