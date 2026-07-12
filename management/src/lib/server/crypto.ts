// Web Crypto API password hashing — 100% CF Workers compatible.
// Supports: pbkdf2:iterations:salt_hex:hash_hex  |  $2b$... (bcrypt)

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(s: string): Uint8Array {
  const bytes = s.match(/.{2}/g);
  if (!bytes) throw new Error('Invalid hex string');
  return new Uint8Array(bytes.map(b => parseInt(b, 16)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return `pbkdf2:100000:${hex(salt)}:${hex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Pbkdf2 format
  if (stored.startsWith('pbkdf2:')) {
    const parts = stored.split(':');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = fromHex(parts[2]);
    const expectedHex = parts[3];
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
    const computedHex = hex(hash);
    if (computedHex.length !== expectedHex.length) return false;
    let diff = 0;
    for (let i = 0; i < computedHex.length; i++) diff |= computedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    return diff === 0;
  }
  // Bcrypt format
  if (stored.startsWith('$2')) {
    try {
      const bcrypt = await import('bcryptjs');
      return bcrypt.compareSync(password, stored);
    } catch { return false; }
  }
  return false;
}
