# TrackPay SDK

Two installable packages:

- `@trackpay/web-sdk` — for web apps and JS desktop apps (Electron/Tauri, since both embed a web runtime).
- `@trackpay/rn-sdk` — for React Native apps.

Both packages are pre-built to `dist/` (`.cjs.js`, `.esm.js`, `.d.ts`) via `tsup`, so any of the package managers below work identically — none of them need to compile TypeScript themselves.

## Install

```bash
# npm
npm install @trackpay/web-sdk
npm install @trackpay/rn-sdk

# pnpm
pnpm add @trackpay/web-sdk
pnpm add @trackpay/rn-sdk

# yarn
yarn add @trackpay/web-sdk
yarn add @trackpay/rn-sdk

# bun
bun add @trackpay/web-sdk
bun add @trackpay/rn-sdk

# deno (npm specifier, no separate install step needed)
import { TrackPay } from "npm:@trackpay/web-sdk";
```

Note: these package names (`@trackpay/...`) are placeholders — publish under your own npm scope/org before distributing. Nothing else in the code needs to change to rename them; update the `name` field in each `package.json`.

## Building from source

```bash
npm install        # installs workspace deps
npm run build       # builds both packages to packages/*/dist
```

## What each metric measures

| Metric | Unit | Meaning |
|---|---|---|
| `press_count` | count | Cumulative taps/clicks on the current page/screen |
| `scroll_length` | px | Cumulative absolute pixels scrolled on the current page/screen |
| `scroll_speed` | px/ms | Instantaneous scroll velocity, sampled per scroll event |
| `type_speed` | chars/min | Rolling typing speed across any text input on the page/screen |
| `stay_duration` | ms | Cumulative *active* (foregrounded, visible) time on the page/screen |

Third-party apps select which of these five to track via `trackedMetrics` in the config — see each package's own README for wiring details. Which metrics an app is *allowed* to select is enforced server-side based on their subscription tier (see the platform app).

## Billing model (how a charge actually fires)

1. Host app calls `sender`/tracker hooks — these only ever send raw metric readings to your backend. No card is charged by the SDK directly.
2. Your backend (the platform app in this delivery) runs the threshold engine: compares aggregated metrics per end user against the app owner's configured thresholds.
3. The **first** time a threshold would be crossed for a given end user, the SDK's `setupBilling()` (web) or `<CardBindScreen>` (RN) must have already been used to bind a card and set a spending cap — this is a one-time screen, not a per-charge prompt.
4. Every threshold crossing after that fires a server-side, off-session Stripe `PaymentIntent` with `application_fee_amount` — no further UI, no repeated consent prompts, and the cap is enforced before the charge fires, not after.

Full backend logic is in the companion `platform` app.
