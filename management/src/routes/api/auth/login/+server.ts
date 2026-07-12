import { json } from '@sveltejs/kit';
import { verifyPassword } from '$lib/server/crypto';
import { createToken, createTempToken, verifyTempToken } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
  const d1 = platform!.env.DB;
  const { identifier, password } = await request.json();

  if (!identifier || !password) {
    return json({ error: 'Identifier and password required.' }, { status: 400 });
  }

  // Find user by username OR email
  const user = await d1.prepare(
    `SELECT id, username, email, password_hash, totp_secret, role FROM users WHERE username = ? OR email = ?`
  ).bind(identifier, identifier).first<any>();

  if (!user) {
    return json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  // If user has TOTP enabled → return a temp token for step 2
  if (user.totp_secret) {
    const loginToken = await createTempToken({
      userId: user.id,
      role: user.role,
      purpose: 'totp_login',
    }, platform);
    return json({ totpRequired: true, loginToken });
  }

  // No TOTP → return JWT directly
  const token = await createToken({ userId: user.id, role: user.role }, platform);
  return json({ token, role: user.role });
};
