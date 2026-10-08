import { useEffect, useState } from 'react';
import { BadgeCheck, Building2, Plus, Repeat } from 'lucide-react';
import { api, errorText } from '../lib/api';
import { PortalHeading } from '../components/PortalLayout';
import { SCOPE_LABELS, SelectField, TextField, fmt, fmtTime, useAction } from '../components/team/teamUi';
import { InviteLink } from './SchoolTeam';

const tone = s => s === 'active' ? 'sage' : ['pending', 'proposed'].includes(s) ? 'yellow' : 'lavender';

const AddSchool = ({ reload }) => {
  const [f, setF] = useState({ name: '', address: '', coordinator_name: '', coordinator_email: '', coordinator_phone: '' }), { busy, run } = useAction();
  const submit = async e => { e.preventDefault(); if (await run('a', () => api.post('/admin/schools', f), 'School added. Verify it before inviting the coordinator.')) { setF({ name: '', address: '', coordinator_name: '', coordinator_email: '', coordinator_phone: '' }); reload(); } };
  return <form className="tm-card tm-form" onSubmit={submit} data-testid="school-add-form"><h3><Plus size={17} /> Add a school</h3>
    <TextField id="school-name" label="School name" value={f.name} onChange={v => setF({ ...f, name: v })} required minLength={3} />
    <TextField id="school-address" label="Address" value={f.address} onChange={v => setF({ ...f, address: v })} required minLength={3} />
    <div className="tm-grid-2"><TextField id="school-coordinator-name" label="Coordinator name" value={f.coordinator_name} onChange={v => setF({ ...f, coordinator_name: v })} required /><TextField id="school-coordinator-email" label="Coordinator email" type="email" value={f.coordinator_email} onChange={v => setF({ ...f, coordinator_email: v })} required /></div>
    <TextField id="school-coordinator-phone" label="Coordinator phone (center use only)" value={f.coordinator_phone} onChange={v => setF({ ...f, coordinator_phone: v })} />
    <button className="button primary" disabled={busy === 'a'} data-testid="school-add-submit">Add school</button></form>;
};

const LinkRequest = ({ data, reload }) => {
  const verified = data.schools.filter(s => s.verified && s.status === 'active');
  const [f, setF] = useState({ child_id: data.children[0]?.id || '', school_id: verified[0]?.id || '', purpose: 'Coordinate classroom support for everyday participation.' }), { busy, run } = useAction();
  const [t, setT] = useState({ child_id: data.children[0]?.id || '', to_school_id: verified[0]?.id || '', reason: '', purpose: 'Continue classroom support at the new school.' });
  const submit = async e => { e.preventDefault(); if (await run('l', () => api.post('/admin/school-links', f), 'Link requested. The guardian must approve it before anything is shared.')) reload(); };
  const transfer = async e => { e.preventDefault(); if (await run('t', () => api.post(`/admin/children/${t.child_id}/transfer`, t), r => r.data.message)) reload(); };
  return <div className="admin-columns">
    <form className="tm-card tm-form" onSubmit={submit} data-testid="link-request-form"><h3>Request a school link</h3><p className="tm-hint">Links stay pending until a verified guardian approves them.</p>
      <SelectField id="link-child" label="Child" value={f.child_id} onChange={v => setF({ ...f, child_id: v })} options={data.children.map(c => [c.id, c.name])} />
      <SelectField id="link-school" label="Verified school" value={f.school_id} onChange={v => setF({ ...f, school_id: v })} options={verified.map(s => [s.id, s.name])} />
      <TextField id="link-purpose" label="Purpose" value={f.purpose} onChange={v => setF({ ...f, purpose: v })} required minLength={5} />
      <button className="button primary" disabled={busy === 'l' || !f.school_id} data-testid="link-request-submit">Ask guardian</button></form>
    <form className="tm-card tm-form" onSubmit={transfer} data-testid="transfer-form"><h3><Repeat size={17} /> School transfer</h3><p className="tm-hint">Ends old-school access immediately (care history is kept) and asks the guardian before sharing with the new school.</p>
      <SelectField id="transfer-child" label="Child" value={t.child_id} onChange={v => setT({ ...t, child_id: v })} options={data.children.map(c => [c.id, c.name])} />
      <SelectField id="transfer-school" label="New school" value={t.to_school_id} onChange={v => setT({ ...t, to_school_id: v })} options={verified.map(s => [s.id, s.name])} />
      <TextField id="transfer-reason" label="Reason" value={t.reason} onChange={v => setT({ ...t, reason: v })} required minLength={3} />
      <button className="button primary" disabled={busy === 't' || !t.to_school_id} data-testid="transfer-submit">Transfer</button></form>
  </div>;
};

