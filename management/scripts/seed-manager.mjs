// Generate password hash using Web Crypto API (same as the app's crypto.ts),
// then output a SQL INSERT for the manager account.
// Run: node scripts/seed-manager.mjs

const username = 'manager';
const password = 'managereganam1001';

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_LENGTH = 256;

function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key, KEY_LENGTH,
  );
  return `pbkdf2:${ITERATIONS}:${hex(salt)}:${hex(hash)}`;
}

const hash = await hashPassword(password);
const id = crypto.randomUUID();
const now = Date.now();

const sql = `INSERT INTO users (id, username, email, password_hash, role, created_at)
VALUES ('${id}', '${username}', 'manager@stillkinetic.local', '${hash}', 'manager', ${now});`;

console.log('-- Manager seed SQL:');
console.log(sql);
console.log('-- Run with: wrangler d1 execute still-kinetic --remote --command="..."');
