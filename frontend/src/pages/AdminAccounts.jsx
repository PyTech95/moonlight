import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { api, errorText } from '../lib/api';
import { PortalHeading, useWorkspace } from '../components/PortalLayout';
import { Check, SelectField, TextField, fmtTime, useAction } from '../components/team/teamUi';
import { InviteLink } from './SchoolTeam';

const PROFILES = [['guardian', 'Parent / guardian'], ['clinical', 'Therapist (clinical)'], ['reception', 'Reception'], ['finance', 'Finance'], ['administrator', 'Administrator']];
const PURPOSES = [['care', 'Care'], ['private_video_sharing', 'Private video sharing with family'], ['public_photography', 'Public photography'], ['marketing', 'Marketing'], ['session_recording', 'Session recording']];

const InviteForm = ({ children, reload }) => {
  const [f, setF] = useState({ email: '', display_name: '', access_profile: 'guardian', child_ids: [] }), [token, setToken] = useState(''), { busy, run } = useAction();
  const needsChild = ['guardian', 'clinical'].includes(f.access_profile);
  const submit = async e => { e.preventDefault(); const r = await run('i', () => api.post('/admin/invitations', f), 'Invitation created.'); if (r) { setToken(r.data.demo_invitation_token || ''); setF({ ...f, email: '', display_name: '', child_ids: [] }); reload(); } };
  return <form className="tm-card tm-form" onSubmit={submit} data-testid="account-invite-form"><h3><UserPlus size={17} /> Invite an account</h3>
    <div className="tm-grid-2"><TextField id="account-invite-name" label="Full name" value={f.display_name} onChange={v => setF({ ...f, display_name: v })} required minLength={2} /><TextField id="account-invite-email" label="Email" type="email" value={f.email} onChange={v => setF({ ...f, email: v })} required /></div>
    <SelectField id="account-invite-profile" label="Access profile" value={f.access_profile} onChange={v => setF({ ...f, access_profile: v })} options={PROFILES} />
    {needsChild && <div className="tm-scopes">{children.map(c => <Check key={c.id} id={`account-invite-child-${c.id}`} checked={f.child_ids.includes(c.id)} onChange={on => setF({ ...f, child_ids: on ? [...f.child_ids, c.id] : f.child_ids.filter(x => x !== c.id) })}>{c.name}</Check>)}</div>}
    <p className="tm-hint">School coordinators are invited from Schools after the school is verified.</p>
    <button className="button primary" disabled={busy === 'i' || (needsChild && !f.child_ids.length)} data-testid="account-invite-submit">Create single-use invitation</button>
    <InviteLink token={token} /></form>;
};

const ConsentRequest = ({ children, users, reload }) => {
  const guardians = users.filter(u => u.role === 'parent' && u.active);
  const [f, setF] = useState({ child_id: children[0]?.id || '', guardian_id: guardians[0]?.id || '', purposes: [], policy_version: 'v1.0', purpose_text: '' }), { busy, run } = useAction();
  const submit = async e => { e.preventDefault(); if (await run('c', () => api.post('/admin/consent-requests', f), 'Consent request sent to the guardian.')) { setF({ ...f, purposes: [], purpose_text: '' }); reload(); } };
  return <form className="tm-card tm-form" onSubmit={submit} data-testid="consent-request-form"><h3><ShieldCheck size={17} /> Request consent</h3>
    <div className="tm-grid-2"><SelectField id="consent-child" label="Child" value={f.child_id} onChange={v => setF({ ...f, child_id: v })} options={children.map(c => [c.id, c.name])} /><SelectField id="consent-guardian" label="Verified guardian" value={f.guardian_id} onChange={v => setF({ ...f, guardian_id: v })} options={guardians.map(g => [g.id, g.display_name])} /></div>
    <div className="tm-scopes">{PURPOSES.map(([k, l]) => <Check key={k} id={`consent-purpose-${k}`} checked={f.purposes.includes(k)} onChange={on => setF({ ...f, purposes: on ? [...f.purposes, k] : f.purposes.filter(x => x !== k) })}>{l}</Check>)}</div>
    <p className="tm-hint">School sharing consent is requested from Schools, scoped to one school and specific categories.</p>
    <div className="tm-grid-2"><TextField id="consent-policy" label="Policy version" value={f.policy_version} onChange={v => setF({ ...f, policy_version: v })} required /><TextField id="consent-text" label="Purpose explained to the family" value={f.purpose_text} onChange={v => setF({ ...f, purpose_text: v })} required minLength={10} /></div>
    <button className="button primary" disabled={busy === 'c' || !f.purposes.length || !f.guardian_id} data-testid="consent-request-submit">Send request</button></form>;
};

