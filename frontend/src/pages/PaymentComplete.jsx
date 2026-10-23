import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { useSeo } from '../lib/useSeo';

// Razorpay sends the payer's browser here after paying (outside the app, it opens in the phone's browser).
export default function PaymentComplete() {
  const [params] = useSearchParams();
  const paid = params.get('status') === 'paid';
  useSeo({ title: 'Payment | Moonlight Neurocare', description: 'Payment status.', robots: 'noindex, nofollow' });
  return (
    <div className="container success-page" data-testid="payment-complete">
      {paid ? <CheckCircle2 size={54} /> : <Clock size={54} />}
      <span className="eyebrow">{paid ? 'PAYMENT RECEIVED' : 'PAYMENT IN PROGRESS'}</span>
      <h1>{paid ? 'Thank you. Your payment is recorded.' : 'We’re confirming your payment.'}</h1>
      <p>
        {paid
          ? 'A receipt is in the Payments section of the parent portal and the Moonlight app. You can close this page.'
          : 'If money left your account, it will show as paid within a few minutes. You can close this page and check Payments in the app.'}
      </p>
      <div className="action-row">
        <Link className="button primary" to="/portal/parent/payments">
          Open Payments
        </Link>
      </div>
    </div>
  );
}
