import { json } from '@sveltejs/kit';
import { verifyToken } from '$lib/server/auth';
import { getStripe } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const user = await verifyToken((request.headers.get('authorization') || '').slice(7));
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;
  const { appId } = await request.json();

  const app = await d1.prepare(`SELECT * FROM apps WHERE id = ?`).bind(appId).first<any>();
  if (!app) return json({ error: 'not found' }, { status: 404 });
  if (app.owner_id !== user.userId) return json({ error: 'forbidden' }, { status: 403 });

  const stripe = getStripe(platform!.env);

  if (!app.stripe_connect_account_id) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: (await d1.prepare(`SELECT email FROM users WHERE id = ?`).bind(user.userId).first<any>())?.email,
      capabilities: { transfers: { requested: true } },
      metadata: { platform: 'still-kinetic', app_id: appId },
    });

    await d1.prepare(
      `UPDATE apps SET stripe_connect_account_id = ? WHERE id = ?`
    ).bind(account.id, appId).run();

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${platform!.env.APP_URL}/dashboard/admin/app/${appId}`,
      return_url: `${platform!.env.APP_URL}/dashboard/admin/app/${appId}?onboarded=1`,
      type: 'account_onboarding',
    });

    return json({ url: link.url });
  }

  // Already has account, generate login link
  const link = await stripe.accountLinks.create({
    account: app.stripe_connect_account_id,
    refresh_url: `${platform!.env.APP_URL}/dashboard/admin/app/${appId}`,
    return_url: `${platform!.env.APP_URL}/dashboard/admin/app/${appId}`,
    type: 'account_onboarding',
  });

  return json({ url: link.url });
};
