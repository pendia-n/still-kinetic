-- Create initial tables for StillKinetic management app
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  tier TEXT NOT NULL DEFAULT 'basic',
  allowed_metrics TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  stripe_connect_account_id TEXT,
  connect_onboarded INTEGER NOT NULL DEFAULT 0,
  stripe_subscription_id TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thresholds (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  metric TEXT NOT NULL,
  threshold_value REAL NOT NULL,
  charge_amount_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS end_users (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  external_id TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_payment_method_id TEXT,
  spending_cap_cents INTEGER,
  spending_cap_period TEXT,
  period_start INTEGER,
  period_spend_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_aggregates (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  end_user_external_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  baseline_value REAL NOT NULL DEFAULT 0,
  last_triggered_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trigger_logs (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  end_user_external_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  application_fee_cents INTEGER NOT NULL,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL,
  failure_reason TEXT,
  created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_apps_owner ON apps(owner_id);
CREATE INDEX IF NOT EXISTS idx_apps_api_key ON apps(api_key);
CREATE INDEX IF NOT EXISTS idx_thresholds_app ON thresholds(app_id);
CREATE INDEX IF NOT EXISTS idx_end_users_app ON end_users(app_id);
CREATE INDEX IF NOT EXISTS idx_end_users_external ON end_users(app_id, external_id);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_app ON trigger_logs(app_id);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_status ON trigger_logs(status);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_created ON trigger_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_event_aggregates_lookup ON event_aggregates(app_id, end_user_external_id, page_id, metric);