export const AdminSchools = () => {
  const [data, setData] = useState(null), [error, setError] = useState(''), [token, setToken] = useState(''), [days, setDays] = useState('');
  const { busy, run } = useAction();
  const load = () => api.get('/admin/schools').then(r => { setData(r.data); setDays(String(r.data.retention_days)); }).catch(e => setError(errorText(e)));
  useEffect(() => { load(); }, []);
  if (error) return <div className="error-state" role="alert" data-testid="schools-error">{error}</div>;
  if (!data) return <div className="loading-screen" data-testid="schools-loading">Loading schools…</div>;
  const verify = async s => { if (await run(s.id, () => api.post(`/admin/schools/${s.id}/verify`, { note: 'Coordinator contact verified by phone' }), 'School verified.')) load(); };
  const suspend = async s => { if (await run(s.id, () => api.post(`/admin/schools/${s.id}/suspend`, { reason: 'Suspended by administrator' }), 'School access suspended.')) load(); };
  const inviteCoord = async s => { const r = await run(s.id, () => api.post(`/admin/schools/${s.id}/invite-coordinator`), 'Coordinator invitation created.'); if (r) { setToken(r.data.demo_invitation_token || ''); load(); } };
  const endLink = async l => { if (await run(l.id, () => api.post(`/admin/school-links/${l.id}/end`, { reason: 'Ended by administrator' }), 'Link ended.')) load(); };
  const revoke = async a => { if (await run(a.id, () => api.post(`/admin/school-assignments/${a.id}/revoke`, { reason: 'Revoked by administrator' }), 'Access revoked.')) load(); };
  const saveRetention = async () => { if (await run('r', () => api.post('/admin/school-retention', { days: Number(days) }), r => r.data.message)) load(); };
  const runRetention = async () => run('rr', () => api.post('/admin/school-retention/run'), r => r.data.message);
  const name = id => data.schools.find(s => s.id === id)?.name || id;
  return <>
    <PortalHeading eyebrow="SCHOOL PARTNERSHIPS" title="Schools & sharing" subtitle="Directory, verified coordinators, family-approved links and every active permission in one place." />
    <section className="portal-section"><h2><Building2 size={18} /> School directory</h2>
      <InviteLink token={token} />
      <div className="tm-table" data-testid="school-directory">{data.schools.map(s => <div className="tm-table-row" key={s.id} data-testid={`school-${s.id}`}><strong>{s.name}</strong><span>{s.coordinator?.name} · {s.coordinator?.email}</span><span className={`status ${s.verified ? 'sage' : 'yellow'}`}>{s.verified ? <><BadgeCheck size={12} /> Verified</> : 'Unverified'}</span><span className={`status ${tone(s.status)}`}>{s.status}</span>
        <span className="tm-actions">{!s.verified && <button className="text-link" disabled={busy === s.id} onClick={() => verify(s)} data-testid={`school-verify-${s.id}`}>Verify</button>}{s.verified && s.status === 'active' && <button className="text-link" disabled={busy === s.id} onClick={() => inviteCoord(s)} data-testid={`school-invite-coordinator-${s.id}`}>Invite coordinator</button>}{s.status === 'active' && <button className="text-link danger" disabled={busy === s.id} onClick={() => suspend(s)} data-testid={`school-suspend-${s.id}`}>Suspend</button>}</span></div>)}</div>
    </section>
    <div className="portal-section"><AddSchool reload={load} /></div>
    <div className="portal-section"><LinkRequest data={data} reload={load} /></div>
    <section className="portal-section"><h2>School–child links</h2><div className="tm-table" data-testid="school-links">{data.links.map(l => <div className="tm-table-row" key={l.id} data-testid={`admin-link-${l.id}`}><strong>{l.child_name}</strong><span>{l.school_name}</span><span className={`status ${tone(l.status)}`}>{l.status}</span><span className="tm-meta">{l.scopes.map(s => SCOPE_LABELS[s]?.split(' ')[0]).join(', ') || '—'}{l.expires_at && ` · until ${fmt(l.expires_at)}`}</span>{['active', 'pending'].includes(l.status) ? <button className="text-link danger" disabled={busy === l.id} onClick={() => endLink(l)} data-testid={`admin-link-end-${l.id}`}>End access</button> : <span className="tm-meta">{l.end_reason}</span>}</div>)}</div></section>
    <section className="portal-section"><h2>Professional assignments</h2><div className="tm-table" data-testid="school-assignments-admin">{data.assignments.map(a => <div className="tm-table-row" key={a.id} data-testid={`admin-assignment-${a.id}`}><strong>{a.user_name}</strong><span>{a.child_name} · {name(a.school_id)} · {a.class_group}</span><span className={`status ${tone(a.status)}`}>{a.status}</span><span className="tm-meta">{fmtTime(a.created_at)}</span>{['active', 'proposed'].includes(a.status) ? <button className="text-link danger" disabled={busy === a.id} onClick={() => revoke(a)} data-testid={`admin-assignment-revoke-${a.id}`}>Revoke</button> : <span />}</div>)}</div></section>
    <section className="portal-section"><h2>School accounts</h2><div className="tm-table">{data.members.map(m => <div className="tm-table-row" key={m.id} data-testid={`admin-school-member-${m.id}`}><strong>{m.display_name}</strong><span>{name(m.school_id)} · {m.school_role}</span><span className={`status ${m.active ? 'sage' : 'lavender'}`}>{m.active ? 'Active' : 'Deactivated'}</span></div>)}</div><p className="tm-hint">Deactivate a school account from Accounts & consent. Teacher replacement: revoke the old assignment, then the coordinator proposes the new teacher for family approval.</p></section>
    <section className="portal-section tm-card" data-testid="school-retention"><h2>Retention of school-created records</h2><p className="tm-hint">Observations, activity responses and contributions created by school staff are deleted after this period.</p>
      <div className="tm-inline"><input type="number" min={30} max={3650} aria-label="Retention days" value={days} onChange={e => setDays(e.target.value)} data-testid="retention-days" /><span>days</span><button className="text-link" disabled={busy === 'r'} onClick={saveRetention} data-testid="retention-save">Save policy</button><button className="text-link danger" disabled={busy === 'rr'} onClick={runRetention} data-testid="retention-run">Apply now</button></div></section>
  </>;
};
