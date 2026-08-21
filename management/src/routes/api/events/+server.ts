import { json } from '@sveltejs/kit';
import { processEvent } from '$lib/server/thresholdEngine';
import { getAccessDecision } from '$lib/server/access';
import { parseAllowedMetrics, isValidMetric } from '$lib/server/metrics';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const d1 = platform!.env.DB;
  const env = platform!.env;
  const body = await request.json() as any;

  // Accept apiKey from body OR X-Api-Key header (web SDK uses header)
  const apiKey = body.apiKey ?? request.headers.get('X-Api-Key');
  if (!apiKey) {
    return json({ error: 'missing apiKey' }, { status: 400 });
  }

  const app = await d1.prepare(
    `SELECT id, subscription_status, allowed_metrics FROM apps WHERE api_key = ?`
  ).bind(apiKey).first<any>();

  if (!app) {
    return json({ error: 'invalid apiKey' }, { status: 401 });
  }

  if (app.subscription_status !== 'active') {
    return json({ error: 'subscription inactive — pay weekly fee to continue' }, { status: 402 });
  }

  const allowedMetrics = parseAllowedMetrics(app.allowed_metrics);
  if (allowedMetrics.length === 0) {
    return json({ error: 'no allowed metrics configured for this app' }, { status: 403 });
  }

  // Handle both SDK formats:
  //   { appId, events: [...] }  ← SDK batchSender
  //   [...] or { endUserId, ... } ← direct / single event
  const rawEvents = body.events || (Array.isArray(body) ? body : [body]);
  const events = Array.isArray(rawEvents) ? rawEvents : [rawEvents];

  // Filter out disallowed metrics silently (tracking must never throw)
  const access: any[] = [];
  for (const ev of events) {
    if (!ev.metric || !isValidMetric(ev.metric)) continue;
    if (!allowedMetrics.includes(ev.metric)) continue;

    const decision = await getAccessDecision(d1, app.id, ev.endUserId, ev.metric);
    if (!decision.allowed) {
      access.push({ endUserId: ev.endUserId, metric: ev.metric, ...decision });
      continue;
    }
    await processEvent(app.id, {
      endUserId: ev.endUserId,
      pageId: ev.pageId || '_default',
      metric: ev.metric,
      value: ev.value,
      timestamp: ev.timestamp || Date.now(),
    }, d1, env);
    const after = await getAccessDecision(d1, app.id, ev.endUserId, ev.metric);
    access.push({ endUserId: ev.endUserId, metric: ev.metric, ...after });
  }

  return json({ ok: true, access });
};
