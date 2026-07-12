import { json } from '@sveltejs/kit';
import { verifyToken, getAuthTokenFromRequest } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, platform }) => {
  const token = getAuthTokenFromRequest(request);
  if (!token) return json({ error: 'unauthorized' }, { status: 401 });
  const user = await verifyToken(token, platform);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });
  return json({ userId: user.userId, role: user.role });
};
