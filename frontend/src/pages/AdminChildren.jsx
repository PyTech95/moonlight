import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarPlus,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  Archive,
  RotateCcw,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorText, dateLabel } from '../lib/api';
import { PortalHeading, useWorkspace } from '../components/PortalLayout';
import { Check, TextField, useAction } from '../components/team/teamUi';
import { Modal, Tabs, useLoad, rupees, niceTime, Field } from '../components/ops/opsUi';

export const opsAccess = (user) => {
  const profile = user?.access_profile;
  const admin = user?.role === 'admin' || profile === 'administrator';
  return {
    manageChildren: admin || profile === 'reception',
    accounts: admin,
    billing: admin || profile === 'finance',
    billingRead: admin || profile === 'finance' || profile === 'reception',
    schedule: admin || profile === 'reception',
  };
};

const blankContact = () => ({ name: '', relation: 'Mother', phone: '', email: '', primary: false });

const ChildForm = ({ open, onClose, initial, onSaved, services }) => {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      setF({
        name: '',
        date_of_birth: '',
        age_label: '',
        gender: '',
        school: '',
        concerns: [],
        communication: '',
        admin_notes: '',
        home_address: '',
        ...initial,
        contacts: initial?.contacts?.length ? initial.contacts.map((c) => ({ ...c, email: c.email || '' })) : [{ ...blankContact(), primary: true }],
      });
  }, [open, initial]);
  if (!f) return null;
  const set = (k, v) => setF({ ...f, [k]: v });
  const setContact = (i, k, v) =>
    setF({
      ...f,
      contacts: f.contacts.map((c, j) => (k === 'primary' ? { ...c, primary: i === j } : j === i ? { ...c, [k]: v } : c)),
    });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      name: f.name,
      date_of_birth: f.date_of_birth || '',
      age_label: f.date_of_birth ? '' : f.age_label,
      gender: f.gender,
      school: f.school,
      concerns: f.concerns,
      communication: f.communication,
      admin_notes: f.admin_notes,
      home_address: f.home_address,
      contacts: f.contacts
        .filter((c) => c.name.trim())
        .map((c) => ({ name: c.name, relation: c.relation, phone: c.phone, email: c.email || null, primary: c.primary })),
    };
    try {
      const { data } = initial?.id
        ? await api.patch(`/admin/children/${initial.id}`, { ...body, version: initial.version })
        : await api.post('/admin/children', { ...body, enquiry_id: initial?.enquiry_id || '' });
      toast.success(initial?.id ? 'Child record saved.' : `${data.name} added.`);
      onSaved(data);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} wide title={initial?.id ? `Edit ${initial.name}` : 'Add a child'} testid="child-form"
      description={initial?.enquiry_id ? 'From an enquiry: the family details are filled in. Add the child’s name and check the rest.' : undefined}>
      <form className="tm-form" onSubmit={submit}>
        <div className="tm-grid-3">
          <TextField id="child-name" label="Child’s name" value={f.name} onChange={(v) => set('name', v)} required minLength={2} />
          <TextField id="child-dob" label="Date of birth" type="date" value={f.date_of_birth} onChange={(v) => set('date_of_birth', v)} />
          {!f.date_of_birth ? (
            <TextField id="child-age" label="Or age" placeholder="e.g. 4 years" value={f.age_label} onChange={(v) => set('age_label', v)} />
          ) : (
            <Field id="child-gender" label="Gender">
              <select id="child-gender" value={f.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Prefer not to say</option>
                <option>Girl</option>
                <option>Boy</option>
                <option>Other</option>
              </select>
            </Field>
          )}
        </div>
        <div className="tm-grid-2">
          <TextField id="child-school" label="School (optional)" value={f.school} onChange={(v) => set('school', v)} />
          <TextField id="child-address" label="Home address (for home visits)" value={f.home_address} onChange={(v) => set('home_address', v)} />
        </div>
        <Field id="child-concerns" label="Support needed">
          <div className="tm-scopes">
            {services.map((s) => (
              <Check key={s} id={`concern-${s}`} checked={f.concerns.includes(s)}
                onChange={(on) => set('concerns', on ? [...f.concerns, s] : f.concerns.filter((x) => x !== s))}>
                {s}
              </Check>
            ))}
          </div>
        </Field>
        <TextField id="child-communication" label="How the child communicates (optional)" value={f.communication} onChange={(v) => set('communication', v)} />
        <h4 className="ops-muted" style={{ margin: '10px 0 6px' }}>FAMILY CONTACTS (at least one mobile number)</h4>
        <div className="kid-contacts">
          {f.contacts.map((c, i) => (
            <div className="kid-contact-row" key={i}>
              <TextField id={`contact-name-${i}`} label="Name" value={c.name} onChange={(v) => setContact(i, 'name', v)} />
              <Field id={`contact-relation-${i}`} label="Relation">
                <select id={`contact-relation-${i}`} value={c.relation} onChange={(e) => setContact(i, 'relation', e.target.value)}>
                  {['Mother', 'Father', 'Guardian', 'Grandparent', 'Other'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <TextField id={`contact-phone-${i}`} label="Mobile" inputMode="tel" placeholder="98765 43210" value={c.phone} onChange={(v) => setContact(i, 'phone', v)} />
              <TextField id={`contact-email-${i}`} label="Email" type="email" value={c.email} onChange={(v) => setContact(i, 'email', v)} />
              <div className="tm-row" style={{ paddingBottom: 10 }}>
                <label className="tm-check" title="Main contact for messages and invoices">
                  <input type="radio" name="primary-contact" checked={c.primary} onChange={() => setContact(i, 'primary', true)} />
                  <span>Main</span>
                </label>
                {f.contacts.length > 1 && (
                  <button type="button" className="icon-button" aria-label="Remove contact"
                    onClick={() => setF({ ...f, contacts: f.contacts.filter((_, j) => j !== i) })}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {f.contacts.length < 4 && (
            <button type="button" className="text-button" onClick={() => setF({ ...f, contacts: [...f.contacts, blankContact()] })}>
              <Plus size={14} /> Add another contact
            </button>
          )}
        </div>
        <TextField id="child-notes" label="Notes for the office (not shared with families)" area value={f.admin_notes} onChange={(v) => set('admin_notes', v)} />
        <div className="ops-actions">
          <button className="button primary" disabled={busy} data-testid="child-save">
            {initial?.id ? 'Save changes' : 'Add child'}
          </button>
          <button type="button" className="button outlined" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
};

const ParentAccess = ({ child, reload, allowed }) => {
  const [f, setF] = useState({ email: '', display_name: '', phone: '' }),
    [edit, setEdit] = useState(null),
    { busy, run } = useAction();
  const primary = child.contacts?.find((c) => c.primary) || child.contacts?.[0];
  const invite = async (e) => {
    e.preventDefault();
    const r = await run('invite', () => api.post(`/admin/children/${child.id}/guardians`, f), (res) => res.data.message);
    if (r) {
      setF({ email: '', display_name: '', phone: '' });
      reload();
    }
  };
  return (
    <section className="tm-card" data-testid="parent-access">
      <h3>Parent app & portal access</h3>
      <div className="kid-people">
        {child.guardians.map((g) => (
          <div className="kid-person" key={g.id}>
            <div>
              <strong>{g.display_name}</strong>
              <small>
                {g.email} {g.phone && `· ${g.phone}`}
              </small>
            </div>
            {allowed && (
              <div className="tm-row">
                <button className="text-button" onClick={() => setEdit({ ...g, phone: g.phone || '' })}>
                  Edit
                </button>
                <button className="text-button danger" disabled={busy}
                  onClick={() => run('rm', () => api.delete(`/admin/children/${child.id}/guardians/${g.id}`), (r) => r.data.message).then((ok) => ok && reload())}>
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
        {child.invitations.map((i) => (
          <div className="kid-person" key={i.id}>
            <div>
              <strong>{i.display_name}</strong>
              <small>
                Invited {dateLabel(i.created_at)} · {i.email} · waiting to set a password
              </small>
            </div>
            {allowed && (
              <button className="text-button danger"
                onClick={() => run('c', () => api.post(`/admin/children/${child.id}/invitations/${i.id}/cancel`), 'Invitation cancelled.').then((ok) => ok && reload())}>
                Cancel
              </button>
            )}
          </div>
        ))}
        {!child.guardians.length && !child.invitations.length && <p className="ops-muted">No parent has app access yet.</p>}
      </div>
      {allowed && child.status !== 'archived' && (
        <form className="tm-form" onSubmit={invite} style={{ marginTop: 12 }}>
          <h4>
            <UserPlus size={14} /> Give a parent access
          </h4>
          <div className="tm-grid-3">
            <TextField id="guardian-name" label="Name" value={f.display_name} onChange={(v) => setF({ ...f, display_name: v })} required minLength={2} />
            <TextField id="guardian-email" label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} required />
            <TextField id="guardian-phone" label="Mobile (for code sign-in)" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
          </div>
          <div className="tm-row">
            <button className="button primary small" disabled={busy === 'invite'} data-testid="guardian-invite">
              Send invitation
            </button>
            {primary && !f.email && (
              <button type="button" className="text-button"
                onClick={() => setF({ display_name: primary.name, email: primary.email || '', phone: primary.phone || '' })}>
                Use {primary.name}’s details
              </button>
            )}
          </div>
          <small className="tm-hint">
            If the email already has a parent account, the child is added to it straight away. Otherwise the parent gets an email link to set a password.
          </small>
        </form>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Parent details">
        {edit && (
          <form className="tm-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run('e', () => api.patch(`/admin/children/${child.id}/guardians/${edit.id}`, { display_name: edit.display_name, phone: edit.phone }), 'Saved.')) {
                setEdit(null);
                reload();
              }
            }}>
            <TextField id="guardian-edit-name" label="Name" value={edit.display_name} onChange={(v) => setEdit({ ...edit, display_name: v })} required />
            <TextField id="guardian-edit-phone" label="Mobile (used for one-time code sign-in)" value={edit.phone} onChange={(v) => setEdit({ ...edit, phone: v })} />
            <button className="button primary">Save</button>
          </form>
        )}
      </Modal>
    </section>
  );
};

const Therapists = ({ child, reload, allowed }) => {
  const staff = useLoad(allowed ? '/admin/staff' : null);
  const [pick, setPick] = useState('');
  const { busy, run } = useAction();
  const options = (staff.data?.items || []).filter((s) => s.therapist && !child.staff_ids.includes(s.id));
  return (
    <section className="tm-card" data-testid="child-therapists">
      <h3>Therapists</h3>
      <div className="kid-people">
        {child.therapists.map((t) => (
          <div className="kid-person" key={t.id}>
            <strong>{t.display_name}</strong>
            {allowed && (
              <button className="text-button danger" disabled={!!busy}
                onClick={() => run('rm', () => api.delete(`/admin/children/${child.id}/therapists/${t.id}`), (r) => r.data.message).then((ok) => ok && reload())}>
                Remove
              </button>
            )}
          </div>
        ))}
        {!child.therapists.length && <p className="ops-muted">No therapist assigned. Booking a session assigns one automatically.</p>}
      </div>
      {allowed && options.length > 0 && (
        <div className="tm-row" style={{ marginTop: 10 }}>
          <select aria-label="Choose a therapist" value={pick} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: 260, minHeight: 40 }}>
            <option value="">Choose a therapist…</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name} ({s.caseload} children)
              </option>
            ))}
          </select>
          <button className="button outlined small" disabled={!pick || !!busy} data-testid="therapist-add"
            onClick={() => run('add', () => api.post(`/admin/children/${child.id}/therapists`, { user_id: pick }), (r) => r.data.message).then((ok) => ok && (setPick(''), reload()))}>
            Assign
          </button>
        </div>
      )}
    </section>
  );
};

const ChildDetail = ({ id, onBack, access, services, base }) => {
  const navigate = useNavigate();
  const { data: child, error, reload } = useLoad(`/admin/children/${id}`);
  const [editing, setEditing] = useState(false),
    [archiving, setArchiving] = useState(false),
    [reason, setReason] = useState(''),
    [cancelFuture, setCancelFuture] = useState(false),
    { busy, run } = useAction();
  if (error) return <p className="error-message">{error}</p>;
  if (!child) return <div className="loading-screen">Opening record…</div>;
  const archived = child.status === 'archived';
  return (
    <>
      <button className="text-button" onClick={onBack} style={{ marginBottom: 14 }} data-testid="child-back">
        <ArrowLeft size={15} /> All children
      </button>
      <div className="kid-head">
        <span className="child-avatar">{child.initials}</span>
        <div>
          <h2 data-testid="child-detail-name">{child.name}</h2>
          <p className="ops-muted">
            {[child.age_label, child.gender, child.school].filter(Boolean).join(' · ') || 'Age not recorded'}
            {child.enquiry && ` · Enquiry ${child.enquiry.reference}`}
          </p>
        </div>
        {archived && <span className="status lavender">Archived</span>}
        <div className="ops-actions" style={{ marginLeft: 'auto', marginTop: 0 }}>
          {access.schedule && !archived && (
            <button className="button primary small" onClick={() => navigate(`${base}/schedule?book=${child.id}`)} data-testid="child-book">
              <CalendarPlus size={15} /> Book a session
            </button>
          )}
          {access.billingRead && (
            <button className="button outlined small" onClick={() => navigate(`${base}/billing?child=${child.id}`)}>
              <Wallet size={15} /> Billing
            </button>
          )}
          {access.manageChildren && (
            <button className="button outlined small" onClick={() => setEditing(true)} data-testid="child-edit">
              <Pencil size={15} /> Edit
            </button>
          )}
        </div>
      </div>
      <div className="kid-grid">
        <div>
          <section className="tm-card">
            <h3>Family contacts</h3>
            <div className="kid-people">
              {child.contacts.map((c, i) => (
                <div className="kid-person" key={i}>
                  <div>
                    <strong>
                      {c.name} {c.primary && <span className="status sage">Main</span>}
                    </strong>
                    <small>{c.relation}</small>
                  </div>
                  <div className="tm-row">
                    {c.phone && (
                      <a className="text-button" href={`tel:${c.phone}`}>
                        <Phone size={13} /> {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a className="text-button" href={`mailto:${c.email}`}>
                        <Mail size={13} /> {c.email}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {(child.concerns?.length > 0 || child.communication || child.home_address || child.admin_notes) && <h4>Details</h4>}
            {child.concerns?.length > 0 && (
              <p>
                {child.concerns.map((c) => (
                  <span className="ops-chip" key={c}>
                    {c}
                  </span>
                ))}
              </p>
            )}
            {child.communication && <p>Communicates: {child.communication}</p>}
            {child.home_address && <p>Home: {child.home_address}</p>}
            {child.admin_notes && <p className="ops-muted">Office note: {child.admin_notes}</p>}
          </section>
          <ParentAccess child={child} reload={reload} allowed={access.accounts} />
          <Therapists child={child} reload={reload} allowed={access.manageChildren} />
        </div>
        <div>
          <section className="tm-card">
            <h3>Upcoming sessions</h3>
            {child.upcoming.length ? (
              <div className="kid-people">
                {child.upcoming.map((s) => (
                  <div className="kid-person" key={s.id}>
                    <div>
                      <strong>{s.service}</strong>
                      <small>
                        {dateLabel(s.starts_at)}, {niceTime(s.starts_at)} · {s.therapist_name || s.staff_label} · {s.room || s.mode}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ops-muted">Nothing booked.</p>
            )}
            {child.recent.length > 0 && (
              <>
                <h4>Recent</h4>
                {child.recent.map((s) => (
                  <p key={s.id} className="ops-muted">
                    {dateLabel(s.starts_at)} · {s.service} · {s.status === 'Cancelled' ? 'Cancelled' : s.attendance}
                  </p>
                ))}
              </>
            )}
          </section>
          {child.billing && access.billingRead && (
            <section className="tm-card" data-testid="child-billing">
              <h3>Payments</h3>
              <p>
                Balance due: <strong className="money">{rupees(child.billing.balance_paise)}</strong>
                {child.billing.unbilled > 0 && ` · ${child.billing.unbilled} attended session(s) not yet invoiced`}
              </p>
              {child.billing.packages.map((p) => (
                <div key={p.id} style={{ marginTop: 8 }}>
                  <p style={{ margin: 0 }}>
                    {p.name}: <strong>{p.sessions_left}</strong> of {p.sessions_total} left · until {p.expires_on}
                  </p>
                  <div className="pkg-bar">
                    <span style={{ width: `${(100 * p.sessions_left) / p.sessions_total}%` }} />
                  </div>
                </div>
              ))}
            </section>
          )}
          {access.manageChildren && (
            <section className="tm-card">
              <h3>{archived ? 'Archived record' : 'Leaving the center'}</h3>
              {archived ? (
                <>
                  <p>Archived: {child.archive_reason}</p>
                  <button className="button outlined small"
                    onClick={() => run('r', () => api.post(`/admin/children/${child.id}/restore`), 'Record restored.').then((ok) => ok && reload())}>
                    <RotateCcw size={15} /> Restore
                  </button>
                </>
              ) : (
                <>
                  <p className="ops-muted">Archiving hides the child from lists and booking. Records and invoices are kept.</p>
                  <button className="button outlined small" onClick={() => setArchiving(true)} data-testid="child-archive">
                    <Archive size={15} /> Archive record
                  </button>
                </>
              )}
            </section>
          )}
        </div>
      </div>
      <ChildForm open={editing} onClose={() => setEditing(false)} initial={child} services={services} onSaved={() => (setEditing(false), reload())} />
      <Modal open={archiving} onClose={() => setArchiving(false)} title={`Archive ${child.name}?`}>
        <form className="tm-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run('a', () => api.post(`/admin/children/${child.id}/archive`, { reason, cancel_future: cancelFuture }), (res) => res.data.message);
            if (r) {
              setArchiving(false);
              reload();
            }
          }}>
          <TextField id="archive-reason" label="Reason" value={reason} onChange={setReason} required minLength={3} placeholder="e.g. Therapy completed, moved city" />
          {child.upcoming.length > 0 && (
            <Check id="archive-cancel" checked={cancelFuture} onChange={setCancelFuture}>
              Also cancel the {child.upcoming.length}+ upcoming session(s) (families are not emailed)
            </Check>
          )}
          <button className="button primary" disabled={busy === 'a'}>
            Archive
          </button>
        </form>
      </Modal>
    </>
  );
};

export const AdminChildren = () => {
  const { user, role, data: workspace } = useWorkspace();
  const access = opsAccess(user);
  const base = `/portal/${role}`;
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('active'),
    [q, setQ] = useState(''),
    [adding, setAdding] = useState(null);
  const list = useLoad('/admin/children', { status, q });
  const settings = useLoad('/schedule/settings');
  const services = useMemo(() => settings.data?.services || [], [settings.data]);
  const open = params.get('child');
  const enrol = params.get('enrol');
  const enquiry = useMemo(() => (workspace.enquiries || []).find((e) => e.id === enrol), [workspace.enquiries, enrol]);
  const enrolled = useRef('');
  useEffect(() => {
    if (enrol && enquiry && access.manageChildren && settings.data && enrolled.current !== enrol) {
      enrolled.current = enrol;
      setAdding({
        enquiry_id: enquiry.id,
        concerns: [enquiry.service].filter((s) => services.includes(s)),
        contacts: [{ name: enquiry.guardian_name, relation: 'Other', phone: enquiry.phone, email: enquiry.email || '', primary: true }],
      });
    }
  }, [enrol, enquiry, access.manageChildren, services, settings.data]);
  const show = (id) => setParams(id ? { child: id } : {});
  if (open) return <ChildDetail id={open} onBack={() => (show(null), list.reload())} access={access} services={services} base={base} />;
  const counts = list.data?.counts || {};
  return (
    <>
      <PortalHeading
        eyebrow="FAMILIES AT THE CENTER"
        title="Children"
        subtitle="Every child’s record, family contacts, app access, therapists and what’s due."
        action={
          access.manageChildren && (
            <button className="button primary" onClick={() => setAdding({})} data-testid="child-add">
              <Plus size={17} /> Add a child
            </button>
          )
        }
      />
      <Tabs tabs={[['active', 'Active', counts.active], ['archived', 'Archived', counts.archived]]} value={status} onChange={setStatus} testid="children-tab" />
      <div className="ops-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input aria-label="Search children" placeholder="Search by child, parent, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="children-search" />
        </div>
      </div>
      {list.error && <p className="error-message">{list.error}</p>}
      {list.data && !list.data.items.length && (
        <div className="ops-empty">
          <Users size={22} />
          <p>{q ? 'No child matches that search.' : status === 'active' ? 'No children yet. Add the first one, or enrol a family from Enquiries.' : 'No archived records.'}</p>
        </div>
      )}
      <div className="kid-list">
        {list.data?.items.map((c) => (
          <button className="kid-card" key={c.id} onClick={() => show(c.id)} data-testid={`child-card-${c.id}`}>
            <span className="child-avatar">{c.initials}</span>
            <div>
              <h3>{c.name}</h3>
              <p>{[c.age_label, (c.concerns || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ') || '—'}</p>
              <p>
                {c.primary_contact.name} {c.primary_contact.phone && `· ${c.primary_contact.phone}`}
              </p>
              <p>
                {c.therapists.length ? c.therapists.join(', ') : 'No therapist yet'}
                {c.guardian_count ? ` · ${c.guardian_count} on the app` : ''}
              </p>
              {c.next_session && (
                <p>
                  Next: {dateLabel(c.next_session.starts_at)}, {niceTime(c.next_session.starts_at)} · {c.next_session.service}
                </p>
              )}
              {c.balance > 0 && access.billingRead && <p className="due">Due {rupees(c.balance)}</p>}
            </div>
          </button>
        ))}
      </div>
      <ChildForm
        open={!!adding}
        onClose={() => {
          setAdding(null);
          if (enrol) setParams({});
        }}
        initial={adding || {}}
        services={services}
        onSaved={(child) => {
          setAdding(null);
          show(child.id);
        }}
      />
    </>
  );
};

export default AdminChildren;
