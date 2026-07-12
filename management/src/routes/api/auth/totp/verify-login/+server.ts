import { json } from '@sveltejs/kit';
import { createToken, verifyTempToken, makeAuthCookie } from '$lib/server/auth';
import { verifyToken as verifyTotpToken } from '$lib/server/totp';
import type { RequestHandler } from './$types';

/**
 * Second step of login when TOTP is enabled.
 * Verifies the TOTP code and returns the real JWT via HttpOnly cookie.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const d1 = platform!.env.DB;
  const { loginToken, code } = await request.json();

  if (!loginToken || !code) {
    return json({ error: 'Login token and TOTP code required.' }, { status: 400 });
  }

  // Decode the temp token to get userId
  const payload = await verifyTempToken(loginToken, platform);
  if (!payload || payload.purpose !== 'totp_login') {
    return json({ error: 'Invalid or expired login token.' }, { status: 401 });
  }

  // Fetch user's TOTP secret
  const user = await d1.prepare(
    `SELECT id, totp_secret, role FROM users WHERE id = ?`
  ).bind(payload.userId).first<any>();

  if (!user || !user.totp_secret) {
    return json({ error: 'TOTP not configured for this account.' }, { status: 400 });
  }

  const valid = await verifyTotpToken(user.totp_secret, code);
  if (!valid) {
    return json({ error: 'Invalid TOTP code.' }, { status: 401 });
  }

  const token = await createToken({ userId: user.id, role: user.role }, platform);
  return new Response(JSON.stringify({ role: user.role }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': makeAuthCookie(token),
    },
  });
};
