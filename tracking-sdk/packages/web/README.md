# @stillkinetic/web-sdk

Behavioral tracking + threshold-triggered Stripe billing for web apps and JS desktop apps (Electron, Tauri).

## Install

```bash
npm install @stillkinetic/web-sdk @stripe/stripe-js
```

`@stripe/stripe-js` is a peer dependency — install it alongside.

## Usage

```ts
import { StillKinetic } from '@stillkinetic/web-sdk';

const tp = new TrackPay({
  appId: 'app_123',
  apiKey: 'pk_app_abc',              // issued by the platform dashboard
  apiBaseUrl: 'https://api.yourplatform.com',
  stripePublishableKey: 'pk_live_...',
  endUserId: currentUser.id,
  trackedMetrics: ['stay_duration', 'scroll_length'], // pick any subset of the 5
});

tp.start();

// ... later, e.g. when a "you're nearing your free usage" banner shows:
const result = await tp.setupBilling('#card-container', {
  amountCents: 5000,   // $50.00
  period: 'monthly',
});

if (!result.success) {
  console.error(result.error);
}

// On unmount / route change:
tp.stop();
```

`setupBilling` must be called once per end user before the backend will fire any charge for them — this is the single consent screen in the whole flow. It mounts a Stripe Card Element into the DOM node matching `containerSelector`, so make sure that element exists first, e.g.:

```html
<div id="card-container"></div>
```

## Notes

- All five metrics (`press_count`, `scroll_length`, `scroll_speed`, `type_speed`, `stay_duration`) are tracked passively; only the ones listed in `trackedMetrics` are enabled.
- The backend re-validates `trackedMetrics` against the app's subscription tier and will ignore any metric the tier doesn't allow — the SDK does not enforce this client-side.
- Charges never fire from this package directly. It only reports metrics and handles the one-time card bind; the threshold engine and all Stripe charge calls live server-side (see the `platform` app).
- Each `start()` creates a fresh visit identifier. Cumulative usage resets between visits, so 2.5 minutes before leaving plus 2 minutes after returning does not reach a 3-minute threshold. Call `getAccessStatus(metric)` before rendering protected content, or handle `onAccessDecision`; when it reports `cap_reached`, hide/lock the content and show its message.
