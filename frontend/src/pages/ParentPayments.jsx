import { useState } from 'react';
import { CheckCircle2, Download, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorText } from '../lib/api';
import { PortalHeading, EmptyState } from '../components/PortalLayout';
import { INVOICE_LABEL, INVOICE_TONE, niceDate, rupees, useLoad } from '../components/ops/opsUi';
import { pdfUrl } from './Billing';

export const ParentPayments = () => {
  const { data, error } = useLoad('/billing/my');
  const [busy, setBusy] = useState('');
  const pay = async (invoice) => {
    setBusy(invoice.id);
    try {
      const { data: res } = await api.post(`/billing/my/invoices/${invoice.id}/pay`);
      window.open(res.url, '_blank', 'noopener');
      toast.message('Razorpay opened in a new window. Come back here after paying; it can take a minute to show as paid.');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy('');
    }
  };
  if (error) return <p className="error-message">{error}</p>;
  if (!data) return <div className="loading-screen">Loading payments…</div>;
  const open = data.invoices.filter((i) => ['issued', 'partly_paid'].includes(i.status));
  const past = data.invoices.filter((i) => !['issued', 'partly_paid'].includes(i.status));
  const packages = data.packages.filter((p) => p.status === 'active');
  return (
    <>
      <PortalHeading eyebrow="FEES" title="Payments" subtitle="Invoices, receipts and session packages for your family." />
      <div className="ops-stats" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <div className={`ops-stat ${data.balance_paise ? 'peach' : 'sage'}`} data-testid="parent-balance">
          <span>To pay</span>
          <strong>{rupees(data.balance_paise)}</strong>
          <small>{data.balance_paise ? `${open.length} invoice${open.length === 1 ? '' : 's'} due` : 'All paid. Thank you!'}</small>
        </div>
        {packages.map((p) => (
          <div className="ops-stat sage" key={p.id}>
            <span>{p.name}</span>
            <strong>
              {p.sessions_left} <small style={{ display: 'inline', fontSize: 14 }}>of {p.sessions_total} sessions left</small>
            </strong>
            <div className="pkg-bar">
              <span style={{ width: `${(100 * p.sessions_left) / p.sessions_total}%` }} />
            </div>
            <small>
              {p.child_name} · valid until {niceDate(p.expires_on)}
            </small>
          </div>
        ))}
      </div>
      {open.length > 0 && (
        <section className="portal-section">
          <h2>Due now</h2>
          {open.map((i) => (
            <article className="tm-card" key={i.id} data-testid={`parent-invoice-${i.id}`}>
              <div className="tm-row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h3>
                    {rupees(i.balance_paise)} <span className={`status ${INVOICE_TONE[i.status]}`}>{INVOICE_LABEL[i.status]}</span>
                  </h3>
                  <p>
                    Invoice {i.number} · {i.child_name} · due {niceDate(i.due_date)}
                  </p>
                  <p className="ops-muted">{i.items.map((x) => x.description).join(' · ')}</p>
                </div>
                <div className="tm-row">
                  {data.online_payments && (
                    <button className="button primary" disabled={busy === i.id} onClick={() => pay(i)} data-testid={`pay-online-${i.id}`}>
                      <Wallet size={16} /> Pay online
                    </button>
                  )}
                  <a className="button outlined" href={pdfUrl(i.id)} target="_blank" rel="noreferrer">
                    <Download size={15} /> Invoice
                  </a>
                </div>
              </div>
            </article>
          ))}
          {(data.upi_id || data.bank_details) && (
            <p className="ops-muted">
              {data.online_payments ? 'Or pay at the center' : 'Pay at the center'} by cash or UPI{data.upi_id ? ` (${data.upi_id})` : ''}
              {data.bank_details ? `, or by bank transfer: ${data.bank_details}` : ''}. The center records it and your receipt arrives by email.
            </p>
          )}
        </section>
      )}
      <section className="portal-section">
        <h2>History</h2>
        {past.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <tbody>
                {past.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.number}</strong>
                      <div className="ops-muted">
                        {i.child_name} · {niceDate(i.issue_date)}
                      </div>
                    </td>
                    <td className="num">{rupees(i.total_paise)}</td>
                    <td>
                      <span className={`status ${INVOICE_TONE[i.status]}`}>{INVOICE_LABEL[i.status]}</span>
                    </td>
                    <td className="num">
                      {i.status !== 'void' && (
                        <a className="text-button" href={pdfUrl(i.id)} target="_blank" rel="noreferrer">
                          <Download size={13} /> {i.status === 'paid' ? 'Receipt' : 'PDF'}
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="No past invoices" description="Paid invoices and receipts will appear here." id="payments-empty" />
        )}
      </section>
    </>
  );
};

export default ParentPayments;
