import { periodLengthMs } from './metrics';

export type AccessStatus = 'allowed' | 'cap_reached' | 'payment_required' | 'subscription_inactive' | 'connect_required';

export interface AccessDecision {
  allowed: boolean;
  status: AccessStatus;
  message: string;
  remainingCents: number | null;
  capCents: number | null;
  period: 'weekly' | 'monthly' | null;
  spentCents: number;
}

export async function getAccessDecision(
  d1: D1Database,
  appId: string,
  endUserId: string,
  metric?: string,
): Promise<AccessDecision> {
  const app = await d1.prepare(
    `SELECT subscription_status, stripe_connect_account_id, connect_onboarded FROM apps WHERE id = ?`
  ).bind(appId).first<any>();
  if (!app || app.subscription_status !== 'active') {
    return { allowed: false, status: 'subscription_inactive', message: 'This app subscription is inactive.', remainingCents: null, capCents: null, period: null, spentCents: 0 };
  }
  if (!app.stripe_connect_account_id || !app.connect_onboarded) {
    return { allowed: false, status: 'connect_required', message: 'The developer has not completed Stripe Connect onboarding.', remainingCents: null, capCents: null, period: null, spentCents: 0 };
  }
  const eu = await d1.prepare(
    `SELECT stripe_payment_method_id, spending_cap_cents, spending_cap_period, period_start, period_spend_cents
     FROM end_users WHERE app_id = ? AND external_id = ?`
  ).bind(appId, endUserId).first<any>();
  if (!eu?.stripe_payment_method_id) {
    return { allowed: false, status: 'payment_required', message: 'Save a payment card and spending cap to continue.', remainingCents: null, capCents: eu?.spending_cap_cents ?? null, period: eu?.spending_cap_period ?? null, spentCents: eu?.period_spend_cents ?? 0 };
  }
  const period = (eu.spending_cap_period || 'monthly') as 'weekly' | 'monthly';
  const expired = !eu.period_start || Date.now() - new Date(eu.period_start).getTime() >= periodLengthMs(period);
  const spent = expired ? 0 : (eu.period_spend_cents || 0);
  const cap = eu.spending_cap_cents ?? null;
  let remaining = cap === null ? null : Math.max(0, cap - spent);
  if (metric && remaining !== null) {
    const threshold = await d1.prepare(
      `SELECT charge_amount_cents FROM thresholds WHERE app_id = ? AND metric = ?`
    ).bind(appId, metric).first<any>();
    if (threshold && remaining < threshold.charge_amount_cents) {
      return { allowed: false, status: 'cap_reached', message: 'Your remaining cap is too low for the next usage charge. Increase the cap to continue.', remainingCents: remaining, capCents: cap, period, spentCents: spent };
    }
  }
  if (remaining !== null && remaining <= 0) {
    return { allowed: false, status: 'cap_reached', message: 'Your spending cap has been reached. Increase the cap to continue.', remainingCents: 0, capCents: cap, period, spentCents: spent };
  }
  return { allowed: true, status: 'allowed', message: 'Usage is allowed.', remainingCents: remaining, capCents: cap, period, spentCents: spent };
}
