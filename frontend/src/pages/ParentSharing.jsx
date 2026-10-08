import { useEffect, useState } from 'react';
import { Info, School, ShieldCheck } from 'lucide-react';
import { api, errorText } from '../lib/api';
import { PortalHeading, EmptyState } from '../components/PortalLayout';
import { SCOPE_LABELS, Check, SelectField, TextField, fmt, fmtTime, useAction } from '../components/team/teamUi';

const SCOPES = Object.keys(SCOPE_LABELS);
const DURATIONS = [['30', '30 days'], ['90', '90 days'], ['180', '6 months'], ['365', '12 months']];

const ScopePicker = ({ id, value, onChange }) => (
  <div className="tm-scopes" data-testid={`${id}-scopes`}>{SCOPES.map(s => <Check key={s} id={`${id}-scope-${s}`} checked={value.includes(s)} onChange={on => onChange(on ? [...value, s] : value.filter(x => x !== s))}>{SCOPE_LABELS[s]}</Check>)}</div>
);

const PendingLink = ({ link, reload }) => {
  const [scopes, setScopes] = useState([]), [days, setDays] = useState('180'), [signer, setSigner] = useState('');
  const { busy, run } = useAction();
  const decide = async approve => { if (await run(approve ? 'a' : 'd', () => api.post(`/sharing/school/links/${link.id}/decision`, { approve, scopes, duration_days: Number(days), signer_name: signer }), approve ? 'Sharing approved.' : 'Request declined.')) reload(); };
  return <div className="tm-sub" data-testid={`link-pending-${link.id}`}>
    <p><strong>{link.school_name}</strong> has asked to support {link.child_name}. Purpose: {link.purpose}</p>
    <p className="tm-hint">Nothing is ticked by default. Clinical notes, full medical history, family conversations, home videos and billing are never shared.</p>
    <ScopePicker id={`link-${link.id}`} value={scopes} onChange={setScopes} />
    <div className="tm-grid-2"><SelectField id={`link-${link.id}-duration`} label="Share for" value={days} onChange={setDays} options={DURATIONS} /><TextField id={`link-${link.id}-signer`} label="Your full name (signature)" value={signer} onChange={setSigner} required /></div>
    <div className="tm-actions"><button className="button primary" disabled={!scopes.length || signer.length < 2 || !!busy} onClick={() => decide(true)} data-testid={`link-approve-${link.id}`}>Approve sharing</button><button className="text-link" disabled={signer.length < 2 || !!busy} onClick={() => decide(false)} data-testid={`link-decline-${link.id}`}>Decline</button></div>
  </div>;
};

const ActiveLink = ({ link, videos, reload }) => {
  const [scopes, setScopes] = useState(link.scopes), [days, setDays] = useState('180'), [videoIds, setVideoIds] = useState(link.approved_video_ids || []), [reason, setReason] = useState(''), [mode, setMode] = useState('');
  const { busy, run } = useAction();
  const save = async () => { if (await run('s', () => api.patch(`/sharing/school/links/${link.id}`, { scopes, duration_days: Number(days), approved_video_ids: videoIds }), 'Sharing updated.')) { setMode(''); reload(); } };
  const withdraw = async () => { if (await run('w', () => api.post(`/sharing/school/links/${link.id}/withdraw`, { reason }), r => r.data.message)) reload(); };
  return <div data-testid={`link-active-${link.id}`}>
    <ul className="tm-chips">{link.scopes.map(s => <li key={s}>{SCOPE_LABELS[s]}</li>)}</ul>
    <p className="tm-meta">Purpose: {link.purpose} · access until {fmt(link.expires_at)} · {link.approved_video_ids?.length || 0} video(s) approved for school</p>
    <div className="tm-actions"><button className="text-link" onClick={() => setMode(mode === 'edit' ? '' : 'edit')} data-testid={`link-edit-${link.id}`}>Change what is shared</button><button className="text-link danger" onClick={() => setMode(mode === 'withdraw' ? '' : 'withdraw')} data-testid={`link-withdraw-open-${link.id}`}>Withdraw sharing</button></div>
    {mode === 'edit' && <div className="tm-sub"><ScopePicker id={`edit-${link.id}`} value={scopes} onChange={setScopes} /><SelectField id={`edit-${link.id}-duration`} label="Extend / shorten access from today" value={days} onChange={setDays} options={DURATIONS} />
      {scopes.includes('videos') && <><h4>Videos approved for school use</h4><p className="tm-hint">Sharing a video with your family does not share it with school. Choose each video separately.</p>{videos.map(v => <Check key={v.id} id={`edit-${link.id}-video-${v.id}`} checked={videoIds.includes(v.id)} onChange={on => setVideoIds(on ? [...videoIds, v.id] : videoIds.filter(x => x !== v.id))}>{v.title} · {v.therapy}</Check>)}{!videos.length && <p className="tm-empty small">No practice videos recorded yet.</p>}</>}
      <button className="button primary" disabled={!scopes.length || busy === 's'} onClick={save} data-testid={`link-save-${link.id}`}>Save sharing choices</button></div>}
    {mode === 'withdraw' && <div className="tm-sub"><p className="tm-note"><Info size={15} /> The school will lose access immediately and pending alerts are cancelled. Files already downloaded cannot be recalled.</p><TextField id={`withdraw-${link.id}-reason`} label="Reason" value={reason} onChange={setReason} required /><button className="button primary" disabled={reason.length < 3 || busy === 'w'} onClick={withdraw} data-testid={`link-withdraw-confirm-${link.id}`}>Withdraw now</button></div>}
  </div>;
};

