import { useState } from 'react';
import { Download, Eye, FileText, Info, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { Check, SelectField, TextField, fmt, fmtTime, useAction } from './teamUi';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const KINDS = [['support_plan', 'School support plan'], ['assessment_summary', 'Parent-friendly assessment summary'], ['accommodations', 'Accommodation recommendations'], ['review_report', 'Review report'], ['transition_summary', 'Transition / handover summary']];

const UploadForm = ({ childId, onDone }) => {
  const [form, setForm] = useState({ kind: 'support_plan', title: '', share_with_school: false, allow_download: false, school_access_days: 90 }), [file, setFile] = useState(null);
  const { busy, run } = useAction();
  const submit = async e => {
    e.preventDefault();
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, String(v)));
    body.append('file', file);
    if (await run('up', () => api.post(`/team/children/${childId}/documents`, body), 'Document added.')) onDone();
  };
  return (
    <form className="tm-card tm-form" onSubmit={submit} data-testid="document-upload-form">
      <h3>Add a document</h3>
      <div className="tm-grid-2">
        <SelectField id="document-kind" label="Document type" value={form.kind} onChange={v => setForm({ ...form, kind: v })} options={KINDS} />
        <TextField id="document-title" label="Title" value={form.title} onChange={v => setForm({ ...form, title: v })} required minLength={3} />
      </div>
      <div className="field tm-field"><label htmlFor="document-file">File (PDF, DOCX, PNG, JPEG · max 15 MB)</label><input id="document-file" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files[0])} required data-testid="document-file" /></div>
      <Check id="document-share-school" checked={form.share_with_school} onChange={v => setForm({ ...form, share_with_school: v })}>Share with the school (only if the family allows documents)</Check>
      <Check id="document-allow-download" checked={form.allow_download} onChange={v => setForm({ ...form, allow_download: v })}>Allow school to download (separate from viewing)</Check>
      <TextField id="document-days" label="School access expires after (days)" type="number" min={1} max={365} value={form.school_access_days} onChange={v => setForm({ ...form, school_access_days: Number(v) })} />
      <button className="button primary" disabled={!file || busy === 'up'} data-testid="document-upload-submit"><Upload size={15} /> Upload</button>
    </form>
  );
};

const DocActions = ({ doc, clinical, reload }) => {
  const [file, setFile] = useState(null);
  const { busy, run } = useAction();
  const newVersion = async () => { const body = new FormData(); body.append('file', file); if (await run('v', () => api.post(`/team/documents/${doc.id}/versions`, body), r => r.data.message)) { setFile(null); reload(); } };
  const toggle = async (key, value) => { if (await run(key, () => api.patch(`/team/documents/${doc.id}`, { share_with_school: doc.share_with_school, allow_download: doc.allow_download, school_access_days: 90, [key]: value }), 'Sharing updated.')) reload(); };
  return (
    <div className="tm-actions wrap">
      <a className="text-link" href={`${BACKEND}/api/team/documents/${doc.id}/file`} target="_blank" rel="noreferrer" data-testid={`document-view-${doc.id}`}><Eye size={14} /> View</a>
      {doc.can_download && <a className="text-link" href={`${BACKEND}/api/team/documents/${doc.id}/file?download=true`} data-testid={`document-download-${doc.id}`}><Download size={14} /> Download</a>}
      {clinical && <>
        <button className="text-link" disabled={!!busy} onClick={() => toggle('share_with_school', !doc.share_with_school)} data-testid={`document-toggle-share-${doc.id}`}>{doc.share_with_school ? 'Stop sharing with school' : 'Share with school'}</button>
        <button className="text-link" disabled={!!busy} onClick={() => toggle('allow_download', !doc.allow_download)} data-testid={`document-toggle-download-${doc.id}`}>{doc.allow_download ? 'Disallow school download' : 'Allow school download'}</button>
        <input type="file" aria-label="New version file" onChange={e => setFile(e.target.files[0])} data-testid={`document-version-file-${doc.id}`} />
        <button className="text-link" disabled={!file || busy === 'v'} onClick={newVersion} data-testid={`document-version-submit-${doc.id}`}>Upload new version</button>
      </>}
    </div>
  );
};

export const DocumentsPanel = ({ bundle, reload }) => {
  const clinical = ['therapist', 'coordinator'].includes(bundle.viewer.kind);
  const [adding, setAdding] = useState(false);
  return (
    <div data-testid="documents-panel">
      <div className="tm-panel-head"><p className="tm-note"><Info size={15} /> Removing portal access cannot recall a file already downloaded by an authorized recipient.</p>{clinical && !adding && <button className="button primary" onClick={() => setAdding(true)} data-testid="document-new-button"><Upload size={16} /> Add document</button>}</div>
      {adding && <UploadForm childId={bundle.child.id} onDone={() => { setAdding(false); reload(); }} />}
      {!bundle.documents.length && <p className="tm-empty" data-testid="documents-empty">No documents are shared here yet.</p>}
      {bundle.documents.map(d => (
        <article className="tm-card" key={d.id} data-testid={`document-${d.id}`}>
          <div className="tm-row"><FileText size={18} /><h3>{d.title}</h3><span className="tm-version">v{d.current_version}</span><span className="status lavender">{d.kind_label}</span>{clinical && <span className={`status ${d.share_with_school ? 'yellow' : 'sage'}`}>{d.share_with_school ? `School access until ${fmt(d.school_access_expires_at)}` : 'Not shared with school'}</span>}</div>
          <p className="tm-meta">Versions: {d.versions.map(v => `v${v.version} ${v.filename} (${fmt(v.at)})`).join(' · ')}</p>
          <DocActions doc={d} clinical={clinical} reload={reload} />
          {d.access_log && d.access_log.length > 0 && <details><summary data-testid={`document-log-${d.id}`}>Access history ({d.access_log.length})</summary><ul className="tm-list">{d.access_log.slice().reverse().map((l, i) => <li key={i}>{fmtTime(l.at)} · {l.user_name} ({l.label}) · {l.action} v{l.version}</li>)}</ul></details>}
        </article>))}
    </div>
  );
};
