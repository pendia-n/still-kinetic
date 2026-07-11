import { json } from '@sveltejs/kit';
import { parseAllowedMetrics } from '$lib/server/metrics';
import type { RequestHandler } from './$types';

/**
 * GET /api/apps/config
 * Public endpoint for SDK to fetch app configuration.
 * No auth required — uses apiKey as identifier.
 * Query: ?apiKey=sk_xxxx
 *
 * Returns:
 * {
 *   appId: string,
 *   allowedMetrics: string[],
 *   subscriptionStatus: 'active' | 'inactive' | 'past_due',
 *   tier: 'basic' | 'full'
 * }
 */
export const GET: RequestHandler = async ({ url, platform }) => {
  const apiKey = url.searchParams.get('apiKey');
  if (!apiKey) {
    return json({ error: 'missing apiKey' }, { status: 400 });
  }

  const d1 = platform!.env.DB;
  const app = await d1.prepare(
    `SELECT id, allowed_metrics, subscription_status, tier FROM apps WHERE api_key = ?`
  ).bind(apiKey).first<any>();

  if (!app) {
    return json({ error: 'invalid apiKey' }, { status: 401 });
  }

  return json({
    appId: app.id,
    allowedMetrics: parseAllowedMetrics(app.allowed_metrics),
    subscriptionStatus: app.subscription_status,
    tier: app.tier,
  });
};
