CREATE TABLE IF NOT EXISTS subscription_refunds (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  stripe_subscription_id TEXT NOT NULL,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_credit_note_id TEXT,
  stripe_refund_id TEXT,
  stripe_idempotency_key TEXT NOT NULL UNIQUE,
  amount_paid_cents INTEGER NOT NULL,
  refund_amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  paid_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  failure_reason TEXT,
  requested_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscription_refunds_app ON subscription_refunds(app_id);
CREATE INDEX IF NOT EXISTS idx_subscription_refunds_status ON subscription_refunds(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_refunds_stripe_refund ON subscription_refunds(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;