const Professionals = ({ items, reload }) => {
  const { busy, run } = useAction();
  const decide = async (a, approve) => { if (await run(a.id, () => api.post(`/sharing/school/assignments/${a.id}/decision`, { approve }), approve ? 'Access approved.' : 'Declined.')) reload(); };
  const revoke = async a => { if (await run(a.id, () => api.post(`/sharing/school/assignments/${a.id}/revoke`, { reason: 'Revoked by family' }), 'Access removed.')) reload(); };
  if (!items.length) return <p className="tm-empty small">No school professionals yet.</p>;
  return <div className="tm-table">{items.map(a => <div className="tm-table-row" key={a.id} data-testid={`assignment-${a.id}`}><strong>{a.user_name}</strong><span>{a.school_role === 'coordinator' ? 'Coordinator' : 'Teacher / special educator'} · {a.class_group}</span><span className={`status ${a.status === 'active' ? 'sage' : 'yellow'}`}>{a.status === 'active' ? 'Has access' : `Requested by ${a.proposed_by_name}`}</span>{a.status === 'proposed' ? <span className="tm-actions"><button className="text-link" disabled={busy === a.id} onClick={() => decide(a, true)} data-testid={`assignment-approve-${a.id}`}>Approve</button><button className="text-link" disabled={busy === a.id} onClick={() => decide(a, false)} data-testid={`assignment-decline-${a.id}`}>Decline</button></span> : <button className="text-link danger" disabled={busy === a.id} onClick={() => revoke(a)} data-testid={`assignment-revoke-${a.id}`}>Remove access</button>}</div>)}</div>;
};

const Consents = ({ items, reload }) => {
  const [signer, setSigner] = useState(''), { busy, run } = useAction();
  const sign = async (c, accepted) => { if (await run(c.id, () => api.post(`/consents/${c.id}/sign`, { signer_name: signer, accepted }), accepted ? 'Consent granted.' : 'Consent declined.')) reload(); };
  const withdraw = async c => { if (await run(c.id, () => api.post(`/consents/${c.id}/withdraw`, { reason: 'Withdrawn by guardian' }), 'Consent withdrawn.')) reload(); };
  return <section className="portal-section" data-testid="consent-register"><h2><ShieldCheck size={18} /> Consent register</h2>
    {items.some(c => c.status === 'pending') && <TextField id="consent-signer" label="Your full name (used to sign)" value={signer} onChange={setSigner} />}
    {!items.length && <p className="tm-empty">No consent requests yet.</p>}
    <div className="tm-table">{items.map(c => <div className="tm-table-row" key={c.id} data-testid={`consent-${c.id}`}><strong>{c.purpose.replaceAll('_', ' ')}</strong><span>{c.child_name} · {c.purpose_text}</span><span className={`status ${c.status === 'granted' ? 'sage' : c.status === 'pending' ? 'yellow' : 'lavender'}`}>{c.status}</span><span className="tm-meta">{fmtTime(c.signed_at || c.created_at)}</span>{c.status === 'pending' ? <span className="tm-actions"><button className="text-link" disabled={signer.length < 2 || busy === c.id} onClick={() => sign(c, true)} data-testid={`consent-grant-${c.id}`}>Grant</button><button className="text-link" disabled={signer.length < 2 || busy === c.id} onClick={() => sign(c, false)} data-testid={`consent-decline-${c.id}`}>Decline</button></span> : c.status === 'granted' ? <button className="text-link danger" disabled={busy === c.id} onClick={() => withdraw(c)} data-testid={`consent-withdraw-${c.id}`}>Withdraw</button> : <span />}</div>)}</div>
  </section>;
};

export default function ParentSharing() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const load = () => api.get('/sharing/school').then(r => setData(r.data)).catch(e => setError(errorText(e)));
  useEffect(() => { load(); }, []);
  if (error) return <div className="error-state" role="alert" data-testid="sharing-error">{error}</div>;
  if (!data) return <div className="loading-screen" data-testid="sharing-loading">Loading sharing choices…</div>;
  return <>
    <PortalHeading eyebrow="YOU DECIDE WHAT IS SHARED" title="Sharing & consent" subtitle="See which school and professionals can view your child’s information, what they can see, why and for how long." />
    {!data.links.length && <EmptyState id="sharing-empty" icon={School} title="No school links yet" description="The center will ask for your approval before linking your child to a school." />}
    {data.links.map(link => <article className="tm-card" key={link.id} data-testid={`sharing-link-${link.id}`}>
      <div className="tm-row"><School size={19} /><h3>{link.school_name} · {link.child_name}</h3><span className={`status ${link.status === 'active' ? 'sage' : link.status === 'pending' ? 'yellow' : 'lavender'}`} data-testid={`sharing-link-status-${link.id}`}>{link.status}</span></div>
      {link.status === 'pending' && <PendingLink link={link} reload={load} />}
      {link.status === 'active' && <ActiveLink link={link} videos={data.videos.filter(v => v.child_id === link.child_id)} reload={load} />}
      {link.status === 'active' && <><h4>Professionals with access</h4><Professionals items={data.assignments.filter(a => a.school_id === link.school_id && a.child_id === link.child_id)} reload={load} /></>}
      {link.end_reason && <p className="tm-meta">Ended: {link.end_reason}</p>}
      <details><summary data-testid={`sharing-history-${link.id}`}>Consent history ({link.history.length})</summary><ol className="tm-history">{link.history.slice().reverse().map((h, i) => <li key={i}><strong>{h.action}</strong> · {h.by_name} · {fmtTime(h.at)}{h.scopes && ` · ${h.scopes.length} categories`}{h.duration_days && ` · ${h.duration_days} days`}{h.note && ` · ${h.note}`}</li>)}</ol></details>
    </article>)}
    <Consents items={data.consents} reload={load} />
  </>;
}