export const AdminAccounts = () => {
  const { data: ws } = useWorkspace();
  const [data, setData] = useState(null), [consents, setConsents] = useState([]), [error, setError] = useState(''), { busy, run } = useAction();
  const load = () => Promise.all([api.get('/admin/access'), api.get('/consents')]).then(([a, c]) => { setData(a.data); setConsents(c.data.items); }).catch(e => setError(errorText(e)));
  useEffect(() => { load(); }, []);
  if (error) return <div className="error-state" role="alert" data-testid="accounts-error">{error}</div>;
  if (!data) return <div className="loading-screen" data-testid="accounts-loading">Loading accounts…</div>;
  const deactivate = async u => { if (await run(u.id, () => api.post(`/admin/users/${u.id}/deactivate`, { reason: 'Deactivated by administrator' }), 'Account deactivated and sessions ended.')) load(); };
  const revoke = async g => { if (await run(g.id, () => api.post(`/admin/access-grants/${g.id}/revoke`, { reason: 'Revoked by administrator' }), 'Child access revoked.')) load(); };
  const userName = id => data.users.find(u => u.id === id)?.display_name || id;
  return <>
    <PortalHeading eyebrow="IDENTITY & CONSENT" title="Accounts & consent" subtitle="Single-use invitations, verified child access and purpose-specific consent." />
    <div className="admin-columns"><InviteForm children={ws.children} reload={load} /><ConsentRequest children={ws.children} users={data.users} reload={load} /></div>
    <section className="portal-section"><h2><KeyRound size={18} /> Accounts</h2><div className="tm-table" data-testid="accounts-list">{data.users.map(u => <div className="tm-table-row" key={u.id} data-testid={`account-${u.id}`}><strong>{u.display_name}</strong><span>{u.access_profile || u.role}{u.school_role && ` · ${u.school_role}`}</span><span className={`status ${u.active ? 'sage' : 'lavender'}`}>{u.active ? 'Active' : 'Deactivated'}</span><span className="tm-meta">{u.mfa_enabled ? 'MFA on' : 'MFA off'}</span>{u.active ? <button className="text-link danger" disabled={busy === u.id} onClick={() => deactivate(u)} data-testid={`account-deactivate-${u.id}`}>Deactivate</button> : <span />}</div>)}</div></section>
    <section className="portal-section"><h2>Invitations</h2><div className="tm-table">{data.invitations.map(i => <div className="tm-table-row" key={i.id} data-testid={`invitation-${i.id}`}><strong>{i.display_name}</strong><span>{i.email} · {i.access_profile}</span><span className={`status ${i.used_at ? 'sage' : i.cancelled_at ? 'lavender' : 'yellow'}`}>{i.used_at ? 'Accepted' : i.cancelled_at ? 'Cancelled' : 'Pending'}</span><span className="tm-meta">{fmtTime(i.created_at)}</span></div>)}{!data.invitations.length && <p className="tm-empty">No invitations yet.</p>}</div></section>
    <section className="portal-section"><h2>Verified child access</h2><div className="tm-table">{data.grants.map(g => <div className="tm-table-row" key={g.id} data-testid={`grant-${g.id}`}><strong>{userName(g.user_id)}</strong><span>{ws.children.find(c => c.id === g.child_id)?.name || g.child_id} · {g.relationship}</span><span className={`status ${g.status === 'active' ? 'sage' : 'lavender'}`}>{g.status}</span>{g.status === 'active' ? <button className="text-link danger" disabled={busy === g.id} onClick={() => revoke(g)} data-testid={`grant-revoke-${g.id}`}>Revoke</button> : <span />}</div>)}{!data.grants.length && <p className="tm-empty">Grants appear when invitations are accepted.</p>}</div></section>
    <section className="portal-section"><h2>Consent register</h2><div className="tm-table" data-testid="admin-consents">{consents.map(c => <div className="tm-table-row" key={c.id} data-testid={`admin-consent-${c.id}`}><strong>{c.purpose.replaceAll('_', ' ')}</strong><span>{c.child_name} · {userName(c.guardian_id)}</span><span className={`status ${c.status === 'granted' ? 'sage' : c.status === 'pending' ? 'yellow' : 'lavender'}`}>{c.status}</span><span className="tm-meta">{fmtTime(c.signed_at || c.withdrawn_at || c.created_at)}</span></div>)}{!consents.length && <p className="tm-empty">No consent records yet.</p>}</div></section>
  </>;
};
