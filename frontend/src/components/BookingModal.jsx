import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { api, errorText } from '../lib/api';
import { useBooking } from '../lib/context';
import { toast } from 'sonner';
import { ArrowUpRight, Check, ShieldCheck } from 'lucide-react';

const SERVICES = ['Speech Therapy','Occupational Therapy','ABA Therapy','Sensory Integration Therapy','Yoga Therapy','Neurodevelopmental Therapy','Remedial Therapy','Music & Play Therapy','I am not sure'];
const blank = { guardian_name:'', phone:'+91 ', email:'', service:'Speech Therapy', contact_time:'Any time', contact_preference:'Phone', consent:false };

export default function BookingModal(){
  const { open, setOpen } = useBooking();
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(null), [error, setError] = useState('');
  const set = (k,v) => setForm(f => ({...f, [k]:v}));
  const close = () => { setOpen(false); setTimeout(()=>{ setDone(null); setError(''); setForm(blank); }, 200); };
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const key = (window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now())+Math.random()).replace(/-/g,'');
      const body = { guardian_name:form.guardian_name, phone:form.phone, service:form.service, contact_time:form.contact_time, contact_preference:form.contact_preference, consent:form.consent, source:'Website popup', country:'India' };
      if (form.email) body.email = form.email;
      const { data } = await api.post('/enquiries', body, { headers:{ 'Idempotency-Key': key } });
      setDone(data);
      toast.success('Request received. The team will reach out to you.');
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={v => v ? setOpen(true) : close()}>
    <DialogContent className="booking-modal" data-testid="booking-modal">
      {done ? <div className="booking-success" data-testid="booking-success">
        <span className="booking-check"><Check size={26}/></span>
        <DialogHeader><DialogTitle>Request received</DialogTitle><DialogDescription>Reference <strong>{done.reference}</strong>. The team will contact you to discuss suitability, availability and next steps. This is a request — not a confirmed appointment.</DialogDescription></DialogHeader>
        <button className="button primary full-width" onClick={close} data-testid="booking-close">Done</button>
      </div> : <>
        <DialogHeader><DialogTitle>Book an assessment</DialogTitle><DialogDescription>Share a few details and we’ll confirm the next steps together. Nothing is booked automatically.</DialogDescription></DialogHeader>
        {error && <p className="error-message" role="alert" data-testid="booking-error">{error}</p>}
        <form onSubmit={submit} className="booking-form">
          <div className="field"><label>Parent / guardian name <span>*</span></label><input data-testid="booking-name" required minLength={2} value={form.guardian_name} onChange={e=>set('guardian_name',e.target.value)} placeholder="Your name"/></div>
          <div className="form-row"><div className="field"><label>Phone <span>*</span></label><input data-testid="booking-phone" required value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+91 98xxxxxxxx"/></div><div className="field"><label>Email <span className="optional">optional</span></label><input type="email" data-testid="booking-email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="you@example.com"/></div></div>
          <div className="form-row"><div className="field"><label>Area of interest</label><select data-testid="booking-service" value={form.service} onChange={e=>set('service',e.target.value)}>{SERVICES.map(s=><option key={s}>{s}</option>)}</select></div><div className="field"><label>Best time to call</label><select data-testid="booking-time" value={form.contact_time} onChange={e=>set('contact_time',e.target.value)}>{['Any time','Morning','Afternoon','Evening'].map(s=><option key={s}>{s}</option>)}</select></div></div>
          <label className="checkbox-label" data-testid="booking-consent-label"><input type="checkbox" data-testid="booking-consent" checked={form.consent} onChange={e=>set('consent',e.target.checked)}/> I agree to be contacted about this request. I understand not to share medical history here.</label>
          <button className="button primary full-width" disabled={busy||!form.consent} data-testid="booking-submit">{busy?'Sending…':'Send request'} <ArrowUpRight size={17}/></button>
          <span className="booking-note"><ShieldCheck size={13}/> A request only · a fictional demo workspace · no payment is taken</span>
        </form>
      </>}
    </DialogContent>
  </Dialog>;
}
