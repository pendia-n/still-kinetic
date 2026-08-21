# @stillkinetic/api-only-sdk

Headless StillKinetic usage reporting for Node.js services, APIs, CLI applications, Cloudflare Workers, and MCP servers.

This package has no UI, DOM tracking, React dependency, or Stripe dependency. It reports explicit usage events to the StillKinetic management API.

## Install

```bash
npm install @stillkinetic/api-only-sdk
```

Node.js 18 or newer supplies the required global `fetch`. Other runtimes can provide a compatible `fetch` through the constructor.

## Usage

```ts
import { StillKineticApi } from '@stillkinetic/api-only-sdk';

const sk = new StillKineticApi({
  appId: 'app_123',
  apiKey: process.env.STILL_KINETIC_API_KEY!,
  apiBaseUrl: 'https://still-kinetic.example.com',
  endUserId: authenticatedUser.id,
  pageId: 'mcp:newsletter-agent',
});

await sk.init();

await sk.track({
  metric: 'search_count',
  value: 1,
});
```

You can override `endUserId` and `pageId` per event or submit up to 200 events at once:

```ts
await sk.trackBatch([
  { endUserId: 'john', pageId: 'agent:research', metric: 'search_count', value: 1 },
  { endUserId: 'mary', pageId: 'agent:research', metric: 'search_count', value: 1 },
]);
```

## Payment prerequisite

The API-only SDK cannot collect card details or authorize payments. Before events for an end user can create charges, that same `appId + endUserId` must complete the one-time card-and-cap flow through one of these UI packages:

- `@stillkinetic/web-sdk`
- `@stillkinetic/rn-sdk`
- `@stillkinetic/desktop-sdk`

After binding, the management backend looks up that user's Stripe customer, saved payment method, spending cap, and current period spend. If an event crosses a configured threshold and remains within the cap, the backend creates the off-session Stripe PaymentIntent.

If no card is bound, the backend records `skipped_no_card`. If the charge would exceed the cap, it records `skipped_cap_reached`.

## Important response behavior

`track()` confirms that the management ingestion API accepted the event. Threshold processing is asynchronous, so the response does not confirm whether a Stripe charge succeeded, failed, or was skipped.

Use `await sk.getAccessStatus('stay_duration')` before allowing the next API operation. `track()` also returns access decisions when the backend detects that the end user must stop or increase their cap. Supply a fresh `visitId` for each logical visit when cumulative metrics should reset between visits.

Only the fixed metrics enabled for the app are accepted. The current management backend does not support arbitrary custom metric names.
