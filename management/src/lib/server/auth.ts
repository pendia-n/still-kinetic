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
