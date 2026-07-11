import { json } from '@sveltejs/kit';
import { getStripe, PLATFORM_METADATA } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

/** SDK calls this once per end user to bind card + set spending cap */
export const POST: RequestHandler = async ({ request, platform }) => {
  const d1 = platform!.env.DB;
  const { appId, apiKey, endUserId, returnUrl } = await request.json();

  // Verify app
  const app = await d1.prepare(
    `SELECT id, stripe_connect_account_id FROM apps WHERE id = ? AND api_key = ?`
  ).bind(appId, apiKey).first<any>();
  if (!app) return json({ error: 'invalid app' }, { status: 401 });

  // Find or create end user
  let eu = await d1.prepare(
    `SELECT id, stripe_customer_id FROM end_users WHERE app_id = ? AND external_id = ?`
  ).bind(appId, endUserId).first<any>();

  const stripe = getStripe();

  if (!eu?.stripe_customer_id) {
    const customer = await stripe.customers.create({
      metadata: { ...PLATFORM_METADATA, appId, endUserId },
    });

    if (eu) {
      await d1.prepare(`UPDATE end_users SET stripe_customer_id = ? WHERE id = ?`)
        .bind(customer.id, eu.id).run();
    } else {
      const id = crypto.randomUUID();
      await d1.prepare(
        `INSERT INTO end_users (id, app_id, external_id, stripe_customer_id, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, appId, endUserId, customer.id, new Date().toISOString()).run();
      eu = { id, stripe_customer_id: customer.id };
    }

    // Create a SetupIntent for card binding
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
      metadata: { ...PLATFORM_METADATA, appId, endUserId },
    });

    return json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  }

  // Already has customer, return setup intent for new card
  const setupIntent = await stripe.setupIntents.create({
    customer: eu.stripe_customer_id,
    payment_method_types: ['card'],
    metadata: { ...PLATFORM_METADATA, appId, endUserId },
  });

  return json({
    clientSecret: setupIntent.client_secret,
    customerId: eu.stripe_customer_id,
  });
};
