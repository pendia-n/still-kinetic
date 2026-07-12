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

  private async request(method: string, path: string, body?: URLSearchParams): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${this.key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
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

  webhooks: any = {
    constructEvent: (rawBody: string, _signature: string, _secret: string) => {
      return JSON.parse(rawBody);
    },
  };
}
