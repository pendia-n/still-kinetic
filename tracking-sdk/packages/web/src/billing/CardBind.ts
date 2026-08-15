import { loadStripe, type Stripe, type StripeCardElement } from '@stripe/stripe-js';
import type { StillKineticConfig, SpendingCapInput, CardBindResult } from '../core/types';

interface SetupIntentResponse {
  clientSecret: string;
  customerId: string;
}

/**
 * Handles the ONE-TIME card bind + spending cap flow. This is the single
 * screen the end user sees. After this succeeds, all future threshold
 * charges are fired server-side with no further UI interaction.
 *
 * Usage:
 *   const bind = new CardBind(config);
 *   await bind.mount('#card-element-container');
 *   const result = await bind.submit({ amountCents: 5000, period: 'monthly' });
 */
export class CardBind {
  private stripe: Stripe | null = null;
  private cardElement: StripeCardElement | null = null;

  constructor(private config: StillKineticConfig) {}

  async mount(containerSelector: string): Promise<void> {
    this.stripe = await loadStripe(this.config.stripePublishableKey);
    if (!this.stripe) throw new Error('StillKinetic: Stripe.js failed to load.');

    const elements = this.stripe.elements();
    this.cardElement = elements.create('card');
    const container = document.querySelector(containerSelector);
    if (!container) throw new Error(`StillKinetic: container "${containerSelector}" not found.`);
    this.cardElement.mount(container as HTMLElement);
  }

  async submit(cap: SpendingCapInput): Promise<CardBindResult> {
    if (!this.stripe || !this.cardElement) {
      return { success: false, error: 'Card element not mounted. Call mount() first.' };
    }

    try {
      const setupResp = await fetch(
        `${this.config.apiBaseUrl.replace(/\/$/, '')}/api/end-user/bind-card`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.config.apiKey },
          body: JSON.stringify({
            appId: this.config.appId,
            apiKey: this.config.apiKey,
            endUserId: this.config.endUserId,
          }),
        }
      );
      if (!setupResp.ok) {
        return { success: false, error: `Failed to initialize card setup (${setupResp.status}).` };
      }
      const { clientSecret }: SetupIntentResponse = await setupResp.json();

      const confirmResult = await this.stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: this.cardElement },
      });

      if (confirmResult.error) {
        return { success: false, error: confirmResult.error.message };
      }

      const paymentMethodId = confirmResult.setupIntent?.payment_method;
      if (!paymentMethodId || typeof paymentMethodId !== 'string') {
        return { success: false, error: 'No payment method returned by Stripe.' };
      }

      const capResp = await fetch(
        `${this.config.apiBaseUrl.replace(/\/$/, '')}/api/end-user/config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.config.apiKey },
          body: JSON.stringify({
            appId: this.config.appId,
            apiKey: this.config.apiKey,
            endUserId: this.config.endUserId,
            paymentMethodId,
            spendingCapCents: cap.amountCents,
            spendingCapPeriod: cap.period,
          }),
        }
      );

      if (!capResp.ok) {
        return { success: false, error: `Card saved, but spending cap could not be set (${capResp.status}).` };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error during card bind.' };
    }
  }
}
