import { json } from '@sveltejs/kit';
import { verifyToken, getAuthTokenFromRequest } from '$lib/server/auth';
import { ALL_METRICS, TIER_CONFIG, serializeAllowedMetrics, isValidMetric, parseAllowedMetrics } from '$lib/server/metrics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, platform }) => {
  const token = getAuthTokenFromRequest(request);
  if (!token) return json({ error: 'unauthorized' }, { status: 401 });
  const user = await verifyToken(token, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;
  const appId = params.id;

  const app = await d1.prepare(
    `SELECT * FROM apps WHERE id = ?`
  ).bind(appId).first<any>();
  if (!app) return json({ error: 'not found' }, { status: 404 });

  if (user.role !== 'manager' && app.owner_id !== user.userId) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const thresholds = await d1.prepare(
    `SELECT * FROM thresholds WHERE app_id = ?`
  ).bind(appId).all<any>();

  const stats = await d1.prepare(
    `SELECT COUNT(*) as total_end_users FROM end_users WHERE app_id = ?`
  ).bind(appId).first<any>();

  const earnings = await d1.prepare(
    `SELECT COALESCE(SUM(application_fee_cents), 0) as total_fees
     FROM trigger_logs WHERE app_id = ? AND status = 'succeeded'`
  ).bind(appId).first<any>();

  return json({ ...app, thresholds: thresholds.results || [], stats, earnings });
};

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
  const token = getAuthTokenFromRequest(request);
  if (!token) return json({ error: 'unauthorized' }, { status: 401 });
  const user = await verifyToken(token, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;
  const appId = params.id;
  const body = await request.json();

  const app = await d1.prepare(`SELECT owner_id, tier FROM apps WHERE id = ?`).bind(appId).first<any>();
  if (!app) return json({ error: 'not found' }, { status: 404 });
  if (user.role !== 'manager' && app.owner_id !== user.userId) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.name) {
    updates.push('name = ?');
    values.push(body.name);
  }

  if (body.tier) {
    if (!['basic', 'full'].includes(body.tier)) {
      return json({ error: 'tier must be basic or full' }, { status: 400 });
    }
    const config = TIER_CONFIG[body.tier as 'basic' | 'full'];
    const metrics = body.tier === 'full' ? [...ALL_METRICS] : ALL_METRICS.slice(0, config.maxMetrics);
    updates.push('tier = ?');
    values.push(body.tier);
    updates.push('allowed_metrics = ?');
    values.push(serializeAllowedMetrics(metrics as any));
  }

  if (body.enabled_types) {
    const tier = body.tier || app.tier;
    const config = TIER_CONFIG[tier as 'basic' | 'full'];
    if (body.enabled_types.length > config.maxMetrics) {
      return json({ error: `${tier} tier max ${config.maxMetrics} types, got ${body.enabled_types.length}` }, { status: 400 });
    }
    const invalid = body.enabled_types.filter((m: string) => !isValidMetric(m));
    if (invalid.length > 0) {
      return json({ error: `Invalid metric(s): ${invalid.join(', ')}` }, { status: 400 });
    }
    updates.push('allowed_metrics = ?');
    values.push(serializeAllowedMetrics(body.enabled_types));
  }

  if (updates.length === 0) {
    return json({ error: 'nothing to update' }, { status: 400 });
  }

  values.push(appId);
  await d1.prepare(
    `UPDATE apps SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, request, platform }) => {
  const token = getAuthTokenFromRequest(request);
  if (!token) return json({ error: 'unauthorized' }, { status: 401 });
  const user = await verifyToken(token, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });
  if (user.role !== 'manager') return json({ error: 'forbidden' }, { status: 403 });

  const d1 = platform!.env.DB;
  await d1.prepare(`DELETE FROM trigger_logs WHERE app_id = ?`).bind(params.id).run();
  await d1.prepare(`DELETE FROM event_aggregates WHERE app_id = ?`).bind(params.id).run();
  await d1.prepare(`DELETE FROM end_users WHERE app_id = ?`).bind(params.id).run();
  await d1.prepare(`DELETE FROM thresholds WHERE app_id = ?`).bind(params.id).run();
  await d1.prepare(`DELETE FROM apps WHERE id = ?`).bind(params.id).run();

  return json({ ok: true });
};
