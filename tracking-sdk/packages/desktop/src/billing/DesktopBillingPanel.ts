import { loadStripe, type Stripe, type StripeCardElement } from '@stripe/stripe-js';
import type {
  CardBindResult,
  SpendingCapInput,
  StillKineticConfig,
} from '@stillkinetic/web-sdk';

export interface DesktopBillingPanelOptions {
  defaultCap?: SpendingCapInput;
  title?: string;
  description?: string;
  consentText?: string;
  submitLabel?: string;
  onComplete?: (result: CardBindResult) => void;
}

interface SetupIntentResponse {
  clientSecret: string;
}

type MountTarget = string | HTMLElement;

function resolveTarget(target: MountTarget): HTMLElement {
  if (typeof target !== 'string') return target;
  const element = document.querySelector<HTMLElement>(target);
  if (!element) throw new Error(`StillKinetic: container "${target}" not found.`);
  return element;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Framework-neutral Stripe card and spending-cap panel for desktop WebViews.
 * Mounting displays the consent form; Stripe binding only starts after the
 * end user explicitly checks the consent box and submits the form.
 */
export class DesktopBillingPanel {
  private stripe: Stripe | null = null;
  private cardElement: StripeCardElement | null = null;
  private root: HTMLDivElement | null = null;
  private form: HTMLFormElement | null = null;
  private amountInput: HTMLInputElement | null = null;
  private periodSelect: HTMLSelectElement | null = null;
  private consentInput: HTMLInputElement | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private statusElement: HTMLParagraphElement | null = null;

  constructor(
    private config: StillKineticConfig,
    private options: DesktopBillingPanelOptions = {},
  ) {}

  async mount(target: MountTarget): Promise<void> {
    if (this.root) throw new Error('StillKinetic: billing panel is already mounted.');

    this.stripe = await loadStripe(this.config.stripePublishableKey);
    if (!this.stripe) throw new Error('StillKinetic: Stripe.js failed to load.');

    const container = resolveTarget(target);
    const defaultCap = this.options.defaultCap ?? { amountCents: 500, period: 'weekly' };

    const root = document.createElement('div');
    root.setAttribute('data-stillkinetic-desktop-billing', '');
    root.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:460px;padding:20px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#1f2937;box-shadow:0 8px 24px rgba(31,41,55,.08)';

    const title = document.createElement('h2');
    title.textContent = this.options.title ?? 'Set up usage billing';
    title.style.cssText = 'margin:0 0 8px;font-size:20px';

    const description = document.createElement('p');
    description.textContent = this.options.description
      ?? 'Save a payment card and choose the most StillKinetic may charge during each spending period.';
    description.style.cssText = 'margin:0 0 18px;color:#6b7280;font-size:14px;line-height:1.5';

    const form = document.createElement('form');
    const cardLabel = document.createElement('label');
    cardLabel.textContent = 'Payment card';
    cardLabel.style.cssText = 'display:block;margin-bottom:6px;font-size:13px;font-weight:600';
    const cardContainer = document.createElement('div');
    cardContainer.style.cssText = 'padding:12px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:14px;background:#fff';

    const capRow = document.createElement('div');
    capRow.style.cssText = 'display:grid;grid-template-columns:1fr 140px;gap:10px;margin-bottom:14px';
    const amountGroup = document.createElement('label');
    amountGroup.textContent = 'Spending cap (USD)';
    amountGroup.style.cssText = 'display:grid;gap:6px;font-size:13px;font-weight:600';
    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.min = '1';
    amountInput.step = '0.01';
    amountInput.required = true;
    amountInput.value = (defaultCap.amountCents / 100).toFixed(2);
    amountInput.style.cssText = 'width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font:inherit';
    amountGroup.append(amountInput);

    const periodGroup = document.createElement('label');
    periodGroup.textContent = 'Period';
    periodGroup.style.cssText = 'display:grid;gap:6px;font-size:13px;font-weight:600';
    const periodSelect = document.createElement('select');
    periodSelect.style.cssText = 'width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font:inherit';
    for (const period of ['weekly', 'monthly'] as const) {
      const option = document.createElement('option');
      option.value = period;
      option.textContent = period === 'weekly' ? 'Weekly' : 'Monthly';
      option.selected = defaultCap.period === period;
      periodSelect.append(option);
    }
    periodGroup.append(periodSelect);
    capRow.append(amountGroup, periodGroup);

    const consentLabel = document.createElement('label');
    consentLabel.style.cssText = 'display:flex;align-items:flex-start;gap:9px;margin-bottom:14px;color:#4b5563;font-size:12px;line-height:1.45';
    const consentInput = document.createElement('input');
    consentInput.type = 'checkbox';
    consentInput.required = true;
    consentInput.style.cssText = 'margin-top:2px';
    const consentText = document.createElement('span');
    consentText.textContent = this.options.consentText
      ?? 'I authorize usage-triggered off-session charges up to this cap. I understand this is not a prepaid balance or recurring subscription.';
    consentLabel.append(consentInput, consentText);

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = this.options.submitLabel ?? 'Save card and cap';
    submitButton.style.cssText = 'width:100%;padding:11px;border:0;border-radius:6px;background:#f85822;color:#fff;font:inherit;font-weight:700;cursor:pointer';

    const statusElement = document.createElement('p');
    statusElement.setAttribute('role', 'status');
    statusElement.style.cssText = 'min-height:20px;margin:10px 0 0;font-size:13px;color:#6b7280';

    form.append(cardLabel, cardContainer, capRow, consentLabel, submitButton, statusElement);
    root.append(title, description, form);
    container.append(root);

    this.cardElement = this.stripe.elements().create('card');
    this.cardElement.mount(cardContainer);
    this.root = root;
    this.form = form;
    this.amountInput = amountInput;
    this.periodSelect = periodSelect;
    this.consentInput = consentInput;
    this.submitButton = submitButton;
    this.statusElement = statusElement;
    form.addEventListener('submit', this.handleSubmit);
  }

  private handleSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (!this.stripe || !this.cardElement || !this.amountInput || !this.periodSelect || !this.consentInput) return;

    const amountCents = Math.round(Number(this.amountInput.value) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 100) {
      this.setStatus('Enter a spending cap of at least $1.00.', true);
      return;
    }
    if (!this.consentInput.checked) {
      this.setStatus('Consent is required before saving a payment method.', true);
      return;
    }

    this.setSubmitting(true);
    this.setStatus('Securing payment method…');

    try {
      const baseUrl = this.config.apiBaseUrl.replace(/\/$/, '');
      const headers = { 'Content-Type': 'application/json', 'X-Api-Key': this.config.apiKey };
      const setupResponse = await fetch(`${baseUrl}/api/end-user/bind-card`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          appId: this.config.appId,
          apiKey: this.config.apiKey,
          endUserId: this.config.endUserId,
        }),
      });
      if (!setupResponse.ok) {
        throw new Error(await responseError(setupResponse, `Card setup failed (${setupResponse.status}).`));
      }

      const { clientSecret } = await setupResponse.json() as SetupIntentResponse;
      const confirmation = await this.stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: this.cardElement },
      });
      if (confirmation.error) throw new Error(confirmation.error.message);

      const paymentMethodId = confirmation.setupIntent?.payment_method;
      if (!paymentMethodId || typeof paymentMethodId !== 'string') {
        throw new Error('Stripe did not return a payment method.');
      }

      this.setStatus('Saving spending cap…');
      const capResponse = await fetch(`${baseUrl}/api/end-user/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          appId: this.config.appId,
          apiKey: this.config.apiKey,
          endUserId: this.config.endUserId,
          paymentMethodId,
          spendingCapCents: amountCents,
          spendingCapPeriod: this.periodSelect.value,
        }),
      });
      if (!capResponse.ok) {
        throw new Error(await responseError(capResponse, `Spending cap could not be saved (${capResponse.status}).`));
      }

      this.setStatus('Payment method and spending cap saved.');
      this.options.onComplete?.({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown billing setup error.';
      this.setStatus(message, true);
      this.options.onComplete?.({ success: false, error: message });
    } finally {
      this.setSubmitting(false);
    }
  };

  private setSubmitting(submitting: boolean): void {
    if (!this.submitButton) return;
    this.submitButton.disabled = submitting;
    this.submitButton.style.opacity = submitting ? '0.65' : '1';
  }

  private setStatus(message: string, error = false): void {
    if (!this.statusElement) return;
    this.statusElement.textContent = message;
    this.statusElement.style.color = error ? '#dc2626' : '#166534';
  }

  destroy(): void {
    this.form?.removeEventListener('submit', this.handleSubmit);
    this.cardElement?.unmount();
    this.root?.remove();
    this.stripe = null;
    this.cardElement = null;
    this.root = null;
    this.form = null;
  }
}
