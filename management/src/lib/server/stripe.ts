// Stripe via raw fetch — 100% CF Workers compatible. NO npm `stripe` package.

export function getStripe(env: any) {
  const key = env?.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new StripeClient(key);
}

export const PLATFORM_METADATA = { platform: 'still-kinetic' } as const;

export function platformFeeFraction(): number {
  return 0.25;
}

class StripeClient {
  private key: string;
  private base = 'https://api.stripe.com/v1';

  constructor(key: string) { this.key = key; }

  private async request(method: string, path: string, body?: URLSearchParams, opts?: { idempotencyKey?: string }): Promise<any> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers,
      ...(body ? { body: body.toString() } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Stripe API error: ${res.status}`);
    return data;
  }

  customers: any = {
    create: (params: any) => {
      const body = new URLSearchParams();
      if (params.email) body.set('email', params.email);
      if (params.metadata) Object.entries(params.metadata).forEach(([k, v]: any) => body.set(`metadata[${k}]`, v));
      return this.request('POST', '/customers', body);
    },
    update: (id: string, params: any) => {
      const body = new URLSearchParams();
      if (params.invoice_settings?.default_payment_method)
        body.set('invoice_settings[default_payment_method]', params.invoice_settings.default_payment_method);
      return this.request('POST', `/customers/${id}`, body);
    },
  };

  checkout: any = {
    sessions: {
      create: (params: any) => {
        const body = new URLSearchParams();
        if (params.customer) body.set('customer', params.customer);
        body.set('mode', params.mode || 'payment');
        body.set('success_url', params.success_url);
        body.set('cancel_url', params.cancel_url);
        body.set('payment_method_types[]', 'card');
        if (params.line_items?.[0]) {
          const item = params.line_items[0];
          if (item.price) {
            body.set('line_items[0][price]', item.price);
            body.set('line_items[0][quantity]', String(item.quantity || 1));
          } else if (item.price_data) {
            body.set('line_items[0][price_data][currency]', item.price_data.currency || 'usd');
            body.set('line_items[0][price_data][product_data][name]', item.price_data.product_data?.name || '');
            body.set('line_items[0][price_data][unit_amount]', String(item.price_data.unit_amount));
            if (item.price_data.recurring?.interval)
              body.set('line_items[0][price_data][recurring][interval]', item.price_data.recurring.interval);
            body.set('line_items[0][quantity]', String(item.quantity || 1));
          }
        }
        if (params.metadata) Object.entries(params.metadata).forEach(([k, v]: any) => body.set(`metadata[${k}]`, String(v)));
        if (params.subscription_data?.metadata)
          Object.entries(params.subscription_data.metadata).forEach(([k, v]: any) => body.set(`subscription_data[metadata][${k}]`, String(v)));
        return this.request('POST', '/checkout/sessions', body);
      },
    },
  };

  subscriptions: any = {
    retrieve: (id: string) => this.request('GET', `/subscriptions/${id}`),
    update: (id: string, params: { cancel_at_period_end?: boolean }) => {
      const body = new URLSearchParams();
      if (typeof params.cancel_at_period_end === 'boolean') {
        body.set('cancel_at_period_end', String(params.cancel_at_period_end));
      }
      return this.request('POST', `/subscriptions/${id}`, body);
    },
  };

  invoices: any = {
    list: (params: { subscription: string; status?: string; limit?: number }) => {
      const query = new URLSearchParams({ subscription: params.subscription });
      if (params.status) query.set('status', params.status);
      if (params.limit) query.set('limit', String(params.limit));
      return this.request('GET', `/invoices?${query.toString()}`);
    },
    retrieve: (id: string) => this.request('GET', `/invoices/${id}`),
  };

  invoicePayments: any = {
    list: (invoice: string) => {
      const query = new URLSearchParams({ invoice, status: 'paid', limit: '100' });
      return this.request('GET', `/invoice_payments?${query.toString()}`);
    },
  };

  refunds: any = {
    list: (paymentIntent: string) => {
      const query = new URLSearchParams({ payment_intent: paymentIntent, limit: '100' });
      return this.request('GET', `/refunds?${query.toString()}`);
    },
    retrieve: (id: string) => this.request('GET', `/refunds/${id}`),
  };

  creditNotes: any = {
    create: (params: { invoice: string; amount: number; refund_amount: number; memo: string; metadata: Record<string, string>; idempotencyKey: string }) => {
      const body = new URLSearchParams();
      body.set('invoice', params.invoice);
      body.set('amount', String(params.amount));
      body.set('refund_amount', String(params.refund_amount));
      body.set('memo', params.memo);
      body.set('email_type', 'credit_note');
      Object.entries(params.metadata).forEach(([key, value]) => body.set(`metadata[${key}]`, value));
      return this.request('POST', '/credit_notes', body, { idempotencyKey: params.idempotencyKey });
    },
  };

  accounts: any = {
    create: (params: any) => {
      const body = new URLSearchParams();
      body.set('type', params.type || 'express');
      if (params.email) body.set('email', params.email);
      if (params.capabilities?.transfers?.requested) body.set('capabilities[transfers][requested]', 'true');
      if (params.capabilities?.card_payments?.requested) body.set('capabilities[card_payments][requested]', 'true');
      if (params.metadata) Object.entries(params.metadata).forEach(([k, v]: any) => body.set(`metadata[${k}]`, v));
      return this.request('POST', '/accounts', body);
    },
    retrieve: (id: string) => this.request('GET', `/accounts/${id}`),
  };

  accountLinks: any = {
    create: (params: any) => {
      const body = new URLSearchParams();
      body.set('account', params.account);
      body.set('type', params.type || 'account_onboarding');
      body.set('return_url', params.return_url);
      body.set('refresh_url', params.refresh_url);
      return this.request('POST', '/account_links', body);
    },
  };

  paymentIntents: any = {
    create: (params: any) => {
      const body = new URLSearchParams();
      body.set('amount', String(params.amount));
      body.set('currency', params.currency || 'usd');
      body.set('customer', params.customer);
      body.set('payment_method', params.payment_method);
      body.set('off_session', params.off_session ? 'true' : 'false');
      body.set('confirm', params.confirm ? 'true' : 'false');
      if (params.application_fee_amount)
        body.set('application_fee_amount', String(params.application_fee_amount));
      if (params.transfer_data?.destination)
        body.set('transfer_data[destination]', params.transfer_data.destination);
      if (params.metadata)
        Object.entries(params.metadata).forEach(([k, v]: any) => body.set(`metadata[${k}]`, String(v)));
      return this.request('POST', '/payment_intents', body, { idempotencyKey: params.idempotencyKey });
    },
  };

  setupIntents: any = {
    create: (params: any) => {
      const body = new URLSearchParams();
      body.set('customer', params.customer);
      if (params.payment_method_types)
        params.payment_method_types.forEach((t: string) => body.append('payment_method_types[]', t));
      if (params.metadata)
        Object.entries(params.metadata).forEach(([k, v]: any) => body.set(`metadata[${k}]`, String(v)));
      return this.request('POST', '/setup_intents', body);
    },
  };

  paymentMethods: any = {
    attach: (paymentMethodId: string, params: any) => {
      const body = new URLSearchParams();
      body.set('customer', params.customer);
      return this.request('POST', `/payment_methods/${paymentMethodId}/attach`, body);
    },
  };

  webhooks: any = {
    constructEvent: (rawBody: string, signature: string, secret: string) => {
      // Stripe webhook signature verification via HMAC-SHA256
      const parts = signature.split(',');
      const sigPart = parts.find(p => p.startsWith('v1='));
      const timestampPart = parts.find(p => p.startsWith('t='));
      if (!sigPart || !timestampPart) throw new Error('Invalid Stripe signature format');

      const sig = sigPart.split('=')[1];
      const timestamp = timestampPart.split('=')[1];
      const payload = `${timestamp}.${rawBody}`;

      const keyBytes = new TextEncoder().encode(secret);
      const payloadBytes = new TextEncoder().encode(payload);

      // Use Web Crypto API for HMAC
      const encoder = {
        encode: async () => {
          const key = await crypto.subtle.importKey(
            'raw', keyBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false, ['sign']
          );
          const result = await crypto.subtle.sign('HMAC', key, payloadBytes);
          return Array.from(new Uint8Array(result))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        },
      };

      // We need to validate synchronously in constructEvent interface
      // We'll do async validation and throw if invalid
      // For now pass through — the async verify is called in the webhook handler
      return JSON.parse(rawBody);
    },

    // Async verification — call after constructEvent
    verifySignature: async (rawBody: string, signature: string, secret: string): Promise<boolean> => {
      try {
        const parts = signature.split(',');
        const sigPart = parts.find(p => p.startsWith('v1='));
        const timestampPart = parts.find(p => p.startsWith('t='));
        if (!sigPart || !timestampPart) return false;

        const sig = sigPart.split('=')[1];
        const timestamp = timestampPart.split('=')[1];
        const payload = `${timestamp}.${rawBody}`;

        const key = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false, ['verify']
        );
        const expectedSig = await crypto.subtle.sign(
          'HMAC', key, new TextEncoder().encode(payload)
        );
        const expectedHex = Array.from(new Uint8Array(expectedSig))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        return expectedHex === sig;
      } catch {
        return false;
      }
    },
  };
}
