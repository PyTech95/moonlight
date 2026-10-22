import { useState } from 'react';
import { History, Pencil, Plus, Target } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/context';
import { GoalForm } from './GoalForm';
import { AuthorTag, Check, SelectField, TextField, fmt, fmtTime, useAction } from './teamUi';

const KINDS = [['observation', 'Observation'], ['evidence', 'Supporting evidence'], ['proposal', 'Propose a change'], ['comment', 'Comment']];
const CONTEXTS = [['home', 'At home'], ['school', 'At school'], ['therapy', 'In therapy']];

const Contribution = ({ c, clinical, reload }) => {
  const { user } = useAuth();
  const [amend, setAmend] = useState(''), [review, setReview] = useState('');
  const { busy, run } = useAction();
  const doAmend = async () => { if (await run('amend', () => api.post(`/team/contributions/${c.id}/amend`, { body: amend }), 'Amendment added.')) { setAmend(''); reload(); } };
  const doReview = async decision => { if (await run(decision, () => api.post(`/team/contributions/${c.id}/review`, { decision, note: review }), 'Review recorded.')) reload(); };
  return (
    <li className={`tm-contribution kind-${c.author_kind}`} data-testid={`contribution-${c.id}`}>
      <div className="tm-row"><AuthorTag record={c} /><span className="tm-meta">{KINDS.find(k => k[0] === c.kind)?.[1]} · {CONTEXTS.find(k => k[0] === c.context)?.[1]} · {fmtTime(c.created_at)}</span>
        {c.status && <span className={`status ${c.status === 'accepted' ? 'sage' : c.status === 'declined' ? 'peach' : 'yellow'}`} data-testid={`contribution-status-${c.id}`}>{c.status === 'pending_review' ? 'Awaiting clinician review' : c.status}</span>}</div>
      <p>{c.body}</p>
      {c.amendments?.map((a, i) => <p className="tm-amend" key={i}>Amended {fmtTime(a.at)}: {a.body}</p>)}
      {c.review && <p className="tm-amend">Reviewed by {c.review.by_name} ({c.review.by_label}): {c.review.note}</p>}
      {user?.id === c.author_id && <div className="tm-inline"><input aria-label="Add an amendment" placeholder="Add an amendment (original stays visible)" value={amend} onChange={e => setAmend(e.target.value)} data-testid={`contribution-amend-input-${c.id}`} /><button className="text-link" disabled={amend.length < 3 || busy} onClick={doAmend} data-testid={`contribution-amend-${c.id}`}>Amend</button></div>}
      {clinical && c.status === 'pending_review' && <div className="tm-inline"><input aria-label="Review note" placeholder="Clinical review note" value={review} onChange={e => setReview(e.target.value)} data-testid={`review-note-${c.id}`} /><button className="text-link" disabled={review.length < 3 || !!busy} onClick={() => doReview('accepted')} data-testid={`review-accept-${c.id}`}>Accept</button><button className="text-link" disabled={review.length < 3 || !!busy} onClick={() => doReview('declined')} data-testid={`review-decline-${c.id}`}>Decline</button></div>}
    </li>
  );
};

const AddContribution = ({ childId, goalId, kind, reload }) => {
  const [form, setForm] = useState({ kind: 'observation', context: kind === 'school' ? 'school' : kind === 'parent' ? 'home' : 'therapy', body: '', share_with_school: false });
  const { busy, run } = useAction();
  const submit = async e => { e.preventDefault(); if (await run('add', () => api.post(`/team/children/${childId}/goals/${goalId}/contributions`, form), form.kind === 'proposal' && !['therapist', 'coordinator'].includes(kind) ? 'Proposal sent for clinician review.' : 'Added to the shared plan.')) { setForm(f => ({ ...f, body: '' })); reload(); } };
  return (
    <form className="tm-contribute" onSubmit={submit} data-testid={`contribute-form-${goalId}`}>
      <div className="tm-grid-2">
        <SelectField id={`contribute-kind-${goalId}`} label="Type" value={form.kind} onChange={v => setForm({ ...form, kind: v })} options={KINDS} />
        <SelectField id={`contribute-context-${goalId}`} label="Where" value={form.context} onChange={v => setForm({ ...form, context: v })} options={CONTEXTS} />
      </div>
      <TextField id={`contribute-body-${goalId}`} label="Your contribution" area value={form.body} onChange={v => setForm({ ...form, body: v })} required minLength={3} hint="Describe what you saw or suggest. Strengths first; keep observations separate from interpretations." />
      {kind !== 'school' && <Check id={`contribute-share-${goalId}`} checked={form.share_with_school} onChange={v => setForm({ ...form, share_with_school: v })}>Visible to the school team</Check>}
      <button className="button outlined" disabled={busy === 'add'} data-testid={`contribute-submit-${goalId}`}><Plus size={15} /> Add contribution</button>
    </form>
  );
};

