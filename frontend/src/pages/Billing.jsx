import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download, FilePlus2, Link2, Plus, RefreshCw, Search, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorText, dateLabel } from '../lib/api';
import { PortalHeading, useWorkspace } from '../components/PortalLayout';
import { Check, TextField, useAction } from '../components/team/teamUi';
import {
  Field,
  INVOICE_LABEL,
  INVOICE_TONE,
  Modal,
  Stat,
  Tabs,
  fromPaise,
  istDate,
  niceDay,
  rupees,
  toPaise,
  useLoad,
} from '../components/ops/opsUi';
import { opsAccess } from './AdminChildren';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const pdfUrl = (id) => `${BACKEND}/api/billing/invoices/${id}/pdf`;
const METHODS = [['upi', 'UPI'], ['cash', 'Cash'], ['bank', 'Bank transfer'], ['card', 'Card'], ['cheque', 'Cheque']];

const copy = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Link copied.');
  } catch {
    toast.message(text);
  }
};

// ---------- invoice composer ----------
const Composer = ({ open, onClose, childId, children, onDone }) => {
  const [child, setChild] = useState(childId || ''),
    [lines, setLines] = useState([]),
    [discount, setDiscount] = useState(''),
    [tax, setTax] = useState(0),
    [due, setDue] = useState(7),
    [notes, setNotes] = useState(''),
    [busy, setBusy] = useState(false);
  const info = useLoad(open && child ? `/billing/children/${child}` : null);
  const catalog = useLoad(open ? '/billing/catalog' : null);
  const settings = useLoad(open ? '/billing/settings' : null);
  useEffect(() => {
    if (open) {
      setChild(childId || '');
      setLines([]);
      setDiscount('');
      setNotes('');
    }
  }, [open, childId]);
  useEffect(() => {
    if (settings.data) {
      setTax(settings.data.settings.tax_percent);
      setDue(settings.data.settings.payment_terms_days);
    }
  }, [settings.data]);
  const unbilled = useMemo(() => info.data?.unbilled || [], [info.data]);
  const used = new Set(lines.flatMap((l) => l.session_ids || []));
  const groups = useMemo(() => {
    const g = {};
    unbilled.forEach((s) => {
      const key = `${s.service}|${s.rate_paise}`;
      (g[key] = g[key] || { service: s.service, rate: s.rate_paise, sessions: [] }).sessions.push(s);
    });
    return Object.values(g);
  }, [unbilled]);
  const addSessions = (group) => {
    const pick = group.sessions.filter((s) => !used.has(s.id));
    if (!pick.length) return;
    const dates = pick.map((s) => niceDay(istDate(s.starts_at)).replace(/^\w+, /, '')).join(', ');
    setLines([...lines, { description: `${group.service} sessions (${dates})`, qty: pick.length, rate: fromPaise(group.rate), kind: 'session', session_ids: pick.map((s) => s.id) }]);
  };
  const subtotal = lines.reduce((t, l) => t + Math.round(Number(l.qty || 0) * toPaise(l.rate)), 0);
  const disc = Math.min(toPaise(discount), subtotal);
  const taxAmt = Math.round(((subtotal - disc) * Number(tax || 0)) / 100);
  const submit = async (issue) => {
    setBusy(true);
    try {
      const { data } = await api.post('/billing/invoices', {
        child_id: child,
        items: lines.map((l) => ({ description: l.description, qty: Number(l.qty), rate_paise: toPaise(l.rate), kind: l.kind, session_ids: l.session_ids || [], plan_id: l.plan_id || '', package_start: l.package_start || '' })),
        discount_paise: disc, tax_percent: Number(tax || 0), due_days: Number(due || 0), notes, issue,
      });
      toast.success(issue ? `Invoice ${data.number} issued and sent to the family.` : 'Draft saved.');
      onDone(data);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const setLine = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <Modal open={open} onClose={onClose} wide title="New invoice" testid="invoice-composer">
      <Field id="inv-child" label="Child">
        <select id="inv-child" data-testid="inv-child" value={child} onChange={(e) => (setChild(e.target.value), setLines([]))}>
          <option value="">Choose…</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      {child && info.data && (
        <>
          <p className="ops-muted">
            Bill to: {info.data.child.bill_to.name} {info.data.child.bill_to.phone && `· ${info.data.child.bill_to.phone}`}
          </p>
          <div className="inv-pick">
            <h4>Attended sessions not yet invoiced</h4>
            {groups.length ? (
              groups.map((g) => {
                const left = g.sessions.filter((s) => !used.has(s.id)).length;
                return (
                  <div className="tm-row" key={`${g.service}${g.rate}`} style={{ justifyContent: 'space-between' }}>
                    <span>
                      {g.service}: {g.sessions.length} session{g.sessions.length === 1 ? '' : 's'} × {g.rate ? rupees(g.rate) : 'no price set'}
                    </span>
                    <button className="text-button" disabled={!left} onClick={() => addSessions(g)} data-testid="inv-add-sessions">
                      <Plus size={13} /> {left ? 'Add' : 'Added'}
                    </button>
                  </div>
                );
              })
            ) : (
              <span className="ops-muted">None. Sessions appear here once attendance is marked Present.</span>
            )}
          </div>
          <div className="tm-row">
            <select aria-label="Add a package" value="" onChange={(e) => {
              const p = catalog.data.plans.find((x) => x.id === e.target.value);
              if (p) setLines([...lines, { description: `${p.name} (${p.sessions} × ${p.service}, valid ${p.validity_days} days)`, qty: 1, rate: fromPaise(p.amount_paise), kind: 'package', plan_id: p.id, package_start: istDate() }]);
            }} style={{ maxWidth: 260, minHeight: 38 }} data-testid="inv-add-package">
              <option value="">+ Package…</option>
              {(catalog.data?.plans || []).filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {rupees(p.amount_paise)}
                </option>
              ))}
            </select>
            <select aria-label="Add from price list" value="" onChange={(e) => {
              const f = catalog.data.fees.find((x) => x.id === e.target.value);
              if (f) setLines([...lines, { description: f.name, qty: 1, rate: fromPaise(f.amount_paise), kind: 'fee' }]);
            }} style={{ maxWidth: 260, minHeight: 38 }}>
              <option value="">+ Price list item…</option>
              {(catalog.data?.fees || []).filter((f) => f.active).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {rupees(f.amount_paise)}
                </option>
              ))}
            </select>
            <button className="text-button" onClick={() => setLines([...lines, { description: '', qty: 1, rate: '', kind: 'custom' }])} data-testid="inv-add-custom">
              <Plus size={13} /> Other line
            </button>
          </div>
          {lines.length > 0 && (
            <div className="inv-lines">
              {lines.map((l, i) => (
                <div className="inv-line" key={i}>
                  <input aria-label="Description" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="Description" />
                  <input aria-label="Quantity" type="number" min="0.5" step="0.5" value={l.qty} disabled={l.kind === 'session' || l.kind === 'package'} onChange={(e) => setLine(i, 'qty', e.target.value)} />
                  <input aria-label="Rate in rupees" inputMode="decimal" value={l.rate} placeholder="₹ rate" onChange={(e) => setLine(i, 'rate', e.target.value)} />
                  <span className="amount">{rupees(Math.round(Number(l.qty || 0) * toPaise(l.rate)))}</span>
                  <button aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="tm-grid-3">
            <TextField id="inv-discount" label="Discount (₹)" inputMode="decimal" value={discount} onChange={setDiscount} />
            <TextField id="inv-tax" label={`${settings.data?.settings.tax_label || 'Tax'} %`} type="number" min="0" max="28" step="0.5" value={tax} onChange={setTax} />
            <TextField id="inv-due" label="Due in (days)" type="number" min="0" max="120" value={due} onChange={setDue} />
          </div>
          <TextField id="inv-notes" label="Note on the invoice (optional)" value={notes} onChange={setNotes} />
          <div className="inv-totals">
            <div>
              <span>Subtotal</span>
              <strong>{rupees(subtotal)}</strong>
            </div>
            {disc > 0 && (
              <div>
                <span>Discount</span>
                <strong>−{rupees(disc)}</strong>
              </div>
            )}
            {taxAmt > 0 && (
              <div>
                <span>Tax {tax}%</span>
                <strong>{rupees(taxAmt)}</strong>
              </div>
            )}
            <div className="grand">
              <span>Total</span>
              <strong data-testid="inv-total">{rupees(subtotal - disc + taxAmt)}</strong>
            </div>
          </div>
          <div className="ops-actions">
            <button className="button primary" disabled={busy || !lines.length || lines.some((l) => !l.description.trim())} onClick={() => submit(true)} data-testid="inv-issue">
              Issue and email the family
            </button>
            <button className="button outlined" disabled={busy || !lines.length} onClick={() => submit(false)}>
              Save as draft
            </button>
          </div>
        </>
      )}
    </Modal>
  );
};

// ---------- one invoice ----------
const InvoiceDialog = ({ id, onClose, onChanged, canWrite, razorpay }) => {
  const inv = useLoad(id ? `/billing/invoices/${id}` : null);
  const [pay, setPay] = useState(null),
    [reversing, setReversing] = useState(null),
    [voiding, setVoiding] = useState(false),
    [reason, setReason] = useState(''),
    { busy, run } = useAction();
  const d = inv.data;
  const refresh = () => (inv.reload(), onChanged());
  if (!id) return null;
  return (
    <Modal open onClose={onClose} wide title={d ? (d.number ? `Invoice ${d.number}` : 'Draft invoice') : 'Invoice'} testid="invoice-dialog"
      description={d ? `${d.child_name} · ${d.bill_to.name}${d.issue_date ? ` · issued ${d.issue_date}, due ${d.due_date}` : ''}` : ''}>
      {!d ? (
        <div className="loading-screen">Opening…</div>
      ) : (
        <>
          <p>
            <span className={`status ${INVOICE_TONE[d.status]}`}>{INVOICE_LABEL[d.status]}</span>
            {d.void_reason && <span className="ops-muted"> · {d.void_reason}</span>}
          </p>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((i, k) => (
                  <tr key={k}>
                    <td>{i.description}</td>
                    <td className="num">{i.qty}</td>
                    <td className="num">{rupees(i.rate_paise)}</td>
                    <td className="num">{rupees(i.amount_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inv-totals">
            {d.discount_paise > 0 && (
              <div>
                <span>Discount</span>
                <strong>−{rupees(d.discount_paise)}</strong>
              </div>
            )}
            {d.tax_paise > 0 && (
              <div>
                <span>Tax {d.tax_percent}%</span>
                <strong>{rupees(d.tax_paise)}</strong>
              </div>
            )}
            <div className="grand">
              <span>Total</span>
              <strong>{rupees(d.total_paise)}</strong>
            </div>
            <div>
              <span>Paid</span>
              <strong>{rupees(d.amount_paid_paise)}</strong>
            </div>
            <div className="grand">
              <span>Balance</span>
              <strong data-testid="invoice-balance">{rupees(d.balance_paise)}</strong>
            </div>
          </div>
          {d.payments?.length > 0 && (
            <>
              <h4 className="ops-muted">PAYMENTS</h4>
              {d.payments.map((p) => (
                <div className="kid-person" key={p.id} style={{ opacity: p.reversed ? 0.5 : 1 }}>
                  <div>
                    <strong>
                      {rupees(p.amount_paise)} · {p.method_label}
                    </strong>
                    <small>
                      {p.received_on} · {p.reference || 'no reference'} · recorded by {p.recorded_by_name}
                      {p.reversed && ` · reversed: ${p.reverse_reason}`}
                    </small>
                  </div>
                  {canWrite && !p.reversed && reversing?.id !== p.id && (
                    <button className="text-button danger" onClick={() => setReversing({ id: p.id, reason: '' })}>
                      Reverse
                    </button>
                  )}
                  {reversing?.id === p.id && (
                    <form className="tm-row" onSubmit={(e) => {
                      e.preventDefault();
                      run('rev', () => api.post(`/billing/invoices/${d.id}/payments/${p.id}/reverse`, { reason: reversing.reason }), 'Payment reversed.').then((ok) => ok && (setReversing(null), refresh()));
                    }}>
                      <input aria-label="Reason" placeholder="Reason, e.g. bounced cheque" value={reversing.reason} required minLength={3}
                        onChange={(e) => setReversing({ ...reversing, reason: e.target.value })} style={{ minHeight: 34, width: 220 }} />
                      <button className="button small outlined" disabled={busy === 'rev'}>Reverse</button>
                    </form>
                  )}
                </div>
              ))}
            </>
          )}
          {d.payment_link?.short_url && ['issued', 'partly_paid'].includes(d.status) && (
            <div className="pay-link">
              <Link2 size={14} /> {d.payment_link.short_url}
              <button className="text-button" onClick={() => copy(d.payment_link.short_url)}>
                <Copy size={13} /> Copy
              </button>
              {canWrite && (
                <button className="text-button" onClick={() => run('sync', () => api.post(`/billing/invoices/${d.id}/payment-link/refresh`), 'Checked with Razorpay.').then((ok) => ok && refresh())}>
                  <RefreshCw size={13} /> Check payment
                </button>
              )}
            </div>
          )}
          {pay && (
            <form className="tm-card tm-form" style={{ marginTop: 10 }}
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run('pay', () => api.post(`/billing/invoices/${d.id}/payments`, { amount_paise: toPaise(pay.amount), method: pay.method, reference: pay.reference, received_on: pay.received_on, notify: true }), 'Payment recorded. A receipt email is on its way to the family.');
                if (ok) {
                  setPay(null);
                  refresh();
                }
              }}>
              <div className="tm-grid-2">
                <TextField id="pay-amount" label="Amount (₹)" inputMode="decimal" value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} required />
                <Field id="pay-method" label="Method">
                  <select id="pay-method" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                    {METHODS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <TextField id="pay-ref" label="Reference (UPI ID / txn no.)" value={pay.reference} onChange={(v) => setPay({ ...pay, reference: v })} />
                <TextField id="pay-date" label="Received on" type="date" value={pay.received_on} max={istDate()} onChange={(v) => setPay({ ...pay, received_on: v })} />
              </div>
              <button className="button primary" disabled={busy === 'pay'} data-testid="pay-save">
                Record payment
              </button>
            </form>
          )}
          {voiding && (
            <form className="tm-form" onSubmit={async (e) => {
              e.preventDefault();
              if (await run('void', () => api.post(`/billing/invoices/${d.id}/void`, { reason }), (r) => r.data.message)) refresh();
              setVoiding(false);
            }}>
              <TextField id="void-reason" label="Why is this invoice being voided?" value={reason} onChange={setReason} required minLength={3} />
              <button className="button primary">Void invoice</button>
            </form>
          )}
          <div className="ops-actions">
            {d.status !== 'draft' && (
              <a className="button outlined small" href={pdfUrl(d.id)} target="_blank" rel="noreferrer" data-testid="invoice-pdf">
                <Download size={14} /> PDF
              </a>
            )}
            {canWrite && ['issued', 'partly_paid'].includes(d.status) && !pay && (
              <button className="button primary small" onClick={() => setPay({ amount: fromPaise(d.balance_paise), method: 'upi', reference: '', received_on: istDate() })} data-testid="pay-open">
                <Wallet size={14} /> Record payment
              </button>
            )}
            {canWrite && ['issued', 'partly_paid'].includes(d.status) && razorpay && (
              <button className="button outlined small" disabled={busy === 'link'}
                onClick={() => run('link', () => api.post(`/billing/invoices/${d.id}/payment-link`), (r) => r.data.message).then((ok) => ok && refresh())}
                data-testid="pay-link">
                <Link2 size={14} /> Send online payment link
              </button>
            )}
            {canWrite && d.status === 'draft' && (
              <>
                <button className="button primary small" onClick={() => run('issue', () => api.post(`/billing/invoices/${d.id}/issue`), 'Invoice issued and emailed.').then((ok) => ok && refresh())}>
                  Issue
                </button>
                <button className="text-button danger" onClick={() => run('del', () => api.delete(`/billing/invoices/${d.id}`), (r) => r.data.message).then((ok) => ok && (onChanged(), onClose()))}>
                  Delete draft
                </button>
              </>
            )}
            <span className="spacer" />
            {canWrite && d.status === 'issued' && !voiding && (
              <button className="text-button danger" onClick={() => setVoiding(true)}>
                Void
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
};

// ---------- price list and packages ----------
const Catalog = ({ canWrite, children, onSold }) => {
  const cat = useLoad('/billing/catalog');
  const [fee, setFee] = useState(null),
    [plan, setPlan] = useState(null),
    [sell, setSell] = useState({ child_id: '', plan_id: '', start_date: istDate() }),
    { busy, run } = useAction();
  if (!cat.data) return <div className="loading-screen">Loading…</div>;
  const saveFee = async (e) => {
    e.preventDefault();
    const body = { name: fee.name, service: fee.service, unit: fee.unit, amount_paise: toPaise(fee.amount), active: fee.active };
    if (await run('fee', () => (fee.id ? api.patch(`/billing/fees/${fee.id}`, body) : api.post('/billing/fees', body)), 'Price saved.')) {
      setFee(null);
      cat.reload();
    }
  };
  const savePlan = async (e) => {
    e.preventDefault();
    const body = { name: plan.name, service: plan.service, sessions: Number(plan.sessions), amount_paise: toPaise(plan.amount), validity_days: Number(plan.validity_days), active: plan.active };
    if (await run('plan', () => (plan.id ? api.patch(`/billing/plans/${plan.id}`, body) : api.post('/billing/plans', body)), 'Package saved.')) {
      setPlan(null);
      cat.reload();
    }
  };
  return (
    <>
      <section className="tm-card">
        <div className="tm-row" style={{ justifyContent: 'space-between' }}>
          <h3>Price list</h3>
          {canWrite && (
            <button className="button outlined small" onClick={() => setFee({ name: '', service: '', unit: 'session', amount: '', active: true })} data-testid="fee-add">
              <Plus size={14} /> Add price
            </button>
          )}
        </div>
        <p className="ops-muted">A session price is used automatically when attended sessions are invoiced.</p>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>For</th>
                <th className="num">Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cat.data.fees.map((f) => (
                <tr key={f.id} style={{ opacity: f.active ? 1 : 0.5 }}>
                  <td>{f.name}</td>
                  <td>{f.unit === 'session' ? `Each ${f.service || 'session'}` : f.unit === 'assessment' ? 'Assessment' : 'Item'}</td>
                  <td className="num">{rupees(f.amount_paise)}</td>
                  <td className="num">
                    {canWrite && (
                      <button className="text-button" onClick={() => setFee({ ...f, amount: fromPaise(f.amount_paise) })}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!cat.data.fees.length && (
                <tr>
                  <td colSpan={4} className="ops-muted">
                    No prices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="tm-card">
        <div className="tm-row" style={{ justifyContent: 'space-between' }}>
          <h3>Session packages</h3>
          {canWrite && (
            <button className="button outlined small" onClick={() => setPlan({ name: '', service: cat.data.services[0], sessions: 8, amount: '', validity_days: 60, active: true })} data-testid="plan-add">
              <Plus size={14} /> Add package
            </button>
          )}
        </div>
        <p className="ops-muted">Each attended session uses one session from the child’s package for that therapy, oldest package first.</p>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Therapy</th>
                <th className="num">Sessions</th>
                <th className="num">Valid</th>
                <th className="num">Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cat.data.plans.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td>{p.name}</td>
                  <td>{p.service}</td>
                  <td className="num">{p.sessions}</td>
                  <td className="num">{p.validity_days} days</td>
                  <td className="num">{rupees(p.amount_paise)}</td>
                  <td className="num">
                    {canWrite && (
                      <button className="text-button" onClick={() => setPlan({ ...p, amount: fromPaise(p.amount_paise) })}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!cat.data.plans.length && (
                <tr>
                  <td colSpan={6} className="ops-muted">
                    No packages yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canWrite && cat.data.plans.some((p) => p.active) && (
          <form className="tm-form" style={{ marginTop: 14 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run('sell', () => api.post('/billing/packages', { ...sell, issue: true, notify: true }), (res) => `Package sold. Invoice ${res.data.number} sent to the family.`);
              if (r) onSold(r.data);
            }}>
            <h4>Sell a package to a child</h4>
            <div className="tm-grid-3">
              <Field id="sell-child" label="Child">
                <select id="sell-child" value={sell.child_id} required onChange={(e) => setSell({ ...sell, child_id: e.target.value })}>
                  <option value="">Choose…</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="sell-plan" label="Package">
                <select id="sell-plan" value={sell.plan_id} required onChange={(e) => setSell({ ...sell, plan_id: e.target.value })}>
                  <option value="">Choose…</option>
                  {cat.data.plans.filter((p) => p.active).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {rupees(p.amount_paise)}
                    </option>
                  ))}
                </select>
              </Field>
              <TextField id="sell-start" label="Starts" type="date" value={sell.start_date} onChange={(v) => setSell({ ...sell, start_date: v })} />
            </div>
            <button className="button primary small" disabled={busy === 'sell'} data-testid="sell-package">
              Sell and invoice
            </button>
          </form>
        )}
      </section>
      <Modal open={!!fee} onClose={() => setFee(null)} title={fee?.id ? 'Edit price' : 'Add a price'}>
        {fee && (
          <form className="tm-form" onSubmit={saveFee}>
            <TextField id="fee-name" label="Name on the invoice" value={fee.name} onChange={(v) => setFee({ ...fee, name: v })} required minLength={2} />
            <div className="tm-grid-2">
              <Field id="fee-unit" label="Type">
                <select id="fee-unit" value={fee.unit} onChange={(e) => setFee({ ...fee, unit: e.target.value })}>
                  <option value="session">Price per session</option>
                  <option value="assessment">Assessment</option>
                  <option value="item">Other item</option>
                </select>
              </Field>
              {fee.unit === 'session' && (
                <Field id="fee-service" label="Therapy">
                  <select id="fee-service" value={fee.service} required onChange={(e) => setFee({ ...fee, service: e.target.value })}>
                    <option value="">Choose…</option>
                    {cat.data.services.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <TextField id="fee-amount" label="Price (₹)" inputMode="decimal" value={fee.amount} onChange={(v) => setFee({ ...fee, amount: v })} required />
            <Check id="fee-active" checked={fee.active} onChange={(v) => setFee({ ...fee, active: v })}>
              In use
            </Check>
            <button className="button primary" disabled={busy === 'fee'} data-testid="fee-save">
              Save
            </button>
          </form>
        )}
      </Modal>
      <Modal open={!!plan} onClose={() => setPlan(null)} title={plan?.id ? 'Edit package' : 'Add a package'}>
        {plan && (
          <form className="tm-form" onSubmit={savePlan}>
            <TextField id="plan-name" label="Name" value={plan.name} onChange={(v) => setPlan({ ...plan, name: v })} required minLength={2} placeholder="e.g. Speech therapy · 12 sessions" />
            <div className="tm-grid-2">
              <Field id="plan-service" label="Therapy">
                <select id="plan-service" value={plan.service} onChange={(e) => setPlan({ ...plan, service: e.target.value })}>
                  {cat.data.services.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <TextField id="plan-sessions" label="Sessions" type="number" min="1" max="200" value={plan.sessions} onChange={(v) => setPlan({ ...plan, sessions: v })} required />
              <TextField id="plan-amount" label="Price (₹)" inputMode="decimal" value={plan.amount} onChange={(v) => setPlan({ ...plan, amount: v })} required />
              <TextField id="plan-validity" label="Valid for (days)" type="number" min="7" max="730" value={plan.validity_days} onChange={(v) => setPlan({ ...plan, validity_days: v })} required />
            </div>
            <Check id="plan-active" checked={plan.active} onChange={(v) => setPlan({ ...plan, active: v })}>
              On sale
            </Check>
            <button className="button primary" disabled={busy === 'plan'} data-testid="plan-save">
              Save
            </button>
          </form>
        )}
      </Modal>
    </>
  );
};

// ---------- settings ----------
const BillingSettings = ({ canWrite }) => {
  const s = useLoad('/billing/settings');
  const [f, setF] = useState(null),
    [rp, setRp] = useState(null),
    { busy, run } = useAction();
  useEffect(() => {
    if (s.data) {
      setF(s.data.settings);
      setRp({ enabled: s.data.razorpay.enabled, key_id: s.data.razorpay.key_id, key_secret: '', webhook_secret: '' });
    }
  }, [s.data]);
  if (!f || !rp) return <div className="loading-screen">Loading…</div>;
  return (
    <>
      <form className="tm-card tm-form" onSubmit={(e) => (e.preventDefault(), run('s', () => api.patch('/billing/settings', f), 'Invoice settings saved.').then((ok) => ok && s.reload()))}>
        <h3>Invoices</h3>
        <div className="tm-grid-3">
          <TextField id="bill-prefix" label="Invoice number prefix" value={f.invoice_prefix} onChange={(v) => setF({ ...f, invoice_prefix: v })} hint="Numbers look like MNC/2026-27/0001 and restart each April." />
          <TextField id="bill-legal" label="Name on invoices" value={f.legal_name} onChange={(v) => setF({ ...f, legal_name: v })} placeholder="Moonlight Neurocare" />
          <TextField id="bill-gstin" label="GSTIN (if registered)" value={f.gstin} onChange={(v) => setF({ ...f, gstin: v })} />
          <TextField id="bill-tax" label="Default tax %" type="number" min="0" max="28" step="0.5" value={f.tax_percent} onChange={(v) => setF({ ...f, tax_percent: Number(v) })} hint="Many therapy services are GST-exempt: check with your accountant." />
          <TextField id="bill-terms" label="Pay within (days)" type="number" min="0" max="120" value={f.payment_terms_days} onChange={(v) => setF({ ...f, payment_terms_days: Number(v) })} />
          <TextField id="bill-upi" label="UPI ID shown on invoices" value={f.upi_id} onChange={(v) => setF({ ...f, upi_id: v })} placeholder="moonlight@okicici" />
        </div>
        <TextField id="bill-bank" label="Bank details shown on invoices" area value={f.bank_details} onChange={(v) => setF({ ...f, bank_details: v })} />
        <TextField id="bill-footer" label="Footer note" value={f.footer_note} onChange={(v) => setF({ ...f, footer_note: v })} placeholder="Thank you for trusting us with your child’s care." />
        <Check id="bill-noshow" checked={f.charge_no_show} onChange={(v) => setF({ ...f, charge_no_show: v })}>
          Charge for sessions marked Absent (no-shows)
        </Check>
        {canWrite && (
          <button className="button primary" disabled={busy === 's'} data-testid="bill-settings-save">
            Save
          </button>
        )}
      </form>
      <form className="tm-card tm-form" onSubmit={(e) => (e.preventDefault(), run('rp', () => api.patch('/billing/razorpay', rp), 'Razorpay settings saved.').then((ok) => ok && s.reload()))}>
        <h3>Online payments (Razorpay)</h3>
        <p className="ops-muted">
          Families get a secure Razorpay link (UPI, cards, net banking) from the invoice email or the app. Keys: Razorpay Dashboard → Account &amp; Settings → API Keys. Use test keys (rzp_test_…) first.
        </p>
        <Check id="rp-enabled" checked={rp.enabled} onChange={(v) => setRp({ ...rp, enabled: v })}>
          Accept online payments
        </Check>
        <div className="tm-grid-3">
          <TextField id="rp-key" label="Key ID" value={rp.key_id} onChange={(v) => setRp({ ...rp, key_id: v })} placeholder="rzp_live_…" />
          <TextField id="rp-secret" label="Key Secret" type="password" value={rp.key_secret} onChange={(v) => setRp({ ...rp, key_secret: v })} placeholder={s.data.razorpay.secret_set ? 'Saved · leave blank to keep' : ''} />
          <TextField id="rp-webhook" label="Webhook secret" type="password" value={rp.webhook_secret} onChange={(v) => setRp({ ...rp, webhook_secret: v })} placeholder={s.data.razorpay.webhook_secret_set ? 'Saved · leave blank to keep' : 'Optional'} />
        </div>
        <small className="tm-hint">
          Webhook URL for Razorpay (event: payment_link.paid): <code>{s.data.razorpay.webhook_url}</code>. Without it, payments still update when the family returns from Razorpay or when you press “Check payment”.
        </small>
        {canWrite && (
          <div className="tm-row">
            <button className="button primary" disabled={busy === 'rp'} data-testid="rp-save">
              Save
            </button>
            <button type="button" className="button outlined" disabled={busy === 't'} onClick={() => run('t', () => api.post('/billing/razorpay/test'), (r) => r.data.message)}>
              Test connection
            </button>
          </div>
        )}
      </form>
    </>
  );
};

// ---------- page ----------
export const Billing = () => {
  const { user } = useWorkspace();
  const access = opsAccess(user);
  const canWrite = access.billing;
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('overview'),
    [status, setStatus] = useState(''),
    [q, setQ] = useState(''),
    [composer, setComposer] = useState(null),
    [openId, setOpenId] = useState(null);
  const childParam = params.get('child') || '';
  const overview = useLoad('/billing/overview');
  const invoices = useLoad('/billing/invoices', { status, q, child_id: childParam });
  const kids = useLoad('/admin/children', { status: 'active' });
  const children = kids.data?.items || [];
  const reload = () => (overview.reload(), invoices.reload());
  const o = overview.data;
  const childName = children.find((c) => c.id === childParam)?.name;
  return (
    <>
      <PortalHeading
        eyebrow="FEES & PAYMENTS"
        title="Billing"
        subtitle="Invoices, packages and payments, in rupees, with numbering that restarts each financial year."
        action={canWrite && (
          <button className="button primary" onClick={() => setComposer({ child: childParam })} data-testid="invoice-new">
            <FilePlus2 size={17} /> New invoice
          </button>
        )}
      />
      {childParam && (
        <p>
          <button className="text-button" onClick={() => setParams({})}>
            <ArrowLeft size={14} /> All children
          </button>{' '}
          Showing invoices for <strong>{childName || 'this child'}</strong>
        </p>
      )}
      <Tabs tabs={[['overview', 'Overview'], ['invoices', 'Invoices'], ['catalog', 'Packages & prices'], ['settings', 'Settings']]} value={childParam ? 'invoices' : tab} onChange={(t) => (setParams({}), setTab(t))} testid="billing-tab" />
      {(childParam ? 'invoices' : tab) === 'overview' && o && (
        <>
          <div className="ops-stats">
            <Stat label={`Collected in ${o.month}`} value={rupees(o.collected_month_paise)} tone="sage" testid="stat-collected" />
            <Stat label="Outstanding" value={rupees(o.outstanding_paise)} note={o.overdue_count ? `${o.overdue_count} overdue` : 'Nothing overdue'} tone="peach" testid="stat-outstanding" />
            <Stat label="Attended, not invoiced" value={o.unbilled.reduce((t, x) => t + x.sessions, 0)} note={rupees(o.unbilled.reduce((t, x) => t + x.amount_paise, 0)) + ' at list prices'} tone="yellow" />
            <Stat label="Packages to renew" value={new Set([...o.low_packages, ...o.expiring_packages].map((p) => p.id)).size} note="2 or fewer sessions left, or ending in 14 days" tone="lavender" />
          </div>
          {!o.razorpay_ready && <p className="gentle-note-inline ops-muted">Online payments are off. Families pay at the desk (cash, UPI, bank). Switch on Razorpay in Settings.</p>}
          <div className="kid-grid">
            <section className="tm-card">
              <h3>Ready to invoice</h3>
              {o.unbilled.length ? (
                o.unbilled.map((u) => (
                  <div className="kid-person" key={u.child_id}>
                    <div>
                      <strong>{u.child_name}</strong>
                      <small>
                        {u.sessions} attended session{u.sessions === 1 ? '' : 's'} · {rupees(u.amount_paise)}
                      </small>
                    </div>
                    {canWrite && (
                      <button className="button outlined small" onClick={() => setComposer({ child: u.child_id })} data-testid={`invoice-for-${u.child_id}`}>
                        Invoice
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="ops-muted">Nothing waiting. Sessions appear here once attendance is marked Present.</p>
              )}
            </section>
            <section className="tm-card">
              <h3>Recent payments</h3>
              {o.recent_payments.length ? (
                o.recent_payments.map((p) => (
                  <button className="kid-person text-left" key={p.id} style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)' }} onClick={() => setOpenId(p.invoice_id)}>
                    <div>
                      <strong>
                        {rupees(p.amount_paise)} · {p.child_name}
                      </strong>
                      <small>
                        {p.received_on} · {p.method_label} · {p.invoice_number}
                      </small>
                    </div>
                  </button>
                ))
              ) : (
                <p className="ops-muted">No payments this month yet.</p>
              )}
              {(o.low_packages.length > 0 || o.expiring_packages.length > 0) && <h4>Packages to renew</h4>}
              {[...new Map([...o.low_packages, ...o.expiring_packages].map((p) => [p.id, p])).values()].map((p) => (
                <p key={p.id}>
                  {p.child_name}: {p.name} · {p.sessions_total - p.sessions_used} left · ends {p.expires_on}
                </p>
              ))}
            </section>
          </div>
        </>
      )}
      {(childParam ? 'invoices' : tab) === 'invoices' && (
        <>
          <div className="ops-toolbar">
            <div className="search-field">
              <Search size={18} />
              <input aria-label="Search invoices" placeholder="Invoice number, child or parent…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="invoice-search" />
            </div>
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="invoice-status">
              <option value="">All</option>
              <option value="open">Due</option>
              <option value="paid">Paid</option>
              <option value="draft">Drafts</option>
              <option value="void">Void</option>
            </select>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Child</th>
                  <th className="num">Total</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(invoices.data?.items || []).map((i) => (
                  <tr key={i.id} className="clickable" onClick={() => setOpenId(i.id)} data-testid={`invoice-row-${i.id}`}>
                    <td>{i.number || 'Draft'}</td>
                    <td>{i.issue_date ? dateLabel(i.issue_date) : '—'}</td>
                    <td>{i.child_name}</td>
                    <td className="num">{rupees(i.total_paise)}</td>
                    <td className="num">{rupees(i.balance_paise)}</td>
                    <td>
                      <span className={`status ${INVOICE_TONE[i.status]}`}>{INVOICE_LABEL[i.status]}</span>
                    </td>
                  </tr>
                ))}
                {invoices.data && !invoices.data.items.length && (
                  <tr>
                    <td colSpan={6} className="ops-muted">
                      No invoices here yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!childParam && tab === 'catalog' && <Catalog canWrite={canWrite} children={children} onSold={(inv) => (reload(), setOpenId(inv.id))} />}
      {!childParam && tab === 'settings' && <BillingSettings canWrite={canWrite} />}
      <Composer open={!!composer} onClose={() => setComposer(null)} childId={composer?.child} children={children}
        onDone={(inv) => (setComposer(null), reload(), setOpenId(inv.id))} />
      {openId && <InvoiceDialog id={openId} onClose={() => setOpenId(null)} onChanged={reload} canWrite={canWrite} razorpay={o?.razorpay_ready} />}
    </>
  );
};

export default Billing;
