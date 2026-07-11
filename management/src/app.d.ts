import type { D1Database } from '@cloudflare/workers-types';

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        STRIPE_SECRET_KEY: string;
        STRIPE_WEBHOOK_SECRET: string;
        STRIPE_PUBLISHABLE_KEY: string;
        JWT_SECRET: string;
        STRIPE_CONNECT_CLIENT_ID: string;
        APP_URL: string;
      };
      ctx: ExecutionContext;
      caches: CacheStorage;
    }
    interface Locals {
      userId?: string;
      role?: string;
    }
  }
}

export {};
