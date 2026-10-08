import { useEffect, useState } from 'react';
import { CalendarClock, Home, MapPin, Monitor, Plus, Users } from 'lucide-react';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/context';
import { services } from '../../lib/content';
import { PortalHeading } from '../PortalLayout';
import { SelectField, TextField, fmtTime, useAction } from '../team/teamUi';
import { VideoRoom } from './VideoRoom';

export const FORMAT_META = { center: ['At the center', MapPin, 'sage'], online: ['Online', Monitor, 'lavender'], home: ['At home', Home, 'yellow'] };
const FILTERS = [['all', 'All formats'], ['center', 'At the center'], ['online', 'Online'], ['home', 'At home']];

const CreateClass = ({ therapists, onDone }) => {
  const { user } = useAuth();
  const [f, setF] = useState({ title: '', therapy: services[0]?.title || '', format: 'online', starts_at: '', duration_minutes: 45, capacity: 4, therapist_id: therapists?.[0]?.id || '', area: '', notes: '' });
  const { busy, run } = useAction();
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const submit = async e => { e.preventDefault(); if (await run('c', () => api.post('/classes', { ...f, starts_at: new Date(f.starts_at).toISOString(), duration_minutes: Number(f.duration_minutes), capacity: Number(f.capacity) }), 'Class scheduled.')) onDone(); };
  return (
    <form className="tm-card tm-form" onSubmit={submit} data-testid="class-create-form">
      <h3>Schedule a therapy class</h3>
      <div className="tm-grid-2">
        <TextField id="class-title" label="Class title" value={f.title} onChange={v => set('title', v)} required minLength={3} />
        <SelectField id="class-therapy" label="Therapy" value={f.therapy} onChange={v => set('therapy', v)} options={services.map(s => [s.title, s.title])} />
      </div>
      <div className="tm-grid-3">
        <SelectField id="class-format" label="Format" value={f.format} onChange={v => set('format', v)} options={FILTERS.slice(1)} />
        <TextField id="class-starts" label="Starts" type="datetime-local" value={f.starts_at} onChange={v => set('starts_at', v)} required />
        <TextField id="class-duration" label="Minutes" type="number" min={15} max={180} value={f.duration_minutes} onChange={v => set('duration_minutes', v)} />
      </div>
      <div className="tm-grid-3">
        {f.format !== 'home' && <TextField id="class-capacity" label="Children (max 6)" type="number" min={1} max={6} value={f.capacity} onChange={v => set('capacity', v)} />}
        {user.role === 'admin' && <SelectField id="class-therapist" label="Therapist" value={f.therapist_id} onChange={v => set('therapist_id', v)} options={(therapists || []).map(t => [t.id, t.display_name])} />}
        {f.format !== 'online' && <TextField id="class-area" label={f.format === 'home' ? 'Home-visit service area' : 'Location'} value={f.area} onChange={v => set('area', v)} required={f.format === 'home'} />}
      </div>
      <TextField id="class-notes" label="Notes for families" area value={f.notes} onChange={v => set('notes', v)} />
      {f.format === 'home' && <p className="tm-hint">At-home classes are one child per visit. The address is shared only with the assigned therapist and administrators.</p>}
      <button className="button primary" disabled={busy === 'c'} data-testid="class-create-submit">Schedule class</button>
    </form>
  );
};

const BookForm = ({ klass, children, reload }) => {
  const [childId, setChildId] = useState(children[0]?.id || ''), [address, setAddress] = useState(''), [notes, setNotes] = useState('');
  const { busy, run } = useAction();
  const book = async e => { e.preventDefault(); if (await run('b', () => api.post(`/classes/${klass.id}/book`, { child_id: childId, home_address: address, access_notes: notes }), r => r.data.message)) reload(); };
  return (
    <form className="tm-sub" onSubmit={book} data-testid={`class-book-form-${klass.id}`}>
      {children.length > 1 && <SelectField id={`class-book-child-${klass.id}`} label="Child" value={childId} onChange={setChildId} options={children.map(c => [c.id, c.name])} />}
      {klass.format === 'home' && <><TextField id={`class-book-address-${klass.id}`} label="Home address for the visit" area value={address} onChange={setAddress} required minLength={8} hint="Shared only with the assigned therapist and the center." /><TextField id={`class-book-notes-${klass.id}`} label="Access notes (optional)" value={notes} onChange={setNotes} placeholder="Gate code, floor, parking…" /></>}
      <button className="button primary" disabled={busy === 'b' || klass.seats_left < 1} data-testid={`class-book-submit-${klass.id}`}>{klass.seats_left < 1 ? 'Class full' : 'Book this class'}</button>
    </form>
  );
};

