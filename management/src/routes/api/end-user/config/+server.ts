import { json } from '@sveltejs/kit';
import { getStripe } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

/** SDK calls this after card binding succeeds to attach payment method + set spending cap */
export const POST: RequestHandler = async ({ request, platform }) => {
  const d1 = platform!.env.DB;
  const { appId, apiKey, endUserId, paymentMethodId, spendingCapCents, spendingCapPeriod } = await request.json();

  const app = await d1.prepare(
    `SELECT id FROM apps WHERE id = ? AND api_key = ?`
  ).bind(appId, apiKey).first<any>();
  if (!app) return json({ error: 'invalid app' }, { status: 401 });

  const stripe = getStripe(platform!.env);

  // The SetupIntent was created with this customer, so Stripe automatically
  // attached the payment method when confirmation succeeded. Set it as the
  // default for future off-session PaymentIntents and persist the user's cap.
  const eu = await d1.prepare(
    `SELECT id, stripe_customer_id FROM end_users WHERE app_id = ? AND external_id = ?`
  ).bind(appId, endUserId).first<any>();
  if (!eu?.stripe_customer_id) return json({ error: 'no customer' }, { status: 400 });

  await stripe.customers.update(eu.stripe_customer_id, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  await d1.prepare(
    `UPDATE end_users SET stripe_payment_method_id = ?, spending_cap_cents = ?, spending_cap_period = ?, period_start = ?, period_spend_cents = 0
     WHERE id = ?`
  ).bind(paymentMethodId, spendingCapCents, spendingCapPeriod || 'monthly', new Date().toISOString(), eu.id).run();

  return json({ ok: true });
};
