import { json } from '@sveltejs/kit';
import { getStripe, PLATFORM_METADATA } from '$lib/server/stripe';
import { TIER_CONFIG, serializeAllowedMetrics, ALL_METRICS, parseAllowedMetrics } from '$lib/server/metrics';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const stripe = getStripe();
  const sig = request.headers.get('stripe-signature');
  const raw = await request.text();

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(raw, sig!, platform!.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  const d1 = platform!.env.DB;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription') break;

      const appId = session.metadata?.app_id;
      const subscriptionId = session.subscription;
      const customerId = session.customer;
      const tier = session.metadata?.tier;

      if (!appId || !subscriptionId) break;

      // Preserve existing enabled_types when upgrading via subscription
      const existing = await d1.prepare(
        `SELECT tier, allowed_metrics FROM apps WHERE id = ?`
      ).bind(appId).first<any>();

      let metrics: string[];
      if (tier === 'full') {
        metrics = [...ALL_METRICS];
      } else if (tier === 'basic' && existing?.allowed_metrics) {
        // Keep whatever the dev already selected (they may have changed it in dashboard)
        const current = parseAllowedMetrics(existing.allowed_metrics);
        if (current.length > 0 && current.length <= TIER_CONFIG.basic.maxMetrics) {
          metrics = current;
        } else {
          metrics = ALL_METRICS.slice(0, TIER_CONFIG.basic.maxMetrics);
        }
      } else {
        metrics = ALL_METRICS.slice(0, TIER_CONFIG.basic.maxMetrics);
      }

      await d1.prepare(
        `UPDATE apps SET
           stripe_subscription_id = ?,
           stripe_customer_id = ?,
           subscription_status = 'active',
           tier = ?,
           allowed_metrics = ?
         WHERE id = ?`
      ).bind(subscriptionId, customerId, tier || 'basic', serializeAllowedMetrics(metrics as any), appId).run();
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : 'inactive';

      await d1.prepare(
        `UPDATE apps SET subscription_status = ? WHERE stripe_subscription_id = ?`
      ).bind(status, sub.id).run();
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subId = invoice.subscription;
      if (subId) {
        await d1.prepare(
          `UPDATE apps SET subscription_status = 'past_due' WHERE stripe_subscription_id = ?`
        ).bind(subId).run();
      }
      break;
    }

    case 'invoice.paid': {
      const paidInvoice = event.data.object;
      const paidSubId = paidInvoice.subscription;
      if (paidSubId) {
        await d1.prepare(
          `UPDATE apps SET subscription_status = 'active' WHERE stripe_subscription_id = ?`
        ).bind(paidSubId).run();
      }
      break;
    }

    case 'account.updated': {
      const account = event.data.object;
      if (account.charges_enabled) {
        await d1.prepare(
          `UPDATE apps SET connect_onboarded = 1 WHERE stripe_connect_account_id = ?`
        ).bind(account.id).run();
      }
      break;
    }
  }

  return json({ received: true });
};
