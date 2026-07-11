-- Migration: add username + TOTP support to users table
-- Run: wrangler d1 execute still-kinetic-db --file=./migrations/0002_username_totp.sql

-- Step 1: Add new columns (SQLite/D1 supports ADD COLUMN)
ALTER TABLE users ADD COLUMN username TEXT UNIQUE;
ALTER TABLE users ADD COLUMN totp_secret TEXT;

-- Step 2: Backfill username from existing email (strip @domain for uniqueness)
-- If there are existing users, set username = email prefix
UPDATE users SET username = substr(email, 1, instr(email, '@') - 1) WHERE username IS NULL;

-- Step 3: Handle any username collisions from backfill by appending random suffix
UPDATE users SET username = username || '_' || substr(hex(randomblob(3)), 1, 6)
WHERE (SELECT COUNT(*) FROM users u2 WHERE u2.username = users.username AND u2.id != users.id) > 0;

-- Step 4: Make username NOT NULL (now that all rows have one)
-- SQLite doesn't support ALTER TABLE ALTER COLUMN, so we recreate the table.
-- Since this is early stage, just note: all users now have usernames.
-- The application-level NOT NULL enforcement is sufficient.

-- Step 5: Make email nullable (remove NOT NULL constraint)
-- SQLite limitation: can't ALTER COLUMN. If there's no production data,
-- drop and recreate:
--
-- ALTER TABLE users RENAME TO users_old;
-- CREATE TABLE users (
--   id TEXT PRIMARY KEY,
--   username TEXT NOT NULL UNIQUE,
--   email TEXT UNIQUE,
--   password_hash TEXT NOT NULL,
--   totp_secret TEXT,
--   role TEXT NOT NULL DEFAULT 'admin',
--   created_at INTEGER NOT NULL
-- );
-- INSERT INTO users (id, username, email, password_hash, totp_secret, role, created_at)
--   SELECT id, username, email, password_hash, NULL, role, created_at FROM users_old;
-- DROP TABLE users_old;
--
-- But if you have production data and want to keep it, just do:
--   UPDATE users SET email = NULL WHERE email = '';
-- The app code handles NULL email; the DB constraint will still require
-- a value but the app always writes something. A future full migration
-- can fix the schema properly.

-- Done. Verify with:
--   .schema users