const ClassCard = ({ klass, role, data, reload }) => {
  const [label, Icon, tone] = FORMAT_META[klass.format];
  const [booking, setBooking] = useState(false);
  const { busy, run } = useAction();
  const cancelled = klass.status === 'cancelled';
  const booked = role === 'parent' && klass.my_bookings.length > 0;
  return (
    <article className={`tm-card cl-card format-${klass.format}`} data-testid={`class-${klass.id}`}>
      <div className="tm-row"><span className={`status ${tone}`}><Icon size={13} /> {label}</span><h3>{klass.title}</h3>{cancelled && <span className="status peach">Cancelled</span>}{booked && <span className="status sage" data-testid={`class-booked-${klass.id}`}>Booked</span>}</div>
      <p className="tm-meta"><CalendarClock size={13} /> {fmtTime(klass.starts_at)} · {klass.duration_minutes} min · {klass.therapy} · with {klass.therapist_name}{klass.area && ` · ${klass.area}`}</p>
      {klass.notes && <p>{klass.notes}</p>}
      {role === 'parent' ? <>
        <p className="tm-meta"><Users size={13} /> {klass.seats_left} of {klass.capacity} places left</p>
        {klass.my_bookings.map(b => <div className="tm-inline" key={b.id}><span>{b.child_name}{b.home_address && ` · ${b.home_address}`}</span><button className="text-link danger" disabled={busy === b.id} onClick={async () => { if (await run(b.id, () => api.post(`/classes/bookings/${b.id}/cancel`), 'Booking cancelled.')) reload(); }} data-testid={`class-booking-cancel-${b.id}`}>Cancel booking</button></div>)}
        {!booked && !cancelled && (booking ? <BookForm klass={klass} children={data.children} reload={reload} /> : <button className="button outlined" onClick={() => setBooking(true)} data-testid={`class-book-${klass.id}`}>Book a place</button>)}
      </> : <>
        <h4>Booked children ({klass.bookings.length}/{klass.capacity})</h4>
        <ul className="tm-list">{klass.bookings.map(b => <li key={b.id} data-testid={`class-roster-${b.id}`}>{b.child_name} · {b.guardian_name}{b.home_address && ` · ${b.home_address}`}{b.access_notes && ` (${b.access_notes})`}</li>)}{!klass.bookings.length && <li className="tm-empty small">No bookings yet.</li>}</ul>
        {!cancelled && <button className="text-link danger" disabled={busy === 'x'} onClick={async () => { if (await run('x', () => api.post(`/classes/${klass.id}/cancel`), r => r.data.message)) reload(); }} data-testid={`class-cancel-${klass.id}`}>Cancel class</button>}
      </>}
      {klass.format === 'online' && !cancelled && (role === 'staff' || booked) && <VideoRoom klass={klass} connected={data.video_connected} />}
    </article>
  );
};

export const ClassesPage = ({ role }) => {
  const [data, setData] = useState(null), [error, setError] = useState(''), [filter, setFilter] = useState('all'), [adding, setAdding] = useState(false);
  const load = () => api.get('/classes').then(r => setData(r.data)).catch(e => setError(errorText(e)));
  useEffect(() => { load(); }, []);
  if (error) return <div className="error-state" role="alert" data-testid="classes-error">{error}</div>;
  if (!data) return <div className="loading-screen" data-testid="classes-loading">Loading classes…</div>;
  const list = data.classes.filter(c => filter === 'all' || c.format === filter);
  const copy = { parent: ['THERAPY CLASSES', 'Classes for your child', 'Choose a therapy class at the center, online by video, or at home.'], staff: ['YOUR SCHEDULE', 'Your classes', 'Center, online and at-home classes assigned to you.'], admin: ['THERAPY CLASSES', 'Classes & schedule', 'Schedule center, online and at-home therapy classes.'] }[role];
  return <>
    <PortalHeading eyebrow={copy[0]} title={copy[1]} subtitle={copy[2]} action={role !== 'parent' && !adding && <button className="button primary" onClick={() => setAdding(true)} data-testid="class-new-button"><Plus size={16} /> New class</button>} />
    {!data.video_connected && <p className="tm-note" data-testid="classes-video-status">In-app video calling is not connected yet. Online classes can be booked, but the video room opens only after the center connects its video provider.</p>}
    {adding && <CreateClass therapists={data.therapists} onDone={() => { setAdding(false); load(); }} />}
    <div className="filter-bar" data-testid="classes-format-filter">{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? 'filter active' : 'filter'} aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`classes-filter-${k}`}>{l}</button>)}</div>
    {!list.length && <p className="tm-empty" data-testid="classes-empty">No upcoming classes in this format.</p>}
    {list.map(c => <ClassCard key={c.id} klass={c} role={role} data={data} reload={load} />)}
  </>;
};
