import { json } from '@sveltejs/kit';
import { verifyToken, getAuthTokenFromRequest } from '$lib/server/auth';
import { getStripe, PLATFORM_METADATA } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

/**
 * POST /api/stripe/subscription
 * Body: { appId }
 * Returns: { url } — Stripe Checkout Session URL
 *
 * Requires secrets:
 *   STRIPE_PRICE_BASIC — price ID for $2/week basic tier
 *   STRIPE_PRICE_FULL  — price ID for $10/week full tier
 *   STRIPE_SECRET_KEY  — Stripe secret key
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  try {
    const token = getAuthTokenFromRequest(request);
    if (!token) return json({ error: 'unauthorized' }, { status: 401 });
    const user = await verifyToken(token, platform);
    if (!user) return json({ error: 'unauthorized' }, { status: 401 });

    const d1 = platform!.env.DB;
    const { appId } = await request.json();

    const app = await d1.prepare(
      `SELECT id, name, tier, subscription_status, stripe_customer_id FROM apps WHERE id = ? AND owner_id = ?`
    ).bind(appId, user.userId).first<any>();
    if (!app) return json({ error: 'not found' }, { status: 404 });

    // Read price ID from platform env (not process.env — secrets not in process.env)
    const env = platform!.env as any;
    const priceId = app.tier === 'full' ? env.STRIPE_PRICE_FULL : env.STRIPE_PRICE_BASIC;
    if (!priceId) {
      return json({ error: `Missing STRIPE_PRICE_${app.tier.toUpperCase()} secret` }, { status: 500 });
    }

    const stripe = getStripe(env);

    // Find or create Stripe customer for this developer
    let customerId = app.stripe_customer_id;
    if (!customerId) {
      const userRow = await d1.prepare(
        `SELECT email FROM users WHERE id = ?`
      ).bind(user.userId).first<any>();
      const customer = await stripe.customers.create({
        email: userRow?.email,
        metadata: { ...PLATFORM_METADATA, user_id: user.userId },
      });
      customerId = customer.id;
      await d1.prepare(
        `UPDATE apps SET stripe_customer_id = ? WHERE id = ?`
      ).bind(customerId, appId).run();
    }

    // Create checkout session with pre-created price ID
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { ...PLATFORM_METADATA, app_id: appId, tier: app.tier },
      subscription_data: {
        metadata: { ...PLATFORM_METADATA, app_id: appId, tier: app.tier },
      },
      success_url: `${platform!.env.APP_URL}/dashboard/admin/app/${appId}?subscribed=1`,
      cancel_url: `${platform!.env.APP_URL}/dashboard/admin/app/${appId}`,
    });

    return json({ url: session.url! });
  } catch (err: any) {
    console.error('Subscription error:', err?.message || err?.toString() || err);
    return json({ error: err?.message || err?.toString() || 'Unknown error' }, { status: 500 });
  }
};
