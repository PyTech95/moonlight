import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Paperclip, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorText } from '../../lib/api';
import { api } from '../../lib/api';
import { Check, fmtTime, useAction, KIND_TONE } from './teamUi';

export const TeamNotice = ({ bundle }) => (
  <div className="tm-notice" data-testid="team-response-notice">
    <span><Clock size={15} /> {bundle.response_hours}</span>
    <span><AlertTriangle size={15} /> {bundle.emergency_notice}</span>
  </div>
);

export const MessagesPanel = ({ bundle, reload }) => {
  const [body, setBody] = useState(''), [confirmed, setConfirmed] = useState(false), [files, setFiles] = useState([]), [uploading, setUploading] = useState(false);
  const attach = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) { toast.error('Attach a PDF, JPG or PNG up to 10 MB.'); return; }
    setUploading(true);
    try { const form = new FormData(); form.append('file', file); const { data } = await api.post(`/team/children/${bundle.child.id}/attachments`, form); setFiles(f => [...f, data]); setConfirmed(false); } catch (err) { toast.error(errorText(err)); } finally { setUploading(false); }
  };
  const { busy, run } = useAction();
  const unread = bundle.messages.some(m => m.unread);
  useEffect(() => { if (unread) api.post(`/team/children/${bundle.child.id}/messages/read`).catch(() => {}); }, [bundle.child.id, unread]);
  const send = async e => { e.preventDefault(); if (await run('send', () => api.post(`/team/children/${bundle.child.id}/messages`, { body, recipients_confirmed: confirmed, attachment_ids: files.map(f => f.id) }), 'Message sent to the listed team members.')) { setBody(''); setFiles([]); setConfirmed(false); reload(); } };
  return (
    <div data-testid="messages-panel">
      <TeamNotice bundle={bundle} />
      <p className="muted small">This child-specific team space is separate from private family and clinical conversations. Contact details are never shown.</p>
      <ol className="tm-thread" data-testid="message-thread">
        {bundle.messages.map(m => (
          <li key={m.id} className={m.unread ? 'unread' : ''} data-testid={`message-${m.id}`}>
            <div className="tm-row"><span className={`status ${KIND_TONE[m.author_kind] || 'sage'}`}>{m.author_label} · {m.author_name}</span><span className="tm-meta">{fmtTime(m.created_at)}</span>{m.unread && <span className="status yellow">New</span>}</div>
            <p>{m.body}</p>
            {m.attachments?.length > 0 && <ul className="tm-attachments">{m.attachments.map(a => <li key={a.id}><a href={`${process.env.REACT_APP_BACKEND_URL}/api/team/attachments/${a.id}`} target="_blank" rel="noreferrer" data-testid={`message-attachment-${a.id}`}><Paperclip size={13} /> {a.filename}</a> <span className="tm-meta">{Math.ceil(a.size / 1024)} KB</span></li>)}</ul>}
            <span className="tm-meta">Sent to: {m.recipients.map(r => r.name).join(', ')}</span>
          </li>))}
        {!bundle.messages.length && <li className="tm-empty" data-testid="messages-empty">No team messages yet.</li>}
      </ol>
      <form className="tm-card tm-form" onSubmit={send} data-testid="message-form">
        <div className="field tm-field"><label htmlFor="message-body">New message</label><textarea id="message-body" data-testid="message-body" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} required /></div>
        <div className="tm-attach-row">
          <label className={`text-link tm-attach ${uploading || files.length >= 3 ? 'disabled' : ''}`} htmlFor="message-attachment-input"><Paperclip size={15} /> {uploading ? 'Scanning & uploading…' : 'Attach PDF, JPG or PNG (max 10 MB)'}</label>
          <input id="message-attachment-input" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden disabled={uploading || files.length >= 3} onChange={attach} data-testid="message-attachment-input" />
          {files.map(f => <span className="tm-file" key={f.id} data-testid={`message-staged-${f.id}`}><Paperclip size={12} /> {f.filename}<button type="button" aria-label={`Remove ${f.filename}`} onClick={() => { setFiles(x => x.filter(y => y.id !== f.id)); setConfirmed(false); }} data-testid={`message-staged-remove-${f.id}`}><X size={12} /></button></span>)}
        </div>
        <div className="tm-recipients" data-testid="message-recipients"><Users size={15} /><div><strong>{files.length ? `This message and ${files.length} attachment${files.length > 1 ? 's' : ''} will be visible to:` : 'This message will be visible to:'}</strong><ul>{bundle.recipients.map(r => <li key={r.id} data-testid={`recipient-${r.id}`}>{r.name} <span className="tm-meta">· {r.label}</span></li>)}</ul></div></div>
        <Check id="message-confirm-recipients" checked={confirmed} onChange={setConfirmed}>{files.length ? 'I’ve checked who will receive this message and its attachments' : 'I’ve checked who will receive this message'}</Check>
        <p className="tm-hint">External alerts only say there is a new update, with a secure sign-in link — never the message itself.</p>
        <button className="button primary" disabled={!confirmed || !body.trim() || uploading || busy === 'send'} data-testid="message-send"><Send size={15} /> Send to team</button>
      </form>
    </div>
  );
};
