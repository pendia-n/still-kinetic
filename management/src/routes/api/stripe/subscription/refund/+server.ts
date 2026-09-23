import { json } from '@sveltejs/kit';
import { verifyToken, getAuthTokenFromRequest } from '$lib/server/auth';
import { getStripe } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

const REFUND_WINDOW_MS = 72 * 60 * 60 * 1000;
const REFUND_PERCENT = 90;

async function authorize(request: Request, platform: App.Platform, appId: string) {
  const token = getAuthTokenFromRequest(request);
  if (!token) return { response: json({ error: 'unauthorized' }, { status: 401 }) };
  const user = await verifyToken(token, platform);
  if (!user) return { response: json({ error: 'unauthorized' }, { status: 401 }) };

  const app = await platform.env.DB.prepare(
    `SELECT id, owner_id, stripe_customer_id, stripe_subscription_id FROM apps WHERE id = ?`,
  ).bind(appId).first<any>();
  if (!app) return { response: json({ error: 'not found' }, { status: 404 }) };
  if (user.role !== 'manager' && app.owner_id !== user.userId) {
    return { response: json({ error: 'forbidden' }, { status: 403 }) };
  }
  if (!app.stripe_subscription_id || !app.stripe_customer_id) {
    return { response: json({ error: 'no Stripe subscription or customer found' }, { status: 400 }) };
  }
  return { user, app };
}

function isInvoiceForSubscription(invoice: any, subscriptionId: string): boolean {
  const direct = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id;
  const parent = invoice.parent?.subscription_details?.subscription;
  const parentId = typeof parent === 'string' ? parent : parent?.id;
  return direct === subscriptionId || parentId === subscriptionId;
}

function refundStatus(status: string | null | undefined): string {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'canceled') return status;
  return 'pending';
}

function getPaymentIntentId(payment: any): string | null {
  const value = payment?.payment?.payment_intent;
  return typeof value === 'string' ? value : value?.id ?? null;
}

export const GET: RequestHandler = async ({ request, platform, url }) => {
  const appId = url.searchParams.get('appId');
  if (!appId) return json({ error: 'appId is required' }, { status: 400 });
  const auth = await authorize(request, platform!, appId);
  if ('response' in auth) return auth.response;

  try {
    const stripe = getStripe(platform!.env);
    const invoicesResponse = await stripe.invoices.list({
      subscription: auth.app.stripe_subscription_id,
      status: 'paid',
      limit: 12,
    });
    const invoices = await Promise.all((invoicesResponse.data ?? []).map(async (invoice: any) => {
      const [paymentResponse, saved] = await Promise.all([
        stripe.invoicePayments.list(invoice.id),
        platform!.env.DB.prepare(
          `SELECT status, refund_amount_cents, stripe_refund_id, stripe_credit_note_id, requested_at
           FROM subscription_refunds WHERE stripe_invoice_id = ?`,
        ).bind(invoice.id).first<any>(),
      ]);

      const payments = (paymentResponse.data ?? []).filter((payment: any) =>
        payment.status === 'paid' && payment.payment?.type === 'payment_intent' && payment.payment?.payment_intent,
      );
      const paidAt = payments.reduce((latest: number, payment: any) =>
        Math.max(latest, Number(payment.status_transitions?.paid_at ?? 0)), 0,
      );
      const singlePaymentIntent = payments.length === 1 ? getPaymentIntentId(payments[0]) : null;
      const paidAmount = Number(invoice.amount_paid ?? 0);
      const paymentAmount = payments.length === 1 ? Number(payments[0].amount_paid ?? 0) : 0;
      const ageMs = Date.now() - paidAt * 1000;
      let alreadyRefunded = false;
      if (singlePaymentIntent && !saved) {
        const existingRefunds = await stripe.refunds.list(singlePaymentIntent);
        alreadyRefunded = (existingRefunds.data ?? []).some((refund: any) => refund.status !== 'canceled');
      }
      const withinWindow = paidAt > 0 && ageMs >= 0 && ageMs <= REFUND_WINDOW_MS;
      const existingRequestOpen = saved && ['processing', 'pending', 'succeeded'].includes(saved.status);

      return {
        invoiceId: invoice.id,
        paidAt: paidAt ? paidAt * 1000 : null,
        amountPaidCents: paidAmount,
        currency: String(invoice.currency ?? 'usd').toUpperCase(),
        refundAmountCents: Math.floor(paidAmount * REFUND_PERCENT / 100),
        refundable: invoice.status === 'paid' && paidAmount > 0 && paymentAmount === paidAmount && Boolean(singlePaymentIntent)
          && withinWindow && !alreadyRefunded && !existingRequestOpen,
        refundStatus: saved?.status ?? (alreadyRefunded ? 'refunded_outside_dashboard' : null),
        requestedRefundCents: saved?.refund_amount_cents ?? null,
        stripeRefundId: saved?.stripe_refund_id ?? null,
        stripeCreditNoteId: saved?.stripe_credit_note_id ?? null,
      };
    }));
    return json({ invoices, refundWindowHours: 72, refundPercent: REFUND_PERCENT });
  } catch (err: any) {
    console.error('Subscription invoice lookup error:', err?.message || err);
    return json({ error: 'could not retrieve subscription payments from Stripe' }, { status: 502 });
  }
};

