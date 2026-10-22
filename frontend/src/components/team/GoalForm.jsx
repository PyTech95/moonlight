import { useState } from 'react';
import { api } from '../../lib/api';
import { TextField, Check, useAction } from './teamUi';

const empty = { title: '', description: '', strategies: { home: '', school: '', therapy: '' }, responsible: '', review_date: '', progress_measure: '', school_visible: false, change_note: '' };

export const GoalForm = ({ childId, goal, onDone, onCancel }) => {
  const [form, setForm] = useState(() => goal ? { ...goal, responsible: (goal.responsible || []).join(', '), change_note: '' } : empty);
  const { busy, run } = useAction();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setS = (k, v) => setForm(f => ({ ...f, strategies: { ...f.strategies, [k]: v } }));
  const submit = async e => {
    e.preventDefault();
    const body = { title: form.title, description: form.description, strategies: form.strategies, review_date: form.review_date,
      progress_measure: form.progress_measure, school_visible: form.school_visible,
      responsible: form.responsible.split(',').map(s => s.trim()).filter(Boolean) };
    const ok = await run('save', () => goal
      ? api.patch(`/team/children/${childId}/goals/${goal.id}`, { ...body, version: goal.version, change_note: form.change_note })
      : api.post(`/team/children/${childId}/goals`, body), goal ? 'New goal version published. The earlier version is kept.' : 'Goal published to the shared plan.');
    if (ok) onDone();
  };
  const p = goal ? `goal-edit-${goal.id}` : 'goal-new';
  return (
    <form className="tm-card tm-form" onSubmit={submit} data-testid={`${p}-form`}>
      <h3>{goal ? `Amend goal · v${goal.published_version}` : 'New shared goal'}</h3>
      <TextField id={`${p}-title`} label="Goal" value={form.title} onChange={v => set('title', v)} required minLength={3} />
      <TextField id={`${p}-description`} label="Clear description" area value={form.description} onChange={v => set('description', v)} required minLength={3} />
      <div className="tm-grid-3">
        <TextField id={`${p}-home`} label="Strategy at home" area value={form.strategies.home} onChange={v => setS('home', v)} />
        <TextField id={`${p}-school`} label="Strategy at school" area value={form.strategies.school} onChange={v => setS('school', v)} />
        <TextField id={`${p}-therapy`} label="Strategy in therapy" area value={form.strategies.therapy} onChange={v => setS('therapy', v)} />
      </div>
      <div className="tm-grid-3">
        <TextField id={`${p}-responsible`} label="Responsible team members" value={form.responsible} onChange={v => set('responsible', v)} hint="Separate names with commas" />
        <TextField id={`${p}-review`} label="Review date" type="date" value={form.review_date} onChange={v => set('review_date', v)} required />
        <TextField id={`${p}-measure`} label="Agreed progress measure" value={form.progress_measure} onChange={v => set('progress_measure', v)} required minLength={3} />
      </div>
      <Check id={`${p}-school-visible`} checked={form.school_visible} onChange={v => set('school_visible', v)}>Include this goal in what the family has agreed to share with school</Check>
      {goal && <TextField id={`${p}-note`} label="What changed and why?" value={form.change_note} onChange={v => set('change_note', v)} required minLength={3} />}
      <div className="tm-actions">
        <button className="button primary" disabled={busy === 'save'} data-testid={`${p}-submit`}>{busy === 'save' ? 'Publishing…' : goal ? 'Publish new version' : 'Publish goal'}</button>
        <button type="button" className="text-link" onClick={onCancel} data-testid={`${p}-cancel`}>Cancel</button>
      </div>
    </form>
  );
};
