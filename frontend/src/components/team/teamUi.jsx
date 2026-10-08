import { useState } from 'react';
import { toast } from 'sonner';
import { errorText } from '../../lib/api';

export const SCOPE_LABELS = {
  profile: 'Practical child support profile',
  goals: 'Selected goals and progress summaries',
  activities: 'School activities and classroom strategies',
  documents: 'Selected reports and documents',
  videos: 'Specific videos approved for school use',
  safety: 'Relevant safety information',
  messages: 'Team messages and meetings',
  download: 'Download shared documents (separate permission)',
};

export const KIND_TONE = { parent: 'sage', therapist: 'lavender', school: 'yellow', coordinator: 'peach' };

export const fmt = value => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
export const fmtTime = value => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—';

export const useAction = () => {
  const [busy, setBusy] = useState('');
  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      const result = await fn();
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
      return result ?? true;
    } catch (error) {
      toast.error(errorText(error));
      return null;
    } finally {
      setBusy('');
    }
  };
  return { busy, run };
};

export const TextField = ({ id, label, value, onChange, area = false, hint, ...rest }) => (
  <div className="field tm-field">
    <label htmlFor={id}>{label}</label>
    {area
      ? <textarea id={id} data-testid={id} value={value} onChange={e => onChange(e.target.value)} {...rest} />
      : <input id={id} data-testid={id} value={value} onChange={e => onChange(e.target.value)} {...rest} />}
    {hint && <small className="tm-hint">{hint}</small>}
  </div>
);

export const SelectField = ({ id, label, value, onChange, options }) => (
  <div className="field tm-field">
    <label htmlFor={id}>{label}</label>
    <select id={id} data-testid={id} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </div>
);

export const Check = ({ id, checked, onChange, children }) => (
  <label className="tm-check" htmlFor={id}>
    <input id={id} type="checkbox" data-testid={id} checked={checked} onChange={e => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
);

export const AuthorTag = ({ record }) => (
  <span className={`status ${KIND_TONE[record.author_kind] || 'sage'}`}>{record.author_label} · {record.author_name}</span>
);
