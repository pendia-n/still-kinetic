import { json } from '@sveltejs/kit';
import { verifyToken, getAuthTokenFromRequest } from '$lib/server/auth';
import { ALL_METRICS, TIER_CONFIG, serializeAllowedMetrics, isValidMetric } from '$lib/server/metrics';
import type { RequestHandler } from './$types';

function auth(req: Request, platform?: any) {
  const token = getAuthTokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token, platform);
}

export const GET: RequestHandler = async ({ request, platform }) => {
  const user = await auth(request, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;

  let apps: any[];
  if (user.role === 'manager') {
    apps = await d1.prepare(
      `SELECT a.*, u.email as owner_email FROM apps a JOIN users u ON a.owner_id = u.id ORDER BY a.created_at DESC`
    ).all<any>();
  } else {
    apps = await d1.prepare(
      `SELECT * FROM apps WHERE owner_id = ? ORDER BY created_at DESC`
    ).bind(user.userId).all<any>();
  }

  return json(apps.results || []);
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const user = await auth(request, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'only admins can create apps' }, { status: 403 });

  const d1 = platform!.env.DB;
  const { name, tier, enabled_types } = await request.json();

  if (!['basic', 'full'].includes(tier)) {
    return json({ error: 'tier must be basic or full' }, { status: 400 });
  }

  const config = TIER_CONFIG[tier as 'basic' | 'full'];
  let metrics: string[];

  if (tier === 'full') {
    metrics = [...ALL_METRICS];
  } else {
    // Basic: use provided types or default to first 2
    if (Array.isArray(enabled_types) && enabled_types.length > 0) {
      if (enabled_types.length > config.maxMetrics) {
        return json({ error: `Basic tier max ${config.maxMetrics} types, got ${enabled_types.length}` }, { status: 400 });
      }
      const invalid = enabled_types.filter(m => !isValidMetric(m));
      if (invalid.length > 0) {
        return json({ error: `Invalid metric(s): ${invalid.join(', ')}` }, { status: 400 });
      }
      metrics = enabled_types;
    } else {
      metrics = ALL_METRICS.slice(0, config.maxMetrics);
    }
  }

  const id = crypto.randomUUID();
  const apiKey = 'sk_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  await d1.prepare(
    `INSERT INTO apps (id, name, owner_id, tier, allowed_metrics, api_key, subscription_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'inactive', ?)`
  ).bind(id, name, user.userId, tier, serializeAllowedMetrics(metrics as any), apiKey, new Date().toISOString()).run();

  return json({ id, apiKey, tier, allowedMetrics: metrics }, { status: 201 });
};
