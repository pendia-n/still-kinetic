import { json } from '@sveltejs/kit';
import { createToken, makeAuthCookie } from '$lib/server/auth';
import { hashPassword } from '$lib/server/crypto';
import { verifyToken as verifyTotpToken } from '$lib/server/totp';
import type { RequestHandler } from './$types';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,50}$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,128}$/;

export const POST: RequestHandler = async ({ request, platform }) => {
  const d1 = platform!.env.DB;
  const { username, password, email, totpSecret, totpCode } = await request.json();

  // --- Validate username ---
  if (!username || !USERNAME_RE.test(username)) {
    return json({ error: 'Username must be 3-50 chars: letters, numbers, underscore, hyphen.' }, { status: 400 });
  }

  // --- Validate password strength ---
  if (!password || !PASSWORD_RE.test(password)) {
    return json({
      error: 'Password: min 8 chars, must include uppercase, lowercase, number, and special character.',
    }, { status: 400 });
  }

  // --- Check username uniqueness ---
  const existingUser = await d1.prepare(
    `SELECT id FROM users WHERE username = ?`
  ).bind(username).first<any>();
  if (existingUser) {
    return json({ error: 'Username already taken.' }, { status: 409 });
  }

  // --- Check email uniqueness (if provided) ---
  if (email) {
    if (typeof email !== 'string' || !email.includes('@') || email.length > 254) {
      return json({ error: 'Invalid email address.' }, { status: 400 });
    }
    const existingEmail = await d1.prepare(
      `SELECT id FROM users WHERE email = ?`
    ).bind(email).first<any>();
    if (existingEmail) {
      return json({ error: 'Email already registered.' }, { status: 409 });
    }
  }

  // --- Validate TOTP if requested ---
  let storedTotpSecret: string | null = null;
  if (totpSecret) {
    if (!totpCode) {
      return json({ error: 'TOTP code required to enable two-factor authentication.' }, { status: 400 });
    }
    if (typeof totpSecret !== 'string' || totpSecret.length < 16) {
      return json({ error: 'Invalid TOTP secret.' }, { status: 400 });
    }
    const valid = await verifyTotpToken(totpSecret, totpCode);
    if (!valid) {
      return json({ error: 'Invalid TOTP code. Make sure your authenticator app shows the correct code.' }, { status: 400 });
    }
    storedTotpSecret = totpSecret;
  }

  // --- Create user ---
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const emailCol = email ? email : null;
  await d1.prepare(
    `INSERT INTO users (id, username, email, password_hash, totp_secret, role, created_at)
     VALUES (?, ?, ?, ?, ?, 'admin', ?)`
  ).bind(id, username, emailCol, passwordHash, storedTotpSecret, now).run();

  const token = await createToken({ userId: id, role: 'admin' }, platform);
  return new Response(JSON.stringify({ role: 'admin' }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': makeAuthCookie(token),
    },
  });
};
