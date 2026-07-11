import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-prod');

export interface TokenPayload {
  userId: string;
  role: string;
}

export interface TempTokenPayload extends TokenPayload {
  purpose: string;
}

export async function createToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);
}

/**
 * Short-lived token for TOTP login two-step flow (5 minutes).
 */
export async function createTempToken(payload: TempTokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as TokenPayload;
  } catch { return null; }
}

export async function verifyTempToken(token: string): Promise<TempTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as TempTokenPayload;
  } catch { return null; }
}
