import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Send, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { Check, fmtTime, useAction, KIND_TONE } from './teamUi';

export const TeamNotice = ({ bundle }) => (
  <div className="tm-notice" data-testid="team-response-notice">
    <span><Clock size={15} /> {bundle.response_hours}</span>
    <span><AlertTriangle size={15} /> {bundle.emergency_notice}</span>
  </div>
);

export const MessagesPanel = ({ bundle, reload }) => {
  const [body, setBody] = useState(''), [confirmed, setConfirmed] = useState(false);
  const { busy, run } = useAction();
  const unread = bundle.messages.some(m => m.unread);
  useEffect(() => { if (unread) api.post(`/team/children/${bundle.child.id}/messages/read`).catch(() => {}); }, [bundle.child.id, unread]);
  const send = async e => { e.preventDefault(); if (await run('send', () => api.post(`/team/children/${bundle.child.id}/messages`, { body, recipients_confirmed: confirmed }), 'Message sent to the listed team members.')) { setBody(''); setConfirmed(false); reload(); } };
  return (
    <div data-testid="messages-panel">
      <TeamNotice bundle={bundle} />
      <p className="muted small">This child-specific team space is separate from private family and clinical conversations. Contact details are never shown.</p>
      <ol className="tm-thread" data-testid="message-thread">
        {bundle.messages.map(m => (
          <li key={m.id} className={m.unread ? 'unread' : ''} data-testid={`message-${m.id}`}>
            <div className="tm-row"><span className={`status ${KIND_TONE[m.author_kind] || 'sage'}`}>{m.author_label} · {m.author_name}</span><span className="tm-meta">{fmtTime(m.created_at)}</span>{m.unread && <span className="status yellow">New</span>}</div>
            <p>{m.body}</p>
            <span className="tm-meta">Sent to: {m.recipients.map(r => r.name).join(', ')}</span>
          </li>))}
        {!bundle.messages.length && <li className="tm-empty" data-testid="messages-empty">No team messages yet.</li>}
      </ol>
      <form className="tm-card tm-form" onSubmit={send} data-testid="message-form">
        <div className="field tm-field"><label htmlFor="message-body">New message</label><textarea id="message-body" data-testid="message-body" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} required /></div>
        <div className="tm-recipients" data-testid="message-recipients"><Users size={15} /><div><strong>This message will be visible to:</strong><ul>{bundle.recipients.map(r => <li key={r.id} data-testid={`recipient-${r.id}`}>{r.name} <span className="tm-meta">· {r.label}</span></li>)}</ul></div></div>
        <Check id="message-confirm-recipients" checked={confirmed} onChange={setConfirmed}>I’ve checked who will receive this message</Check>
        <p className="tm-hint">External alerts only say there is a new update, with a secure sign-in link — never the message itself.</p>
        <button className="button primary" disabled={!confirmed || !body.trim() || busy === 'send'} data-testid="message-send"><Send size={15} /> Send to team</button>
      </form>
    </div>
  );
};
