import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from './schema';

export let db: DrizzleD1Database<typeof schema>;

export function initDb(d1: D1Database) {
  const { drizzle } = require('drizzle-orm/d1');
  db = drizzle(d1, { schema });
}
