// Web Crypto API password hashing — 100% CF Workers compatible.
// Format: pbkdf2:iterations:salt_hex:hash_hex

const ITERATIONS = 100_000;
const KEY_LENGTH = 256; // bits
const SALT_BYTES = 16;
const ALGO = 'PBKDF2';
const HASH = 'SHA-256';

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(s: string): Uint8Array {
  const bytes = s.match(/.{2}/g);
  if (!bytes) throw new Error('Invalid hex string');
  return new Uint8Array(bytes.map(b => parseInt(b, 16)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), ALGO, false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: ALGO, salt, iterations: ITERATIONS, hash: HASH },
    key, KEY_LENGTH,
  );
  return `pbkdf2:${ITERATIONS}:${hex(salt)}:${hex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    throw new Error('Unsupported password hash format');
  }
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expectedHex = parts[3];

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), ALGO, false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: ALGO, salt, iterations, hash: HASH },
    key, KEY_LENGTH,
  );
  const computedHex = hex(hash);
  // Constant-time comparison
  if (computedHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}
