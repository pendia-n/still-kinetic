import { json } from '@sveltejs/kit';
import { verifyToken, getAuthTokenFromRequest } from '$lib/server/auth';
import { getStripe } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

async function authorizedApp(request: Request, platform: App.Platform, appId: string) {
  const token = getAuthTokenFromRequest(request);
  if (!token) return { error: json({ error: 'unauthorized' }, { status: 401 }) };

  const user = await verifyToken(token, platform);
  if (!user) return { error: json({ error: 'unauthorized' }, { status: 401 }) };

  const app = await platform.env.DB.prepare(
    `SELECT id, owner_id, stripe_subscription_id FROM apps WHERE id = ?`
  ).bind(appId).first<any>();
  if (!app) return { error: json({ error: 'not found' }, { status: 404 }) };
  if (user.role !== 'manager' && app.owner_id !== user.userId) {
    return { error: json({ error: 'forbidden' }, { status: 403 }) };
  }

  return { app };
}

export const GET: RequestHandler = async ({ request, platform, url }) => {
  const appId = url.searchParams.get('appId');
  if (!appId) return json({ error: 'appId is required' }, { status: 400 });

  const result = await authorizedApp(request, platform!, appId);
  if ('error' in result) return result.error;
  if (!result.app.stripe_subscription_id) {
    return json({ subscription: null });
  }

  try {
    const subscription = await getStripe(platform!.env).subscriptions.retrieve(result.app.stripe_subscription_id);
    return json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        currentPeriodEnd: subscription.current_period_end ? subscription.current_period_end * 1000 : null,
      },
    });
  } catch (err: any) {
    console.error('Subscription lookup error:', err?.message || err);
    return json({ error: 'could not retrieve subscription from Stripe' }, { status: 502 });
  }
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const { appId, cancelAtPeriodEnd } = await request.json();
  if (!appId || typeof cancelAtPeriodEnd !== 'boolean') {
    return json({ error: 'appId and cancelAtPeriodEnd are required' }, { status: 400 });
  }

  const result = await authorizedApp(request, platform!, appId);
  if ('error' in result) return result.error;
  if (!result.app.stripe_subscription_id) {
    return json({ error: 'no Stripe subscription found' }, { status: 400 });
  }

  try {
    const subscription = await getStripe(platform!.env).subscriptions.update(
      result.app.stripe_subscription_id,
      { cancel_at_period_end: cancelAtPeriodEnd },
    );
    return json({
      ok: true,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd: subscription.current_period_end ? subscription.current_period_end * 1000 : null,
    });
  } catch (err: any) {
    console.error('Subscription update error:', err?.message || err);
    return json({ error: err?.message || 'could not update subscription' }, { status: 502 });
  }
};
