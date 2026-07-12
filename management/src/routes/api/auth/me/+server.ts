import { json } from '@sveltejs/kit';
import { verifyToken, getAuthTokenFromRequest } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, platform }) => {
  const token = getAuthTokenFromRequest(request);
  if (!token) return json({ authenticated: false }, { status: 200 });
  const user = await verifyToken(token, platform);
  if (!user) return json({ authenticated: false }, { status: 200 });
  return json({ authenticated: true, userId: user.userId, role: user.role });
};
