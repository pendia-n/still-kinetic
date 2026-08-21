import { json } from '@sveltejs/kit';
import { getAccessDecision } from '$lib/server/access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform }) => {
  const appId = url.searchParams.get('appId');
  const apiKey = url.searchParams.get('apiKey');
  const endUserId = url.searchParams.get('endUserId');
  const metric = url.searchParams.get('metric') || undefined;
  if (!appId || !apiKey || !endUserId) return json({ error: 'appId, apiKey and endUserId are required' }, { status: 400 });
  const app = await platform!.env.DB.prepare(`SELECT id FROM apps WHERE id = ? AND api_key = ?`).bind(appId, apiKey).first<any>();
  if (!app) return json({ error: 'invalid app' }, { status: 401 });
  return json(await getAccessDecision(platform!.env.DB, appId, endUserId, metric));
};
