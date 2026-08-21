# @stillkinetic/desktop-sdk

StillKinetic tracking and Stripe billing-consent UI for Electron, Tauri, and other npm-compatible desktop applications whose UI runs in an HTML WebView.

## Install

```bash
npm install @stillkinetic/desktop-sdk @stillkinetic/web-sdk @stripe/stripe-js
```

## Tracking

```ts
import { StillKineticDesktop } from '@stillkinetic/desktop-sdk';

const sk = new StillKineticDesktop({
  appId: 'app_123',
  apiKey: 'pk_app_abc',
  apiBaseUrl: 'https://still-kinetic.example.com',
  stripePublishableKey: 'pk_live_...',
  endUserId: currentUser.id,
  pageId: '/articles/desktop-billing',
  trackedMetrics: ['stay_duration', 'scroll_length'],
});

if (await sk.init()) sk.start();

// Stop and flush when the view is destroyed.
sk.stop();
```

The desktop tracker delegates DOM signals to `@stillkinetic/web-sdk`. This works in Electron and Tauri renderer/WebView processes. Do not run it from Electron's main process or a native Rust process because those runtimes do not provide the DOM APIs used by the trackers and Stripe.js.

## One-time card binding and spending cap

Add a container to the desktop view:

```html
<div id="stillkinetic-billing"></div>
```

Mount the framework-neutral billing panel:

```ts
const panel = await sk.mountBillingPanel('#stillkinetic-billing', {
  defaultCap: { amountCents: 500, period: 'weekly' },
  onComplete(result) {
    if (!result.success) console.error(result.error);
  },
});

// Later, when the view closes:
panel.destroy();
```

The panel performs this sequence only after the end user checks the consent box and submits:

1. Requests a Stripe SetupIntent from `/api/end-user/bind-card`.
2. Uses Stripe.js to collect and confirm the card.
3. Sends the resulting payment-method ID and the user's cap to `/api/end-user/config`.
4. Future metric thresholds are evaluated by the management backend and may create off-session PaymentIntents within that cap.

Card numbers never pass through or persist in the desktop application or StillKinetic D1. Stripe stores the card. StillKinetic stores the Stripe customer/payment-method references and the user's cap.

`StillKineticDesktop#getAccessStatus(metric)` returns the access decision used by the web facade. The desktop host must disable the relevant action/window and display the returned cap message when access is denied.

## Supported desktop runtimes

- Electron renderer process
- Tauri WebView frontend
- NW.js, Neutralino, Wails, and similar HTML/JavaScript desktop shells

Flutter, Dioxus native Rust, React Native Windows/macOS, Swift, and .NET applications require their own native adapter or an embedded HTML WebView. They cannot directly use this DOM package from native code.
