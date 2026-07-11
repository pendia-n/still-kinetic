import { json } from '@sveltejs/kit';
import { createToken } from '$lib/server/auth';
import { verifyPassword } from '$lib/server/crypto';
import { generateSecret, generateOtpUri } from '$lib/server/totp';
import type { RequestHandler } from './$types';

/**
 * Provision a TOTP secret for registration.
 * Does NOT store anything — just generates and returns.
 * The frontend shows the QR code, user scans + verifies, then
 * includes the verified secret in the register call.
 */
export const POST: RequestHandler = async ({ request }) => {
  const { username } = await request.json();

  if (!username || typeof username !== 'string' || username.length < 1) {
    return json({ error: 'Username required for provisioning.' }, { status: 400 });
  }

  const secret = generateSecret();
  const uri = generateOtpUri(secret, username);

  return json({ secret, uri });
};
