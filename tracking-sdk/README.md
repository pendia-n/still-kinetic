# StillKinetic SDK

Four installable packages:

- `@stillkinetic/web-sdk` — browser applications.
- `@stillkinetic/rn-sdk` — React Native mobile applications.
- `@stillkinetic/desktop-sdk` — Electron, Tauri, and other HTML WebView desktop applications.
- `@stillkinetic/api-only-sdk` — headless servers, APIs, CLI applications, and MCP agents.

All packages are pre-built to `dist/` (`index.js`, `index.mjs`, `index.d.ts`) via `tsup`, so consumers do not need to compile their TypeScript sources.

## Install

```bash
# npm
npm install @stillkinetic/web-sdk
npm install @stillkinetic/rn-sdk
npm install @stillkinetic/desktop-sdk
npm install @stillkinetic/api-only-sdk

# pnpm
pnpm add @stillkinetic/web-sdk
pnpm add @stillkinetic/rn-sdk
pnpm add @stillkinetic/desktop-sdk
pnpm add @stillkinetic/api-only-sdk

# yarn
yarn add @stillkinetic/web-sdk
yarn add @stillkinetic/rn-sdk
yarn add @stillkinetic/desktop-sdk
yarn add @stillkinetic/api-only-sdk

# bun
bun add @stillkinetic/web-sdk
bun add @stillkinetic/rn-sdk
bun add @stillkinetic/desktop-sdk
bun add @stillkinetic/api-only-sdk

# deno (npm specifier, no separate install step needed)
import { StillKinetic } from "npm:@stillkinetic/web-sdk";
```

## Building from source

```bash
npm install        # installs workspace deps
npm run build       # builds all packages to packages/*/dist
```

## Automatically tracked web and React Native metrics

| Metric | Unit | Meaning |
|---|---|---|
| `press_count` | count | Cumulative taps/clicks on the current page/screen |
| `scroll_length` | px | Cumulative absolute pixels scrolled on the current page/screen |
| `scroll_speed` | px/ms | Instantaneous scroll velocity, sampled per scroll event |
| `type_speed` | chars/min | Rolling typing speed across any text input on the page/screen |
| `stay_duration` | ms | Cumulative *active* (foregrounded, visible) time on the page/screen |

Web and React Native apps select which of these metrics to track via `trackedMetrics`. The API-only SDK may explicitly report any fixed metric enabled for the app. The management backend always re-validates metrics against the developer's selected tier and configuration.

## Billing model (how a charge actually fires)

1. Host app calls `sender`/tracker hooks — these only ever send raw metric readings to your backend. No card is charged by the SDK directly.
2. Your backend (the platform app in this delivery) runs the threshold engine: compares aggregated metrics per end user against the app owner's configured thresholds.
3. Before a threshold can charge a given end user, a UI SDK must bind that user's card and spending cap. Use `setupBilling()` on web, `<CardBindScreen>` on React Native, or the desktop billing panel. This is a one-time consent flow, not a per-charge prompt.
4. Every threshold crossing after that fires a server-side, off-session Stripe `PaymentIntent` with `application_fee_amount` — no further UI, no repeated consent prompts, and the cap is enforced before the charge fires, not after.

The API-only SDK only reports explicit usage. It can trigger threshold evaluation for an already-bound end user, but it cannot collect a card or authorize payment.

Full backend logic is in the companion `platform` app.
