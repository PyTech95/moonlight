import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Settings2, Trash2, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorText, errorDetail } from '../../lib/api';
import { Check, TextField, useAction } from '../team/teamUi';
import {
  Conflicts,
  Field,
  Modal,
  Tabs,
  addDays,
  istDate,
  istTime,
  longDay,
  mondayOf,
  niceDay,
  niceTime,
  timeRange,
  useLoad,
} from './opsUi';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const MODE_LABEL = { center: 'At the center', home: 'At home', online: 'Online (video)' };

const joinVideo = async (session) => {
  try {
    const { data } = await api.post(`/sessions/${session.id}/video/join`);
    window.open(`${data.room_url}?t=${data.token}`, '_blank', 'noopener');
  } catch (e) {
    toast.error(errorText(e));
  }
};

const useDebounced = (value, ms = 350) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

// ---------- booking / rescheduling form ----------
const SessionForm = ({ open, onClose, week, initial, session, onDone }) => {
  const editing = !!session;
  const settings = week.settings || {};
  const [f, setF] = useState(null),
    [check, setCheck] = useState(null),
    [slots, setSlots] = useState(null),
    [busy, setBusy] = useState(false),
    [conflicts, setConflicts] = useState(null);
  useEffect(() => {
    if (!open) return;
    setConflicts(null);
    setCheck(null);
    if (session)
      setF({
        child_id: session.child_id,
        therapist_id: session.therapist_id || '',
        service: session.service,
        date: istDate(session.starts_at),
        time: istTime(session.starts_at),
        duration_minutes: session.duration_minutes,
        mode: session.mode_key || 'center',
        room: (settings.rooms || []).includes(session.room) ? session.room : '',
        notes: session.notes || '',
        repeat_weeks: 0,
        notify: true,
        allow_outside_hours: false,
        reason: '',
      });
    else
      setF({
        child_id: '',
        therapist_id: '',
        service: '',
        date: istDate() < week.days[0] ? week.days[0] : istDate(),
        time: '',
        duration_minutes: settings.default_duration || 45,
        mode: 'center',
        room: settings.rooms?.[0] || '',
        notes: '',
        repeat_weeks: 0,
        notify: true,
        allow_outside_hours: false,
        ...initial,
      });
  }, [open, session, initial, settings.default_duration, settings.rooms, week.days]);
  const child = useMemo(() => (week.children || []).find((c) => c.id === f?.child_id), [week.children, f?.child_id]);
  const therapists = useMemo(() => {
    const list = week.therapists || [];
    if (!child) return list;
    return [...list.filter((t) => child.staff_ids?.includes(t.id)), ...list.filter((t) => !child.staff_ids?.includes(t.id))];
  }, [week.therapists, child]);
  const services = useMemo(() => {
    const list = week.services || [];
    const first = child?.concerns || [];
    return [...first.filter((s) => list.includes(s)), ...list.filter((s) => !first.includes(s))];
  }, [week.services, child]);
  const probe = useDebounced(f && JSON.stringify([f.child_id, f.therapist_id, f.date, f.time, f.duration_minutes, f.mode, f.room, f.repeat_weeks]));
  useEffect(() => {
    if (!open || !f?.child_id || !f.therapist_id || !f.date || !f.time) return setCheck(null);
    let live = true;
    api
      .post('/admin/sessions/check', {
        child_id: f.child_id, therapist_id: f.therapist_id, date: f.date, time: f.time, duration_minutes: Number(f.duration_minutes),
        mode: f.mode, room: f.mode === 'center' ? f.room : '', repeat_weeks: Number(f.repeat_weeks) || 0, exclude_id: session?.id || '',
      })
      .then(({ data }) => live && setCheck(data))
      .catch(() => live && setCheck(null));
    return () => {
      live = false;
    };
  }, [probe]); // eslint-disable-line react-hooks/exhaustive-deps
  const slotProbe = useDebounced(f && JSON.stringify([f.therapist_id, f.date, f.duration_minutes, f.child_id]));
  useEffect(() => {
    if (!open || !f?.therapist_id || !f.date) return setSlots(null);
    let live = true;
    api
      .get('/schedule/slots', { params: { therapist_id: f.therapist_id, date: f.date, duration: Number(f.duration_minutes) || 45, child_id: f.child_id } })
      .then(({ data }) => live && setSlots(data))
      .catch(() => live && setSlots(null));
    return () => {
      live = false;
    };
  }, [slotProbe]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const problems = check?.occurrences?.filter((o) => o.clashes.length || o.outside_hours) || [];
  const hardClash = problems.some((o) => o.clashes.length);
  const outsideOnly = problems.length > 0 && !hardClash;
  const submit = async (skip = false) => {
    setBusy(true);
    setConflicts(null);
    try {
      if (editing) {
        await api.patch(`/admin/sessions/${session.id}`, {
          date: f.date, time: f.time, duration_minutes: Number(f.duration_minutes), therapist_id: f.therapist_id, service: f.service, mode: f.mode,
          room: f.mode === 'center' ? f.room : '', notes: f.notes, version: session.version, allow_outside_hours: f.allow_outside_hours,
          notify: f.notify, reason: f.reason,
        });
        toast.success('Session updated.' + (f.notify ? ' The family has been emailed if the time changed.' : ''));
      } else {
        const { data } = await api.post('/admin/sessions', {
          ...f, duration_minutes: Number(f.duration_minutes), repeat_weeks: Number(f.repeat_weeks) || 0, room: f.mode === 'center' ? f.room : '',
          skip_conflicts: skip,
        });
        toast.success(
          `${data.created} session${data.created === 1 ? '' : 's'} booked` +
            (data.skipped.length ? `, ${data.skipped.length} skipped` : '') +
            (data.notified ? '. The family has been emailed.' : '.'),
        );
      }
      onDone(f.date);
    } catch (e) {
      const detail = errorDetail(e);
      if (detail?.conflicts) setConflicts(detail.conflicts);
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} wide title={editing ? `Change ${session.child_name}’s session` : 'Book a session'} testid="session-form">
      <form className="tm-form" onSubmit={(e) => (e.preventDefault(), submit(false))}>
        <div className="tm-grid-3">
          <Field id="book-child" label="Child">
            <select id="book-child" data-testid="book-child" value={f.child_id} disabled={editing} required
              onChange={(e) => {
                const c = (week.children || []).find((x) => x.id === e.target.value);
                setF((x) => ({ ...x, child_id: e.target.value, therapist_id: x.therapist_id || c?.staff_ids?.find((s) => week.therapists?.some((t) => t.id === s)) || '', service: x.service || c?.concerns?.[0] || '' }));
              }}>
              <option value="">Choose…</option>
              {(week.children || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="book-service" label="Session">
            <select id="book-service" data-testid="book-service" value={f.service} required onChange={(e) => set('service', e.target.value)}>
              <option value="">Choose…</option>
              {services.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field id="book-therapist" label="Therapist">
            <select id="book-therapist" data-testid="book-therapist" value={f.therapist_id} required onChange={(e) => set('therapist_id', e.target.value)}>
              <option value="">Choose…</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name}
                  {child?.staff_ids?.includes(t.id) ? ' (assigned)' : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="tm-grid-3">
          <TextField id="book-date" label="Date" type="date" value={f.date} onChange={(v) => set('date', v)} required />
          <TextField id="book-time" label="Start time" type="time" step="900" value={f.time} onChange={(v) => set('time', v)} required />
          <Field id="book-duration" label="Length">
            <select id="book-duration" value={f.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)}>
              {[30, 40, 45, 60, 75, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </Field>
        </div>
        {slots && (
          <div>
            <small className="tm-hint" style={{ margin: '0 0 4px' }}>
              {slots.working.length ? `Free times on ${niceDay(f.date)} (works ${slots.working.join(', ')}):` : 'Not working on this day.'}
            </small>
            <div className="slot-list" data-testid="slot-list">
              {slots.slots.slice(0, 24).map((s) => (
                <button type="button" key={s} className={f.time === s ? 'on' : ''} onClick={() => set('time', s)}>
                  {s}
                </button>
              ))}
              {slots.working.length > 0 && !slots.slots.length && <span className="ops-muted">Fully booked.</span>}
            </div>
          </div>
        )}
        <div className="tm-grid-3">
          <Field id="book-mode" label="Where">
            <select id="book-mode" value={f.mode} onChange={(e) => set('mode', e.target.value)}>
              {Object.entries(MODE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          {f.mode === 'center' ? (
            <Field id="book-room" label="Room">
              <select id="book-room" value={f.room} onChange={(e) => set('room', e.target.value)}>
                <option value="">No room</option>
                {(settings.rooms || []).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field id="book-where" label=" ">
              <p className="ops-muted" style={{ margin: '10px 0' }}>
                {f.mode === 'home' ? child?.home_address || 'Add the home address on the child’s record first.' : 'A private video room opens 15 minutes before.'}
              </p>
            </Field>
          )}
          {!editing ? (
            <Field id="book-repeat" label="Repeat weekly">
              <select id="book-repeat" data-testid="book-repeat" value={f.repeat_weeks} onChange={(e) => set('repeat_weeks', e.target.value)}>
                <option value={0}>Just this once</option>
                {[3, 5, 7, 11, 15, 23].map((n) => (
                  <option key={n} value={n}>
                    {n + 1} weeks in total
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <TextField id="book-reason" label="Reason for the change (sent to the family)" value={f.reason} onChange={(v) => set('reason', v)} />
          )}
        </div>
        <TextField id="book-notes" label="Note for the therapist (not shown to the family)" value={f.notes} onChange={(v) => set('notes', v)} />
        {check && !problems.length && (
          <p className="ops-ok" data-testid="check-ok">
            {check.occurrences.length > 1 ? `All ${check.occurrences.length} dates are free.` : 'This time is free.'}
          </p>
        )}
        <Conflicts conflicts={conflicts || problems} />
        {outsideOnly && (
          <Check id="book-outside" checked={f.allow_outside_hours} onChange={(v) => set('allow_outside_hours', v)}>
            Book outside the therapist’s usual hours anyway
          </Check>
        )}
        <Check id="book-notify" checked={f.notify} onChange={(v) => set('notify', v)}>
          Email the family {editing ? 'if the time changes' : 'the booking'}
        </Check>
        <div className="ops-actions">
          <button className="button primary" disabled={busy || (hardClash && Number(f.repeat_weeks) === 0) || (outsideOnly && !f.allow_outside_hours)} data-testid="book-submit">
            {editing ? 'Save changes' : 'Book'}
          </button>
          {!editing && hardClash && Number(f.repeat_weeks) > 0 && problems.length < check.occurrences.length && (
            <button type="button" className="button outlined" disabled={busy} onClick={() => submit(true)} data-testid="book-free-only">
              Book the {check.occurrences.length - problems.length} free dates only
            </button>
          )}
          <button type="button" className="button outlined" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---------- one session ----------
const SessionDialog = ({ session, mode, onClose, onEdit, onChanged }) => {
  const [cancel, setCancel] = useState(false),
    [reason, setReason] = useState(''),
    [scope, setScope] = useState('one'),
    { busy, run } = useAction();
  if (!session) return null;
  const started = new Date(session.starts_at) - Date.now() < 30 * 60000;
  const cancelled = session.status === 'Cancelled';
  const mark = (attendance) =>
    run('att', () => api.patch(`/appointments/${session.id}/attendance`, { attendance, version: session.version }), `Marked ${attendance.toLowerCase()}.`).then(
      (ok) => ok && onChanged(),
    );
  return (
    <Modal open onClose={onClose} title={`${session.child_name} · ${session.service}`} testid="session-dialog"
      description={`${longDay(istDate(session.starts_at))}, ${timeRange(session.starts_at, session.ends_at)}`}>
      <p>
        {session.therapist_name || session.staff_label} · {session.mode_key === 'center' || !session.mode_key ? session.room || 'At the center' : session.mode}
      </p>
      <p>
        <span className={`status ${cancelled ? 'lavender' : 'sage'}`}>{session.status}</span>{' '}
        {!cancelled && <span className="status yellow">Attendance: {session.attendance}</span>}{' '}
        {session.billing?.status === 'package' && <span className="status sage">Package · {session.billing.package_name}</span>}
        {session.billing?.status === 'invoiced' && <span className="status sage">Invoiced</span>}
      </p>
      {session.notes && mode !== 'parent' && <p className="ops-muted">Note: {session.notes}</p>}
      {cancelled && session.cancel_reason && <p className="ops-muted">Cancelled: {session.cancel_reason}</p>}
      {!cancelled && session.mode_key === 'online' && mode !== 'manage' && (
        <button className="button primary compact" onClick={() => joinVideo(session)} data-testid="session-join">
          <Video size={15} /> Join video
        </button>
      )}
      {!cancelled && mode !== 'parent' && started && (
        <div className="ops-actions">
          <span className="ops-muted">Attendance:</span>
          {['Present', 'Absent', 'Not recorded'].map((a) => (
            <button key={a} className={`button compact ${session.attendance === a ? 'primary' : 'outlined'}`} disabled={busy === 'att' || session.attendance === a}
              onClick={() => mark(a)} data-testid={`attendance-${a.replace(' ', '-').toLowerCase()}`}>
              {a}
            </button>
          ))}
        </div>
      )}
      {mode === 'manage' && !cancelled && !cancel && (
        <div className="ops-actions">
          <button className="button outlined compact" onClick={onEdit} data-testid="session-edit">
            Change time or therapist
          </button>
          <button className="text-button danger" onClick={() => setCancel(true)} data-testid="session-cancel">
            Cancel session
          </button>
        </div>
      )}
      {cancel && (
        <form className="tm-form" onSubmit={async (e) => {
          e.preventDefault();
          if (await run('c', () => api.post(`/admin/sessions/${session.id}/cancel`, { reason, scope, notify: true }), (r) => r.data.message)) onChanged();
        }}>
          <TextField id="cancel-reason" label="Reason (sent to the family)" value={reason} onChange={setReason} required minLength={3} />
          {session.series_id && (
            <Field id="cancel-scope" label="Which sessions">
              <select id="cancel-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="one">Only this one</option>
                <option value="series">This and all later ones in the weekly series</option>
              </select>
            </Field>
          )}
          <button className="button primary" disabled={busy === 'c'} data-testid="cancel-confirm">
            Cancel and tell the family
          </button>
        </form>
      )}
      {mode === 'manage' && session.history?.length > 0 && (
        <details>
          <summary className="ops-muted">History</summary>
          <ul className="history-list">
            {session.history.map((h, i) => (
              <li key={i}>
                {new Date(h.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · {h.by_name} · {h.action}
                {h.detail ? ` · ${h.detail}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
};

// ---------- family requests ----------
const Requests = ({ week, reload }) => {
  const [open, setOpen] = useState(null),
    [f, setF] = useState({ date: '', time: '', note: '' }),
    { busy, run } = useAction();
  const slots = useLoad(open && open.kind === 'Reschedule' && f.date && open.appointment?.therapist_id ? '/schedule/slots' : null, {
    therapist_id: open?.appointment?.therapist_id, date: f.date, duration: open?.appointment?.duration_minutes || 45, child_id: open?.appointment?.child_id,
  });
  const decide = (decision) =>
    run('d', () => api.post(`/admin/requests/${open.id}/decision`, { decision, ...f }), (r) => r.data.message).then((ok) => ok && (setOpen(null), reload()));
  if (!week.requests?.length) return <div className="ops-empty">No change requests from families right now.</div>;
  return (
    <>
      {week.requests.map((r) => (
        <article className="request-card" key={r.id} data-testid={`request-${r.id}`}>
          <div>
            <strong>
              {r.child_name} · {r.kind === 'Reschedule' ? 'wants to move' : 'will be absent from'} {r.service}
            </strong>
            {r.appointment && (
              <p>
                Booked: {niceDay(istDate(r.appointment.starts_at))}, {niceTime(r.appointment.starts_at)} with {r.appointment.therapist_name || r.appointment.staff_label}
              </p>
            )}
            {r.preferred_date && <p>Preferred date: {niceDay(r.preferred_date)}</p>}
            <p className="ops-muted">“{r.reason}”</p>
          </div>
          <button className="button outlined compact"
            onClick={() => (setOpen(r), setF({ date: r.preferred_date || '', time: r.appointment ? istTime(r.appointment.starts_at) : '', note: '' }))}
            data-testid={`request-open-${r.id}`}>
            Answer
          </button>
        </article>
      ))}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.child_name}: ${open.kind.toLowerCase()} request` : ''}>
        {open && (
          <div className="tm-form">
            {open.kind === 'Reschedule' ? (
              <>
                <div className="tm-grid-2">
                  <TextField id="req-date" label="New date" type="date" value={f.date} onChange={(v) => setF({ ...f, date: v })} />
                  <TextField id="req-time" label="New time" type="time" step="900" value={f.time} onChange={(v) => setF({ ...f, time: v })} />
                </div>
                {slots.data && (
                  <div className="slot-list">
                    {slots.data.slots.slice(0, 20).map((s) => (
                      <button type="button" key={s} className={f.time === s ? 'on' : ''} onClick={() => setF({ ...f, time: s })}>
                        {s}
                      </button>
                    ))}
                    {!slots.data.slots.length && <span className="ops-muted">No free time with this therapist that day.</span>}
                  </div>
                )}
              </>
            ) : (
              <p>Approving cancels the session and records the absence.</p>
            )}
            <TextField id="req-note" label="Message to the family" value={f.note} onChange={(v) => setF({ ...f, note: v })} placeholder="Required when declining" />
            <div className="ops-actions">
              <button className="button primary" disabled={busy === 'd' || (open.kind === 'Reschedule' && (!f.date || !f.time))} onClick={() => decide('approve')} data-testid="request-approve">
                {open.kind === 'Reschedule' ? 'Move the session' : 'Approve absence'}
              </button>
              <button className="button outlined" disabled={busy === 'd'} onClick={() => decide('decline')} data-testid="request-decline">
                Decline
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

// ---------- therapist hours ----------
const Availability = ({ week, reload }) => {
  const [who, setWho] = useState(week.therapists?.[0]?.id || ''),
    [f, setF] = useState(null),
    { busy, run } = useAction();
  const therapist = (week.therapists || []).find((t) => t.id === who);
  useEffect(() => {
    if (!therapist) return setF(null);
    const s = week.settings;
    const weekly = therapist.availability?.weekly ||
      Object.fromEntries(DAY_KEYS.map((d) => [d, s.open_days.includes(d) ? [{ start: s.day_start, end: s.day_end }] : []]));
    setF({ weekly: Object.fromEntries(DAY_KEYS.map((d) => [d, weekly[d] || []])), time_off: therapist.availability?.time_off || [], custom: !!therapist.availability });
  }, [therapist, week.settings]);
  if (!week.therapists?.length) return <div className="ops-empty">No therapist accounts yet. Invite therapists from Accounts &amp; consent.</div>;
  const setSpan = (d, i, k, v) => setF({ ...f, weekly: { ...f.weekly, [d]: f.weekly[d].map((w, j) => (j === i ? { ...w, [k]: v } : w)) } });
  const save = () =>
    run('s', () => api.put(`/admin/staff/${who}/availability`, { weekly: f.weekly, time_off: f.time_off }), 'Working hours saved.').then((ok) => ok && reload());
  return (
    <div className="tm-card">
      <div className="tm-row" style={{ marginBottom: 12 }}>
        <select aria-label="Therapist" value={who} onChange={(e) => setWho(e.target.value)} style={{ maxWidth: 280, minHeight: 40 }} data-testid="avail-therapist">
          {week.therapists.map((t) => (
            <option key={t.id} value={t.id}>
              {t.display_name}
            </option>
          ))}
        </select>
        {f && !f.custom && <span className="ops-muted">Using the center’s opening hours until saved.</span>}
      </div>
      {f && (
        <>
          <div className="avail-grid">
            {DAY_KEYS.map((d) => (
              <div className="avail-row" key={d}>
                <strong>{DAY_NAMES[d]}</strong>
                <div className="spans">
                  {f.weekly[d].map((w, i) => (
                    <span key={i} className="tm-row">
                      <input type="time" step="900" aria-label={`${d} start`} value={w.start} onChange={(e) => setSpan(d, i, 'start', e.target.value)} />–
                      <input type="time" step="900" aria-label={`${d} end`} value={w.end} onChange={(e) => setSpan(d, i, 'end', e.target.value)} />
                      <button className="icon-button" aria-label="Remove hours" onClick={() => setF({ ...f, weekly: { ...f.weekly, [d]: f.weekly[d].filter((_, j) => j !== i) } })}>
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  {!f.weekly[d].length && <span className="ops-muted">Off</span>}
                  <button className="text-button" onClick={() => setF({ ...f, weekly: { ...f.weekly, [d]: [...f.weekly[d], { start: '10:00', end: '14:00' }] } })}>
                    <Plus size={13} /> Hours
                  </button>
                </div>
              </div>
            ))}
          </div>
          <h4>Leave and days off</h4>
          {f.time_off.map((o, i) => (
            <div className="tm-row" key={i} style={{ marginBottom: 6 }}>
              <input type="date" aria-label="Leave from" value={o.start} style={{ width: 160, minHeight: 36 }} onChange={(e) => setF({ ...f, time_off: f.time_off.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
              to
              <input type="date" aria-label="Leave until" value={o.end} style={{ width: 160, minHeight: 36 }} onChange={(e) => setF({ ...f, time_off: f.time_off.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
              <input aria-label="Leave note" placeholder="Note" value={o.note} style={{ width: 180, minHeight: 36 }} onChange={(e) => setF({ ...f, time_off: f.time_off.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
              <button className="icon-button" aria-label="Remove leave" onClick={() => setF({ ...f, time_off: f.time_off.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="text-button" onClick={() => setF({ ...f, time_off: [...f.time_off, { start: istDate(), end: istDate(), note: '' }] })}>
            <Plus size={13} /> Add leave
          </button>
          <div className="ops-actions">
            <button className="button primary" disabled={busy === 's'} onClick={save} data-testid="avail-save">
              Save hours for {therapist?.display_name}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ---------- center settings ----------
const CenterSettings = ({ week, reload }) => {
  const [f, setF] = useState(week.settings),
    [room, setRoom] = useState(''),
    { busy, run } = useAction();
  useEffect(() => setF(week.settings), [week.settings]);
  if (!f) return null;
  return (
    <div className="tm-card tm-form">
      <h3>
        <Settings2 size={17} /> Center hours and rooms
      </h3>
      <Field id="open-days" label="Open on">
        <div className="tm-row">
          {DAY_KEYS.map((d) => (
            <Check key={d} id={`open-${d}`} checked={f.open_days.includes(d)}
              onChange={(on) => setF({ ...f, open_days: on ? [...f.open_days, d] : f.open_days.filter((x) => x !== d) })}>
              {DAY_NAMES[d]}
            </Check>
          ))}
        </div>
      </Field>
      <div className="tm-grid-3">
        <TextField id="day-start" label="Opens" type="time" value={f.day_start} onChange={(v) => setF({ ...f, day_start: v })} />
        <TextField id="day-end" label="Closes" type="time" value={f.day_end} onChange={(v) => setF({ ...f, day_end: v })} />
        <Field id="default-duration" label="Usual session length">
          <select id="default-duration" value={f.default_duration} onChange={(e) => setF({ ...f, default_duration: Number(e.target.value) })}>
            {[30, 40, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="rooms" label="Rooms (checked for double-booking)">
        <div>
          {f.rooms.map((r) => (
            <span className="ops-chip" key={r}>
              {r}
              <button type="button" aria-label={`Remove ${r}`} onClick={() => setF({ ...f, rooms: f.rooms.filter((x) => x !== r) })}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="tm-row" style={{ marginTop: 6 }}>
          <input aria-label="New room" placeholder="e.g. Sensory gym" value={room} onChange={(e) => setRoom(e.target.value)} style={{ maxWidth: 240, minHeight: 38 }} />
          <button type="button" className="button outlined compact" disabled={!room.trim()} onClick={() => (setF({ ...f, rooms: [...f.rooms, room.trim()] }), setRoom(''))}>
            Add room
          </button>
        </div>
      </Field>
      <Check id="notify-family" checked={f.notify_family} onChange={(v) => setF({ ...f, notify_family: v })}>
        Email families when sessions are booked, moved or cancelled
      </Check>
      <Check id="reminders" checked={f.reminders} onChange={(v) => setF({ ...f, reminders: v })}>
        Email a reminder the evening before each session
      </Check>
      <div className="ops-actions">
        <button className="button primary" disabled={busy === 's'} data-testid="sched-settings-save"
          onClick={() => run('s', () => api.patch('/admin/schedule/settings', f), 'Schedule settings saved.').then((ok) => ok && reload())}>
          Save
        </button>
      </div>
    </div>
  );
};

// ---------- the board ----------
export const ScheduleBoard = ({ mode = 'manage' }) => {
  const [params, setParams] = useSearchParams();
  const [weekStart, setWeekStart] = useState(() => mondayOf(istDate())),
    [therapist, setTherapist] = useState(''),
    [tab, setTab] = useState('week'),
    [booking, setBooking] = useState(null),
    [selected, setSelected] = useState(null),
    [editing, setEditing] = useState(null),
    [showCancelled, setShowCancelled] = useState(false);
  const week = useLoad('/schedule', { week: weekStart, therapist_id: therapist });
  const data = week.data;
  const bookChild = params.get('book');
  const opened = useRef(false);
  useEffect(() => {
    if (mode === 'manage' && bookChild && data && !opened.current) {
      opened.current = true;
      setBooking({ child_id: bookChild });
    }
  }, [bookChild, data, mode]);
  const tone = useMemo(() => Object.fromEntries((data?.therapists || []).map((t, i) => [t.id, `t${(i % 5) + 1}`])), [data?.therapists]);
  if (week.error) return <p className="error-message">{week.error}</p>;
  if (!data) return <div className="loading-screen">Loading the week…</div>;
  const byDay = Object.fromEntries(data.days.map((d) => [d, []]));
  data.sessions.forEach((s) => {
    if (s.status === 'Cancelled' && !showCancelled) return;
    const d = istDate(s.starts_at);
    if (byDay[d]) byDay[d].push({ ...s, kind: 'session' });
  });
  (data.classes || []).forEach((c) => {
    const d = istDate(c.starts_at);
    if (byDay[d] && (!therapist || c.therapist_id === therapist)) byDay[d].push({ ...c, kind: 'class' });
  });
  Object.values(byDay).forEach((list) => list.sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
  const open = data.settings?.open_days || DAY_KEYS;
  const refresh = () => week.reload();
  const tabs = [['week', 'Week'], ['requests', 'Family requests', data.requests?.length || 0], ['hours', 'Therapist hours'], ['settings', 'Rooms & hours']];
  return (
    <div data-testid={`schedule-${mode}`}>
      {mode === 'manage' && <Tabs tabs={tabs} value={tab} onChange={setTab} testid="sched-tab" />}
      {tab === 'requests' && <Requests week={data} reload={refresh} />}
      {tab === 'hours' && <Availability week={data} reload={refresh} />}
      {tab === 'settings' && <CenterSettings week={data} reload={refresh} />}
      {tab === 'week' && (
        <>
          <div className="sched-head">
            <h2 data-testid="sched-range">
              {niceDay(data.days[0])} – {niceDay(data.days[6])}
            </h2>
            <button className="icon-button" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} data-testid="sched-prev">
              <ChevronLeft size={18} />
            </button>
            <button className="button outlined compact" onClick={() => setWeekStart(mondayOf(istDate()))}>
              This week
            </button>
            <button className="icon-button" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} data-testid="sched-next">
              <ChevronRight size={18} />
            </button>
            {mode === 'manage' && (
              <select aria-label="Filter by therapist" value={therapist} onChange={(e) => setTherapist(e.target.value)} data-testid="sched-filter">
                <option value="">All therapists</option>
                {data.therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.display_name}
                  </option>
                ))}
              </select>
            )}
            <label className="tm-check" style={{ margin: 0 }}>
              <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> <span>Show cancelled</span>
            </label>
            {mode === 'manage' && (
              <button className="button primary compact" style={{ marginLeft: 'auto' }} onClick={() => setBooking({})} data-testid="sched-book">
                <CalendarPlus size={15} /> Book a session
              </button>
            )}
          </div>
          <div className="sched-week">
            {data.days.map((d, i) => {
              const items = byDay[d];
              const closed = !open.includes(DAY_KEYS[i]);
              return (
                <section key={d} className={`sched-day ${d === data.today ? 'today' : ''} ${closed ? 'closed' : ''} ${items.length ? '' : 'empty-day'}`} data-testid={`sched-day-${d}`}>
                  <header>
                    <span>{niceDay(d)}</span>
                    {mode === 'manage' && !closed && (
                      <button aria-label={`Book on ${d}`} onClick={() => setBooking({ date: d })}>
                        <Plus size={15} />
                      </button>
                    )}
                  </header>
                  <div className="sched-items">
                    {items.map((s) =>
                      s.kind === 'class' ? (
                        <div className="sched-item class" key={`c-${s.id}`}>
                          <strong>
                            {niceTime(s.starts_at)} · Group class
                          </strong>
                          <span>{s.title}</span>
                          <span>{s.therapist_name}</span>
                        </div>
                      ) : (
                        <button
                          key={s.id}
                          className={`sched-item ${tone[s.therapist_id] || ''} ${s.status === 'Cancelled' ? 'cancelled' : ''}`}
                          onClick={() => setSelected(s)}
                          data-testid={`sched-item-${s.id}`}>
                          <strong>{timeRange(s.starts_at, s.ends_at)}</strong>
                          <span>
                            {mode === 'parent' ? s.service : `${s.child_name} · ${s.service}`}
                          </span>
                          <span>
                            {mode !== 'therapist' && (s.therapist_name || s.staff_label)}
                            {mode !== 'therapist' && ' · '}
                            {s.mode_key === 'online' ? 'Online' : s.mode_key === 'home' ? 'Home visit' : s.room || 'Center'}
                          </span>
                          {s.status !== 'Cancelled' && new Date(s.starts_at) < new Date() && s.attendance === 'Not recorded' && mode !== 'parent' && (
                            <span className="flag">Attendance not marked</span>
                          )}
                        </button>
                      ),
                    )}
                    {!items.length && <span className="ops-muted" style={{ padding: 6 }}>{closed ? 'Closed' : '—'}</span>}
                  </div>
                </section>
              );
            })}
          </div>
          {mode === 'manage' && data.therapists.length > 1 && (
            <div className="sched-legend">
              {data.therapists.map((t) => (
                <span key={t.id} className={`sched-item ${tone[t.id]}`} style={{ display: 'inline', padding: '2px 8px' }}>
                  {t.display_name}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {mode === 'manage' && (
        <SessionForm
          open={!!booking || !!editing}
          onClose={() => {
            setBooking(null);
            setEditing(null);
            if (bookChild) setParams({});
          }}
          week={data}
          initial={booking}
          session={editing}
          onDone={(day) => {
            setBooking(null);
            setEditing(null);
            if (bookChild) setParams({});
            setWeekStart(mondayOf(day));
            refresh();
          }}
        />
      )}
      {selected && !editing && (
        <SessionDialog
          session={selected}
          mode={mode}
          onClose={() => setSelected(null)}
          onEdit={() => (setEditing(selected), setSelected(null))}
          onChanged={() => (setSelected(null), refresh())}
        />
      )}
    </div>
  );
};

export { joinVideo };
export default ScheduleBoard;
