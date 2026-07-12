import { SignJWT, jwtVerify } from 'jose';

export interface TokenPayload {
  userId: string;
  role: string;
}

export interface TempTokenPayload extends TokenPayload {
  purpose: string;
}

function getSecret(platform?: any): Uint8Array {
  const key = platform?.env?.JWT_SECRET || (typeof process !== 'undefined' ? process.env.JWT_SECRET : undefined);
  if (!key) throw new Error('JWT_SECRET not available');
  return new TextEncoder().encode(key);
}

export async function createToken(payload: TokenPayload, platform?: any): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(getSecret(platform));
}

export async function createTempToken(payload: TempTokenPayload, platform?: any): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(getSecret(platform));
}

export async function verifyToken(token: string, platform?: any): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(platform));
    return payload as unknown as TokenPayload;
  } catch { return null; }
}

export async function verifyTempToken(token: string, platform?: any): Promise<TempTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(platform));
    return payload as unknown as TempTokenPayload;
  } catch { return null; }
}

/** Parse cookie header into key-value pairs */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  cookieHeader.split(';').forEach(pair => {
    const parts = pair.trim().split('=');
    if (parts.length >= 2) result[parts[0]] = parts.slice(1).join('=');
  });
  return result;
}

/** Extract auth token from request cookie */
export function getAuthTokenFromRequest(request: Request): string | null {
  const cookies = parseCookies(request.headers.get('cookie') || '');
  return cookies.sk_token || null;
}

/** Set-Cookie header value for the auth token (HttpOnly, 12 days) */
export function makeAuthCookie(token: string): string {
  const maxAge = 60 * 60 * 24 * 12; // 12 days
  return `sk_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

/** Set-Cookie header value to clear auth token */
export function clearAuthCookie(): string {
  return `sk_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