export const GoalsPanel = ({ bundle, reload }) => {
  const clinical = ['therapist', 'coordinator'].includes(bundle.viewer.kind);
  const [editing, setEditing] = useState(null), [historyOpen, setHistoryOpen] = useState(null);
  const childId = bundle.child.id;
  return (
    <div data-testid="goals-panel">
      <div className="tm-panel-head"><p className="muted">One coordinated plan. Each person’s contribution keeps its author and date; nobody can overwrite another’s record.</p>
        {clinical && editing !== 'new' && <button className="button primary" onClick={() => setEditing('new')} data-testid="goal-new-button"><Plus size={16} /> New goal</button>}</div>
      {editing === 'new' && <GoalForm childId={childId} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />}
      {!bundle.goals.length && <p className="tm-empty" data-testid="goals-empty">No shared goals are visible to you yet.</p>}
      {bundle.goals.map(goal => editing === goal.id ? <GoalForm key={goal.id} childId={childId} goal={goal} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} /> : (
        <article className="tm-card tm-goal" key={goal.id} data-testid={`goal-${goal.id}`}>
          <div className="tm-row"><Target size={18} /><h3>{goal.title}</h3><span className="tm-version">v{goal.published_version}</span>{goal.school_visible && <span className="status yellow">Shared with school</span>}</div>
          <p>{goal.description}</p>
          <div className="tm-strategies">{['home', 'school', 'therapy'].map(k => <div key={k}><span>{k}</span><p>{goal.strategies?.[k] || '—'}</p></div>)}</div>
          <dl className="tm-dl"><div><dt>Responsible</dt><dd>{goal.responsible?.join(', ') || '—'}</dd></div><div><dt>Review date</dt><dd data-testid={`goal-review-${goal.id}`}>{fmt(goal.review_date)}</dd></div><div><dt>Progress measure</dt><dd>{goal.progress_measure}</dd></div></dl>
          <div className="tm-actions">
            {clinical && <button className="text-link" onClick={() => setEditing(goal.id)} data-testid={`goal-edit-${goal.id}`}><Pencil size={14} /> Amend</button>}
            {goal.versions && <button className="text-link" onClick={() => setHistoryOpen(historyOpen === goal.id ? null : goal.id)} data-testid={`goal-history-${goal.id}`}><History size={14} /> Version history ({goal.versions.length})</button>}
          </div>
          {historyOpen === goal.id && <ol className="tm-history" data-testid={`goal-history-list-${goal.id}`}>{goal.versions.slice().reverse().map(v => <li key={v.version}><strong>v{v.version}</strong> · {v.by_name} ({v.by_label}) · {fmtTime(v.at)} — {v.change_note}</li>)}</ol>}
          <h4>Observations & contributions</h4>
          <ul className="tm-contributions">{goal.contributions.map(c => <Contribution key={c.id} c={c} clinical={clinical} reload={reload} />)}</ul>
          {!goal.contributions.length && <p className="tm-empty small">No contributions yet.</p>}
          <AddContribution childId={childId} goalId={goal.id} kind={bundle.viewer.kind} reload={reload} />
        </article>))}
    </div>
  );
};
