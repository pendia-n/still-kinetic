// TOTP (RFC 6238) via Web Crypto API — 100% CF Workers compatible.
// Uses HMAC-SHA1, 30s time step, 6 digits.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Uint8Array): string {
  let bits = 0, bitCount = 0, result = '';
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      result += BASE32[(bits >> bitCount) & 0x1f];
    }
  }
  if (bitCount > 0) result += BASE32[(bits << (5 - bitCount)) & 0x1f];
  return result;
}

function base32Decode(s: string): Uint8Array {
  const cleaned = s.replace(/[^A-Z2-7]/gi, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0, bitCount = 0;
  for (const ch of cleaned) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    bits = (bits << 5) | idx;
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >> bitCount) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function padSecret(s: string): string {
  // Add padding to make length multiple of 8
  const rem = s.length % 8;
  return rem === 0 ? s : s + '======='.slice(rem);
}

function intTo8Bytes(n: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return buf;
}

function truncate(hmac: Uint8Array): number {
  const offset = hmac[hmac.length - 1] & 0x0f;
  return ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
}

/**
 * Generate a random TOTP secret (20 bytes, base32 encoded).
 */
export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

/**
 * Get the HMAC-SHA1 hash for a given secret + counter.
 */
async function hmacSha1(secret: Uint8Array, counter: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, counter);
  return new Uint8Array(sig);
}

/**
 * Generate a TOTP token for a given secret at a specific time (Unix ms).
 */
export async function generateToken(secretBase32: string, timeMs: number = Date.now()): Promise<string> {
  const counter = BigInt(Math.floor(timeMs / 30000));
  const secret = base32Decode(padSecret(secretBase32));
  const hmac = await hmacSha1(secret, intTo8Bytes(counter));
  const code = truncate(hmac) % 1_000_000;
  return code.toString().padStart(6, '0');
}

/**
 * Verify a TOTP code against the secret.
 * Allows ±1 time step window (3 attempts total) for clock drift.
 */
export async function verifyToken(secretBase32: string, code: string, timeMs: number = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  for (let offset = -1; offset <= 1; offset++) {
    const t = timeMs + offset * 30000;
    const expected = await generateToken(secretBase32, t);
    if (expected === code) return true;
  }
  return false;
}

/**
 * Generate an otpauth:// URI for QR code rendering.
 */
export function generateOtpUri(secret: string, username: string, issuer: string = 'StillKinetic'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedUser = encodeURIComponent(username);
  return `otpauth://totp/${encodedIssuer}:${encodedUser}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}
