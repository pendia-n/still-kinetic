import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import type { StillKineticConfig, SpendingCapInput, CardBindResult } from '../core/types';

interface Props {
  config: StillKineticConfig;
  defaultCap: SpendingCapInput;
  onComplete: (result: CardBindResult) => void;
}

/**
 * Drop-in screen/component for the ONE-TIME card bind + spending cap flow.
 * Render this once (e.g. on signup, or the first time a threshold is
 * approached) — never per-transaction. After this succeeds, all future
 * threshold charges fire server-side with no further screen.
 */
export function CardBindScreen({ config, defaultCap, onComplete }: Props) {
  const { confirmSetupIntent } = useStripe();
  const [capAmount, setCapAmount] = useState(String(defaultCap.amountCents / 100));
  const [period, setPeriod] = useState<'weekly' | 'monthly'>(defaultCap.period);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const setupResp = await fetch(
        `${config.apiBaseUrl.replace(/\/$/, '')}/api/billing/setup-intent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.apiKey },
          body: JSON.stringify({ appId: config.appId, endUserId: config.endUserId }),
        }
      );
      if (!setupResp.ok) throw new Error(`Setup failed (${setupResp.status})`);
      const { clientSecret } = await setupResp.json();

      const { error, setupIntent } = await confirmSetupIntent(clientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) throw new Error(error.message);
      const paymentMethodId = setupIntent?.paymentMethodId;
      if (!paymentMethodId) throw new Error('No payment method returned.');

      const amountCents = Math.round(parseFloat(capAmount) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        throw new Error('Enter a valid spending cap amount.');
      }

      const capResp = await fetch(
        `${config.apiBaseUrl.replace(/\/$/, '')}/api/billing/end-user-config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.apiKey },
          body: JSON.stringify({
            appId: config.appId,
            endUserId: config.endUserId,
            paymentMethodId,
            spendingCapCents: amountCents,
            spendingCapPeriod: period,
          }),
        }
      );
      if (!capResp.ok) throw new Error(`Spending cap could not be saved (${capResp.status})`);

      onComplete({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setErrorMsg(message);
      onComplete({ success: false, error: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add a payment method</Text>
      <Text style={styles.subtitle}>
        You'll be charged automatically based on usage in this app, up to the limit you set below.
        You can change or remove this at any time.
      </Text>

      <CardField
        postalCodeEnabled={true}
        style={styles.cardField}
        placeholders={{ number: '4242 4242 4242 4242' }}
      />

      <Text style={styles.label}>Spending cap ($)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={capAmount}
        onChangeText={setCapAmount}
      />

      <Text style={styles.label}>Cap period</Text>
      <View style={styles.periodRow}>
        {(['weekly', 'monthly'] as const).map((p) => (
          <Pressable
            key={p}
            style={[styles.periodButton, period === p && styles.periodButtonActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={period === p ? styles.periodTextActive : styles.periodText}>
              {p === 'weekly' ? 'Weekly' : 'Monthly'}
            </Text>
          </Pressable>
        ))}
      </View>

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

      <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        <Text style={styles.submitText}>{submitting ? 'Saving…' : 'Confirm'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#555', marginBottom: 20 },
  cardField: { height: 50, marginVertical: 12 },
  label: { fontSize: 13, fontWeight: '500', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  periodRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  periodButton: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    alignItems: 'center',
  },
  periodButtonActive: { backgroundColor: '#111', borderColor: '#111' },
  periodText: { color: '#111' },
  periodTextActive: { color: '#fff' },
  error: { color: '#c00', marginTop: 12 },
  submitButton: {
    marginTop: 24,
    backgroundColor: '#111',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '600' },
});
