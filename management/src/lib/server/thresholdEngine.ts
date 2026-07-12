import { getStripe, platformFeeFraction, PLATFORM_METADATA } from './stripe';
import {
  CUMULATIVE_METRICS, INSTANTANEOUS_METRICS,
  INSTANTANEOUS_TRIGGER_COOLDOWN_MS, periodLengthMs, isValidMetric,
} from './metrics';

interface IngestedEvent {
  endUserId: string;
  pageId: string;
  metric: string;
  value: number;
  timestamp: number;
}

export async function processEvent(appId: string, event: IngestedEvent, d1: D1Database, env: any): Promise<void> {
  processEventAsync(appId, event, d1, env).catch((err) => {
    console.error(`[thresholdEngine] Error for ${appId}/${event.metric}:`, err);
  });
}

async function processEventAsync(appId: string, event: IngestedEvent, d1: D1Database, env: any): Promise<void> {
  if (!isValidMetric(event.metric)) return;

  const isC = (CUMULATIVE_METRICS as readonly string[]).includes(event.metric);
  const isI = (INSTANTANEOUS_METRICS as readonly string[]).includes(event.metric);

  // Upsert aggregate
  const row = await d1.prepare(
    `SELECT id, value, baseline_value, last_triggered_at FROM event_aggregates
     WHERE app_id = ? AND end_user_external_id = ? AND page_id = ? AND metric = ?`
  ).bind(appId, event.endUserId, event.pageId, event.metric).first<any>();

  let aggId: string, value: number, baselineValue: number, lastTriggeredAt: string | null;

  if (row) {
    value = isC ? row.value + event.value : event.value;
    baselineValue = row.baseline_value;
    lastTriggeredAt = row.last_triggered_at;
    aggId = row.id;
    await d1.prepare(
      `UPDATE event_aggregates SET value = ?, updated_at = ? WHERE id = ?`
    ).bind(value, new Date().toISOString(), aggId).run();
  } else {
    value = event.value;
    baselineValue = 0;
    lastTriggeredAt = null;
    aggId = crypto.randomUUID();
    await d1.prepare(
`INSERT INTO event_aggregates (id, app_id, end_user_external_id, page_id, metric, value, baseline_value, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(aggId, appId, event.endUserId, event.pageId, event.metric, value, new Date().toISOString()).run();
  }

  // Check threshold
  const th = await d1.prepare(
    `SELECT threshold_value, charge_amount_cents FROM thresholds WHERE app_id = ? AND metric = ?`
  ).bind(appId, event.metric).first<any>();
  if (!th) return;

  const effective = isC ? value - baselineValue : value;
  if (effective < th.threshold_value) return;

  // Instantaneous cooldown
  if (isI && lastTriggeredAt) {
    const elapsed = Date.now() - new Date(lastTriggeredAt).getTime();
    if (elapsed < INSTANTANEOUS_TRIGGER_COOLDOWN_MS) return;
  }

  // Execute charge
  await doCharge(d1, appId, event.endUserId, event.metric, th.charge_amount_cents, value, aggId, env);
}

async function doCharge(
  d1: D1Database, appId: string, endUserExternalId: string, metric: string,
  chargeAmountCents: number, currentValue: number, aggregateId: string, env: any,
): Promise<void> {
  const app = await d1.prepare(
    `SELECT stripe_connect_account_id, connect_onboarded, subscription_status FROM apps WHERE id = ?`
  ).bind(appId).first<any>();
  if (!app?.stripe_connect_account_id || !app.connect_onboarded) return;
  if (app.subscription_status !== 'active') return;

  const eu = await d1.prepare(
    `SELECT stripe_customer_id, stripe_payment_method_id, spending_cap_cents,
            spending_cap_period, period_start, period_spend_cents
     FROM end_users WHERE app_id = ? AND external_id = ?`
  ).bind(appId, endUserExternalId).first<any>();
  if (!eu?.stripe_customer_id || !eu?.stripe_payment_method_id) {
    await logSkip(d1, appId, endUserExternalId, metric, chargeAmountCents, 'skipped_no_card', 'End user has not completed card bind.');
    return;
  }

  // Spending cap
  const now = new Date();
  let ps = eu.period_start ? new Date(eu.period_start) : null;
  let spent = eu.period_spend_cents || 0;
  const period: 'weekly' | 'monthly' = eu.spending_cap_period || 'monthly';

  if (!ps || now.getTime() - ps.getTime() >= periodLengthMs(period)) {
    ps = now;
    spent = 0;
  }

  if (eu.spending_cap_cents && spent + chargeAmountCents > eu.spending_cap_cents) {
    await logSkip(d1, appId, endUserExternalId, metric, chargeAmountCents, 'skipped_cap_reached',
      `Would exceed cap (${eu.spending_cap_cents} cents / ${period}).`);
    return;
  }

  // Stripe charge
  const fee = Math.round(chargeAmountCents * platformFeeFraction());
  const stripe = getStripe(env);

  try {
    const pi = await stripe.paymentIntents.create({
      idempotencyKey: `sk_charge_${appId}_${endUserExternalId}_${metric}_${aggregateId}`,
      amount: chargeAmountCents,
      currency: 'usd',
      customer: eu.stripe_customer_id,
      payment_method: eu.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      application_fee_amount: fee,
      transfer_data: { destination: app.stripe_connect_account_id },
      metadata: { ...PLATFORM_METADATA, appId, endUserExternalId, metric },
    });

    const nowStr = now.toISOString();
    const isC = (CUMULATIVE_METRICS as readonly string[]).includes(metric);

    await d1.batch([
      d1.prepare(
        `INSERT INTO trigger_logs (id, app_id, end_user_external_id, metric, amount_cents,
                application_fee_cents, stripe_payment_intent_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'succeeded', ?)`
      ).bind(crypto.randomUUID(), appId, endUserExternalId, metric, chargeAmountCents, fee, pi.id, nowStr),
      d1.prepare(
        `UPDATE end_users SET period_start = ?, period_spend_cents = period_spend_cents + ?
         WHERE app_id = ? AND external_id = ?`
      ).bind(ps.toISOString(), chargeAmountCents, appId, endUserExternalId),
      isC
        ? d1.prepare(
            `UPDATE event_aggregates SET baseline_value = ?, last_triggered_at = ?, updated_at = ? WHERE id = ?`
          ).bind(currentValue, nowStr, nowStr, aggregateId)
        : d1.prepare(
            `UPDATE event_aggregates SET last_triggered_at = ?, updated_at = ? WHERE id = ?`
          ).bind(nowStr, nowStr, aggregateId),
    ]);
  } catch (err: any) {
    await d1.prepare(
      `INSERT INTO trigger_logs (id, app_id, end_user_external_id, metric, amount_cents,
              application_fee_cents, status, failure_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'failed', ?, ?)`
    ).bind(crypto.randomUUID(), appId, endUserExternalId, metric, chargeAmountCents, fee,
      err.message || 'Stripe charge failed', new Date().toISOString()).run();
  }
}

async function logSkip(d1: D1Database, appId: string, euid: string, metric: string, amount: number, status: string, reason: string) {
  await d1.prepare(
    `INSERT INTO trigger_logs (id, app_id, end_user_external_id, metric, amount_cents,
            application_fee_cents, status, failure_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), appId, euid, metric, amount, Math.round(amount * platformFeeFraction()),
    status, reason, new Date().toISOString()).run();
}