export const POST: RequestHandler = async ({ request, platform }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { appId, invoiceId } = body ?? {};
  if (typeof appId !== 'string' || typeof invoiceId !== 'string' || !invoiceId.startsWith('in_')) {
    return json({ error: 'appId and a valid invoiceId are required' }, { status: 400 });
  }

  const auth = await authorize(request, platform!, appId);
  if ('response' in auth) return auth.response;
  const db = platform!.env.DB;
  const stripe = getStripe(platform!.env);
  const now = Date.now();

  try {
    const [invoice, subscription] = await Promise.all([
      stripe.invoices.retrieve(invoiceId),
      stripe.subscriptions.retrieve(auth.app.stripe_subscription_id),
    ]);
    const invoiceCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!isInvoiceForSubscription(invoice, auth.app.stripe_subscription_id)
      || invoiceCustomerId !== auth.app.stripe_customer_id) {
      return json({ error: 'invoice does not belong to this app subscription' }, { status: 404 });
    }
    if (invoice.status !== 'paid' || Number(invoice.amount_paid) <= 0) {
      return json({ error: 'only successfully paid invoices can be refunded' }, { status: 409 });
    }

    const paymentResponse = await stripe.invoicePayments.list(invoice.id);
    const payments = (paymentResponse.data ?? []).filter((payment: any) =>
      payment.status === 'paid' && payment.payment?.type === 'payment_intent' && payment.payment?.payment_intent,
    );
    if (payments.length !== 1) {
      return json({ error: 'this invoice does not have exactly one Stripe card payment and cannot be automatically refunded' }, { status: 409 });
    }
    const payment = payments[0];
    const paymentIntentId = getPaymentIntentId(payment);
    if (!paymentIntentId || Number(payment.amount_paid ?? 0) !== Number(invoice.amount_paid)) {
      return json({ error: 'invoice amount does not match one refundable Stripe payment' }, { status: 409 });
    }
    const paidAt = Number(payment.status_transitions?.paid_at ?? 0);
    const ageMs = now - paidAt * 1000;
    if (!paidAt || ageMs < 0 || ageMs > REFUND_WINDOW_MS) {
      return json({ error: 'the 72-hour refund request window has expired for this payment' }, { status: 409 });
    }

    const amountPaid = Number(invoice.amount_paid);
    const refundAmount = Math.floor(amountPaid * REFUND_PERCENT / 100);
    if (!Number.isSafeInteger(amountPaid) || refundAmount < 1) {
      return json({ error: 'payment amount is not eligible for an automatic partial refund' }, { status: 409 });
    }

    const existing = await db.prepare(
      `SELECT id, status, stripe_idempotency_key, stripe_credit_note_id, stripe_refund_id, refund_amount_cents
       FROM subscription_refunds WHERE stripe_invoice_id = ?`,
    ).bind(invoice.id).first<any>();
    if (existing && ['succeeded', 'pending', 'processing'].includes(existing.status)) {
      return json({ error: 'a refund request already exists for this payment', status: existing.status }, { status: 409 });
    }

    if (!existing) {
      const stripeRefunds = await stripe.refunds.list(paymentIntentId);
      if ((stripeRefunds.data ?? []).some((refund: any) => refund.status !== 'canceled')) {
        return json({ error: 'this payment already has a refund in Stripe; contact support to avoid duplicate refunds' }, { status: 409 });
      }
    }

    const ledgerId = existing?.id ?? crypto.randomUUID();
    const idempotencyKey = existing?.stripe_idempotency_key ?? `sk_refund_credit_note_${ledgerId}`;
    const timestamp = Date.now();
    if (!existing) {
      await db.prepare(
        `INSERT INTO subscription_refunds (
          id, app_id, requested_by_user_id, stripe_subscription_id, stripe_invoice_id,
          stripe_payment_intent_id, stripe_idempotency_key, amount_paid_cents,
          refund_amount_cents, currency, paid_at, status, requested_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)
        ON CONFLICT(stripe_invoice_id) DO NOTHING`,
      ).bind(
        ledgerId, auth.app.id, auth.user.userId, auth.app.stripe_subscription_id,
        invoice.id, paymentIntentId, idempotencyKey, amountPaid, refundAmount,
        String(invoice.currency ?? 'usd').toLowerCase(), paidAt, timestamp, timestamp,
      ).run();
    } else {
      await db.prepare(
        `UPDATE subscription_refunds SET status = 'processing', failure_reason = NULL, updated_at = ?
         WHERE id = ? AND status = 'failed'`,
      ).bind(timestamp, ledgerId).run();
    }

    const reservation = await db.prepare(
      `SELECT id, status, stripe_idempotency_key, stripe_credit_note_id, stripe_refund_id
       FROM subscription_refunds WHERE stripe_invoice_id = ?`,
    ).bind(invoice.id).first<any>();
    if (!reservation || reservation.id !== ledgerId) {
      return json({ error: 'a refund request is already being processed for this payment' }, { status: 409 });
    }
    if (reservation.stripe_credit_note_id && reservation.stripe_refund_id) {
      return json({ ok: true, status: reservation.status, refundAmountCents: refundAmount });
    }

    // A refund request also stops the next weekly renewal so the buyer is not
    // charged again while their refund is being processed.
    let cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    try {
      if (!cancelAtPeriodEnd) {
        const canceled = await stripe.subscriptions.update(auth.app.stripe_subscription_id, { cancel_at_period_end: true });
        cancelAtPeriodEnd = Boolean(canceled.cancel_at_period_end);
      }
    } catch (err: any) {
      await db.prepare(
        `UPDATE subscription_refunds SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`,
      ).bind('Could not schedule subscription cancellation; refund was not issued.', Date.now(), ledgerId).run();
      console.error('Subscription cancellation before refund failed:', err?.message || err);
      return json({ error: 'could not schedule cancellation, so no refund was issued' }, { status: 502 });
    }

    try {
      const creditNote = await stripe.creditNotes.create({
        invoice: invoice.id,
        amount: refundAmount,
        refund_amount: refundAmount,
        memo: '90% subscription payment refund requested within 72 hours.',
        metadata: {
          app_id: auth.app.id,
          subscription_refund_id: ledgerId,
          policy: '90_percent_within_72_hours',
        },
        idempotencyKey,
      });
      const stripeRefundId = typeof creditNote.refund === 'string'
        ? creditNote.refund
        : creditNote.refund?.id ?? null;
      let resolvedRefund = stripeRefundId ? await stripe.refunds.retrieve(stripeRefundId) : null;
      const status = refundStatus(resolvedRefund?.status);

      await db.prepare(
        `UPDATE subscription_refunds
         SET stripe_credit_note_id = ?, stripe_refund_id = ?, status = ?, failure_reason = NULL, updated_at = ?
         WHERE id = ?`,
      ).bind(creditNote.id, stripeRefundId, status, Date.now(), ledgerId).run();

      return json({
        ok: true,
        status,
        refundAmountCents: refundAmount,
        currency: String(invoice.currency ?? 'usd').toUpperCase(),
        cancellationScheduled: cancelAtPeriodEnd,
        currentPeriodEnd: subscription.current_period_end ? subscription.current_period_end * 1000 : null,
        creditNoteId: creditNote.id,
        refundId: stripeRefundId,
      });
    } catch (err: any) {
      await db.prepare(
        `UPDATE subscription_refunds SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`,
      ).bind(String(err?.message || 'Stripe could not issue the refund').slice(0, 500), Date.now(), ledgerId).run();
      console.error('Subscription refund failed:', err?.message || err);
      return json({ error: 'Stripe could not issue the refund. Renewal cancellation remains scheduled; contact support before retrying.' }, { status: 502 });
    }
  } catch (err: any) {
    console.error('Subscription refund request failed:', err?.message || err);
    return json({ error: 'could not verify this subscription payment with Stripe' }, { status: 502 });
  }
};
