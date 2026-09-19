import { useState } from 'react';
import { api, errorText } from '../lib/api';
import { toast } from 'sonner';
import { ArrowUpRight, Check, ShieldCheck } from 'lucide-react';

const SERVICES = ['Speech Therapy','Occupational Therapy','ABA Therapy','Sensory Integration Therapy','Yoga Therapy','Neurodevelopmental Therapy','Remedial Therapy','Music & Play Therapy','I am not sure'];

/**
 * Reusable public contact form. Posts to the shared /enquiries endpoint so
 * submissions appear in the admin dashboard. `source` distinguishes the page.
 */
export default function ContactForm({ source='Website', eyebrow='GET IN TOUCH', title='Send us a message', description='Share a few details and the team will reach out to talk through suitability, availability and next steps. Nothing is booked automatically.', defaultService='I am not sure', idPrefix='contact' }){
  const blank = { guardian_name:'', phone:'+91 ', email:'', service:defaultService, contact_time:'Any time', contact_preference:'Phone', message:'', consent:false };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(null), [error, setError] = useState('');
  const set = (k,v) => setForm(f => ({...f, [k]:v}));
  const reset = () => { setDone(null); setError(''); setForm(blank); };
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const key = (window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now())+Math.random()).replace(/-/g,'');
      const body = { guardian_name:form.guardian_name, phone:form.phone, service:form.service, contact_time:form.contact_time, contact_preference:form.contact_preference, consent:form.consent, source, country:'India' };
      if (form.email) body.email = form.email;
      if (form.message.trim()) body.message = form.message.trim();
      const { data } = await api.post('/enquiries', body, { headers:{ 'Idempotency-Key': key } });
      setDone(data);
      toast.success('Message received. The team will reach out to you.');
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return <section className="contact-form-section section-pad top-zero" id={`${idPrefix}-form`}>
    <div className="container">
      <div className="contact-form-card" data-testid={`${idPrefix}-form-card`}>
        {done ? <div className="booking-success" data-testid={`${idPrefix}-success`}>
          <span className="booking-check"><Check size={26}/></span>
          <h2>Message received</h2>
          <p>Reference <strong data-testid={`${idPrefix}-reference`}>{done.reference}</strong>. The team will contact you to discuss suitability, availability and next steps. This is a request — not a confirmed appointment.</p>
          <button className="button primary" onClick={reset} data-testid={`${idPrefix}-again`}>Send another message <ArrowUpRight size={16}/></button>
        </div> : <>
          <div className="contact-form-head">
            <span className="eyebrow">{eyebrow}</span>
            <h2 data-testid={`${idPrefix}-form-title`}>{title}</h2>
            <p>{description}</p>
          </div>
          {error && <p className="error-message" role="alert" data-testid={`${idPrefix}-error`}>{error}</p>}
          <form onSubmit={submit} className="booking-form" data-testid={`${idPrefix}-form`}>
            <div className="field"><label>Parent / guardian name <span>*</span></label><input data-testid={`${idPrefix}-name`} required minLength={2} value={form.guardian_name} onChange={e=>set('guardian_name',e.target.value)} placeholder="Your name"/></div>
            <div className="form-row">
              <div className="field"><label>Phone <span>*</span></label><input data-testid={`${idPrefix}-phone`} required value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+91 98xxxxxxxx"/></div>
              <div className="field"><label>Email <span className="optional">optional</span></label><input type="email" data-testid={`${idPrefix}-email`} value={form.email} onChange={e=>set('email',e.target.value)} placeholder="you@example.com"/></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Area of interest</label><select data-testid={`${idPrefix}-service`} value={form.service} onChange={e=>set('service',e.target.value)}>{SERVICES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div className="field"><label>Best time to call</label><select data-testid={`${idPrefix}-time`} value={form.contact_time} onChange={e=>set('contact_time',e.target.value)}>{['Any time','Morning','Afternoon','Evening'].map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div className="field"><label>How can we help? <span className="optional">optional</span></label><textarea data-testid={`${idPrefix}-message`} rows={4} maxLength={1000} value={form.message} onChange={e=>set('message',e.target.value)} placeholder="Tell us a little about what you’re looking for. Please don’t share medical history here."/></div>
            <label className="checkbox-label" data-testid={`${idPrefix}-consent-label`}><input type="checkbox" data-testid={`${idPrefix}-consent`} checked={form.consent} onChange={e=>set('consent',e.target.checked)}/> I agree to be contacted about this request. I understand not to share medical history here.</label>
            <button className="button primary full-width" disabled={busy||!form.consent} data-testid={`${idPrefix}-submit`}>{busy?'Sending…':'Send message'} <ArrowUpRight size={17}/></button>
            <span className="booking-note"><ShieldCheck size={13}/> A request only · a fictional demo workspace · no payment is taken</span>
          </form>
        </>}
      </div>
    </div>
  </section>;
}
