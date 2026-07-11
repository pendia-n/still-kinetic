import { json } from '@sveltejs/kit';
import { verifyToken } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, platform }) => {
  const user = await verifyToken((request.headers.get('authorization') || '').slice(7));
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;
  const appId = params.id;

  return json(
    await d1.prepare(`SELECT * FROM thresholds WHERE app_id = ? ORDER BY metric`).bind(appId).all<any>()
  );
};

export const POST: RequestHandler = async ({ params, request, platform }) => {
  const user = await verifyToken((request.headers.get('authorization') || '').slice(7));
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const d1 = platform!.env.DB;
  const appId = params.id;

  const app = await d1.prepare(`SELECT owner_id FROM apps WHERE id = ?`).bind(appId).first<any>();
  if (!app) return json({ error: 'not found' }, { status: 404 });
  if (app.owner_id !== user.userId) return json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json();
  // body: { metric, thresholdValue, chargeAmountCents }

  const id = crypto.randomUUID();
  await d1.prepare(
    `INSERT OR REPLACE INTO thresholds (id, app_id, metric, threshold_value, charge_amount_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    id, appId, body.metric, body.thresholdValue, body.chargeAmountCents, new Date().toISOString()
  ).run();

  return json({ id }, { status: 201 });
};
