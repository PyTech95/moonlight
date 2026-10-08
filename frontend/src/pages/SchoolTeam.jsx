import { useState } from 'react';
import { Copy, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { PortalHeading } from '../components/PortalLayout';
import { SelectField, TextField, fmtTime, useAction } from '../components/team/teamUi';

export const InviteLink = ({ token }) => {
  if (!token) return null;
  const link = `${window.location.origin}/accept-invite?token=${token}`;
  return <div className="tm-notice" data-testid="demo-invite-link"><span>Demo only — invitation link (normally emailed):</span><code>{link}</code><button className="text-link" onClick={() => { navigator.clipboard?.writeText(link); toast.success('Link copied.'); }} data-testid="demo-invite-copy"><Copy size={14} /> Copy</button></div>;
};

export const SchoolTeam = ({ data, refresh }) => {
  const [invite, setInvite] = useState({ email: '', display_name: '' }), [token, setToken] = useState('');
  const [assign, setAssign] = useState({ child_id: data.linked_children?.[0]?.child_id || '', user_id: '', class_group: '' });
  const { busy, run } = useAction();
  const members = (data.members || []).filter(m => m.active);
  const sendInvite = async e => { e.preventDefault(); const r = await run('inv', () => api.post('/school/invitations', invite), 'Invitation created.'); if (r) { setToken(r.data.demo_invitation_token || ''); setInvite({ email: '', display_name: '' }); refresh(); } };
  const propose = async e => { e.preventDefault(); if (await run('as', () => api.post('/school/assignments', { ...assign, user_id: assign.user_id || members[0]?.id }), 'Assignment proposed. The family must approve it before any access is given.')) refresh(); };
  const end = async id => { if (await run(id, () => api.post(`/school/assignments/${id}/withdraw`), 'Assignment ended.')) refresh(); };
  return <>
    <PortalHeading eyebrow="SCHOOL COORDINATOR" title="Your school team" subtitle="School membership is separate from access to any child. Every child assignment needs family approval." />
    <div className="admin-columns">
      <form className="tm-card tm-form" onSubmit={sendInvite} data-testid="school-invite-form">
        <h3><UserPlus size={18} /> Invite a teacher or special educator</h3>
        <TextField id="school-invite-name" label="Full name" value={invite.display_name} onChange={v => setInvite({ ...invite, display_name: v })} required minLength={2} />
        <TextField id="school-invite-email" label="School email" type="email" value={invite.email} onChange={v => setInvite({ ...invite, email: v })} required />
        <button className="button primary" disabled={busy === 'inv'} data-testid="school-invite-submit">Send invitation</button>
        <InviteLink token={token} />
      </form>
      <form className="tm-card tm-form" onSubmit={propose} data-testid="school-assign-form">
        <h3>Propose a child assignment</h3>
        <p className="tm-hint">Only children whose families linked them to your school are listed. You cannot search the center’s directory.</p>
        <SelectField id="school-assign-child" label="Child" value={assign.child_id} onChange={v => setAssign({ ...assign, child_id: v })} options={(data.linked_children || []).map(l => [l.child_id, l.child_name])} />
        <SelectField id="school-assign-user" label="Team member" value={assign.user_id || members[0]?.id || ''} onChange={v => setAssign({ ...assign, user_id: v })} options={members.map(m => [m.id, `${m.display_name} · ${m.school_role}`])} />
        <TextField id="school-assign-class" label="Class / group" value={assign.class_group} onChange={v => setAssign({ ...assign, class_group: v })} required placeholder="e.g. Grade 1 · Section B" />
        <button className="button primary" disabled={busy === 'as' || !assign.child_id} data-testid="school-assign-submit">Propose for family approval</button>
      </form>
    </div>
    <section className="portal-section"><h2>Assignments</h2>
      <div className="tm-table" data-testid="school-assignments">{(data.assignments || []).map(a => <div className="tm-table-row" key={a.id} data-testid={`school-assignment-${a.id}`}><strong>{a.child_name}</strong><span>{a.user_name}</span><span>{a.class_group}</span><span className={`status ${a.status === 'active' ? 'sage' : a.status === 'proposed' ? 'yellow' : 'lavender'}`}>{a.status === 'proposed' ? 'Awaiting family' : a.status}</span><span className="tm-meta">{fmtTime(a.created_at)}</span>{['proposed', 'active'].includes(a.status) ? <button className="text-link" disabled={busy === a.id} onClick={() => end(a.id)} data-testid={`school-assignment-end-${a.id}`}>End</button> : <span />}</div>)}</div>
    </section>
    <section className="portal-section"><h2>Members</h2><div className="tm-table">{(data.members || []).map(m => <div className="tm-table-row" key={m.id} data-testid={`school-member-${m.id}`}><strong>{m.display_name}</strong><span>{m.school_role}</span><span className={`status ${m.active ? 'sage' : 'lavender'}`}>{m.active ? 'Active' : 'Inactive'}</span></div>)}</div>
      {(data.invitations || []).length > 0 && <><h2>Invitations</h2><div className="tm-table">{data.invitations.map(i => <div className="tm-table-row" key={i.id}><strong>{i.display_name}</strong><span>{i.email}</span><span className="status yellow">{i.used_at ? 'Accepted' : i.cancelled_at ? 'Cancelled' : 'Pending'}</span></div>)}</div></>}
    </section>
  </>;
};
