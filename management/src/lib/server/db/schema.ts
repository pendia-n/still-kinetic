import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const ALL_METRICS = [
  'press_count', 'scroll_length', 'scroll_speed', 'stay_duration', 'type_speed',
  'swipe_count', 'pinch_zoom_count', 'long_press_count', 'form_submit_count',
  'tab_switch_count', 'search_count', 'video_play_count', 'video_watch_duration',
  'file_download_count', 'share_count', 'mouse_distance',
] as const;
export type Metric = (typeof ALL_METRICS)[number];

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').unique(),       // nullable now
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'),     // null = TOTP not enabled
  role: text('role', { enum: ['manager', 'admin'] }).notNull().default('admin'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const apps = sqliteTable('apps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  tier: text('tier', { enum: ['basic', 'full'] }).notNull().default('basic'),
  allowedMetrics: text('allowed_metrics').notNull(), // JSON array of Metric
  apiKey: text('api_key').notNull().unique(),
  stripeConnectAccountId: text('stripe_connect_account_id'),
  connectOnboarded: integer('connect_onboarded', { mode: 'boolean' }).notNull().default(false),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status').notNull().default('inactive'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const thresholds = sqliteTable('thresholds', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => apps.id),
  metric: text('metric').notNull(),
  thresholdValue: real('threshold_value').notNull(),
  chargeAmountCents: integer('charge_amount_cents').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const endUsers = sqliteTable('end_users', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => apps.id),
  externalId: text('external_id').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripePaymentMethodId: text('stripe_payment_method_id'),
  spendingCapCents: integer('spending_cap_cents'),
  spendingCapPeriod: text('spending_cap_period', { enum: ['weekly', 'monthly'] }),
  periodStart: integer('period_start', { mode: 'timestamp' }),
  periodSpendCents: integer('period_spend_cents').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const eventAggregates = sqliteTable('event_aggregates', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => apps.id),
  endUserExternalId: text('end_user_external_id').notNull(),
  pageId: text('page_id').notNull(),
  metric: text('metric').notNull(),
  value: real('value').notNull().default(0),
  baselineValue: real('baseline_value').notNull().default(0),
  chargeUnits: integer('charge_units').notNull().default(0),
  lastTriggeredAt: integer('last_triggered_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const triggerLogs = sqliteTable('trigger_logs', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => apps.id),
  endUserExternalId: text('end_user_external_id').notNull(),
  metric: text('metric').notNull(),
  amountCents: integer('amount_cents').notNull(),
  applicationFeeCents: integer('application_fee_cents').notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  status: text('status').notNull(),
  failureReason: text('failure_reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
