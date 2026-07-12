import { json } from '@sveltejs/kit';
import { verifyToken, getAuthTokenFromRequest } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, platform }) => {
  const token = getAuthTokenFromRequest(request);
  if (!token) return json({ error: 'unauthorized' }, { status: 401 });
  const user = await verifyToken(token, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;
  const appId = params.id;

  return json(
    await d1.prepare(`SELECT * FROM thresholds WHERE app_id = ? ORDER BY metric`).bind(appId).all<any>()
  );
};

export const POST: RequestHandler = async ({ params, request, platform }) => {
  const token = getAuthTokenFromRequest(request);
  if (!token) return json({ error: 'unauthorized' }, { status: 401 });
  const user = await verifyToken(token, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;
  const appId = params.id;

  const app = await d1.prepare(`SELECT owner_id FROM apps WHERE id = ?`).bind(appId).first<any>();
  if (!app) return json({ error: 'not found' }, { status: 404 });
  if (app.owner_id !== user.userId) return json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json();
  // body: { metric, thresholdValue, chargeAmountCents }

  // Validation
  if (!body.metric) return json({ error: 'metric is required' }, { status: 400 });
  if (body.thresholdValue < 1) return json({ error: 'thresholdValue min is 1' }, { status: 400 });
  if (body.chargeAmountCents < 100) return json({ error: 'chargeAmountCents min is 100' }, { status: 400 });

  // Upsert: each metric can only have ONE threshold per app
  const existing = await d1.prepare(
    `SELECT id FROM thresholds WHERE app_id = ? AND metric = ?`
  ).bind(appId, body.metric).first<any>();

  if (existing) {
    await d1.prepare(
      `UPDATE thresholds SET threshold_value = ?, charge_amount_cents = ? WHERE id = ?`
    ).bind(body.thresholdValue, body.chargeAmountCents, existing.id).run();
    return json({ id: existing.id });
  } else {
    const id = crypto.randomUUID();
    await d1.prepare(
      `INSERT INTO thresholds (id, app_id, metric, threshold_value, charge_amount_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, appId, body.metric, body.thresholdValue, body.chargeAmountCents, new Date().toISOString()).run();
    return json({ id }, { status: 201 });
  }
};

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
  const token = getAuthTokenFromRequest(request);
  if (!token) return json({ error: 'unauthorized' }, { status: 401 });
  const user = await verifyToken(token, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;
  const appId = params.id;

  const app = await d1.prepare(`SELECT owner_id FROM apps WHERE id = ?`).bind(appId).first<any>();
  if (!app) return json({ error: 'not found' }, { status: 404 });
  if (app.owner_id !== user.userId) return json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json();
  // body: { thresholdId, thresholdValue, chargeAmountCents }

  if (!body.thresholdId) return json({ error: 'thresholdId is required' }, { status: 400 });
  if (body.thresholdValue < 1) return json({ error: 'thresholdValue min is 1' }, { status: 400 });
  if (body.chargeAmountCents < 100) return json({ error: 'chargeAmountCents min is 100' }, { status: 400 });

  await d1.prepare(
    `UPDATE thresholds SET threshold_value = ?, charge_amount_cents = ? WHERE id = ? AND app_id = ?`
  ).bind(body.thresholdValue, body.chargeAmountCents, body.thresholdId, appId).run();

  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, request, platform }) => {
  const token = getAuthTokenFromRequest(request);
  if (!token) return json({ error: 'unauthorized' }, { status: 401 });
  const user = await verifyToken(token, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;
  const appId = params.id;

  const app = await d1.prepare(`SELECT owner_id FROM apps WHERE id = ?`).bind(appId).first<any>();
  if (!app) return json({ error: 'not found' }, { status: 404 });
  if (app.owner_id !== user.userId) return json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json();
  if (!body.thresholdId) return json({ error: 'thresholdId is required' }, { status: 400 });

  await d1.prepare(
    `DELETE FROM thresholds WHERE id = ? AND app_id = ?`
  ).bind(body.thresholdId, appId).run();

  return json({ ok: true });
};
