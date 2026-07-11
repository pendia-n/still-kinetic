import Stripe from 'stripe';

export function getStripe(secretKey?: string): Stripe {
  const key = secretKey || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  // Use fetch-based HTTP client for Cloudflare Workers compatibility
  return new Stripe(key, {
    apiVersion: '2025-02-24.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export const PLATFORM_METADATA = { platform: 'still-kinetic' } as const;

export function platformFeeFraction(): number {
  return 0.25;
}
