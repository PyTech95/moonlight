import { useCallback, useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { api, errorText } from '../../lib/api';
import '../../ops.css';

// ---------- money (stored in paise) ----------
export const rupees = (paise = 0) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: paise % 100 ? 2 : 0 }).format(
    (paise || 0) / 100,
  )}`;
export const toPaise = (value) => Math.round(parseFloat(String(value).replace(/[,₹\s]/g, '') || '0') * 100);
export const fromPaise = (paise) => (paise ? String(paise / 100) : '');

// ---------- India dates ----------
const IST = 'Asia/Kolkata';
export const istDate = (value = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(value),
  );
export const istTime = (value) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(value),
  );
export const niceTime = (value) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
export const niceDay = (day) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(`${day}T00:00:00Z`),
  );
export const longDay = (day) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${day}T00:00:00Z`),
  );
// "10:00–10:45 am" (one am/pm, at the end, unless the session crosses noon)
export const timeRange = (start, end) => {
  const parts = (v) => {
    const t = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(v));
    const m = t.match(/^(\d{1,2}:\d{2})\s*([ap]\.?m\.?)$/i);
    return m ? [m[1], m[2].replace(/\./g, '').toLowerCase()] : [t, ''];
  };
  const [a, ap] = parts(start);
  const [b, bp] = parts(end);
  return ap === bp ? `${a}–${b} ${bp}` : `${a} ${ap}–${b} ${bp}`;
};
// "30 Oct 2026" from "2026-10-30"
export const niceDate = (day) =>
  day
    ? new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day.slice(0, 10)}T00:00:00Z`))
    : '';
export const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const mondayOf = (day) => {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
};

// ---------- data loading ----------
export const useLoad = (path, params) => {
  const key = JSON.stringify(params || {});
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const { data } = await api.get(path, { params: JSON.parse(key) });
      setState({ data, error: '', loading: false });
      return data;
    } catch (e) {
      setState({ data: null, error: errorText(e), loading: false });
      return null;
    }
  }, [path, key]);
  useEffect(() => {
    if (path) load();
  }, [load, path]);
  return { ...state, reload: load };
};

// ---------- UI ----------
export const Modal = ({ open, onClose, title, description, wide = false, children, testid }) => (
  <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className={`ops-modal ${wide ? 'ops-modal-wide' : ''}`} data-testid={testid}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="ops-modal-body">{children}</div>
    </DialogContent>
  </Dialog>
);

export const Conflicts = ({ conflicts }) =>
  conflicts?.length ? (
    <div className="ops-conflicts" role="alert" data-testid="conflicts">
      {conflicts.map((c, i) => (
        <div key={i}>
          <CircleAlert size={15} />
          <div>
            <strong>{c.label}</strong>
            {c.clashes?.map((x, j) => (
              <p key={j}>{x.text}</p>
            ))}
            {c.outside_hours && <p>{c.outside_hours}</p>}
          </div>
        </div>
      ))}
    </div>
  ) : null;

export const Stat = ({ label, value, note, tone = 'sage', testid }) => (
  <div className={`ops-stat ${tone}`} data-testid={testid}>
    <span>{label}</span>
    <strong>{value}</strong>
    {note && <small>{note}</small>}
  </div>
);

export const Tabs = ({ tabs, value, onChange, testid = 'ops-tab' }) => (
  <div className="tm-tabs ops-tabs" role="tablist">
    {tabs.map(([key, label, count]) => (
      <button
        key={key}
        type="button"
        role="tab"
        aria-selected={value === key}
        className={value === key ? 'active' : ''}
        onClick={() => onChange(key)}
        data-testid={`${testid}-${key}`}
      >
        {label}
        {count ? <span className="ops-count">{count}</span> : null}
      </button>
    ))}
  </div>
);

export const Field = ({ id, label, hint, children }) => (
  <div className="field tm-field">
    <label htmlFor={id}>{label}</label>
    {children}
    {hint && <small className="tm-hint">{hint}</small>}
  </div>
);

export const INVOICE_TONE = { draft: 'lavender', issued: 'yellow', partly_paid: 'peach', paid: 'sage', void: 'lavender' };
export const INVOICE_LABEL = { draft: 'Draft', issued: 'Due', partly_paid: 'Part paid', paid: 'Paid', void: 'Void' };
