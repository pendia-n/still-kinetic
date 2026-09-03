# Still Kinetic

## What the app is

Still Kinetic is a developer platform for adding measurable, usage-triggered billing to software products. A developer installs one of the Still Kinetic SDKs, chooses the product interactions they want to meter, configures a threshold and charge for each selected metric, and connects a Stripe account. Still Kinetic then receives usage events, evaluates thresholds, enforces the end user's spending cap, and routes successful payments through Stripe Connect.

The platform has two main parts:

- A Cloudflare-hosted management application where developers register applications, choose a plan, configure metrics and thresholds, complete Stripe Connect onboarding, manage their subscription, and review earnings.
- An SDK family for browser applications, React Native applications, Electron or Tauri desktop applications, and API-only environments such as servers, command-line tools, and MCP agents.

The supported metric model covers cumulative activity—such as active stay duration, presses, scrolling distance, form submissions, searches, shares, downloads, media-watch duration, and pointer distance—as well as instantaneous measurements such as scrolling or typing speed. Developers decide which supported metrics are relevant to their product and where tracking starts and stops.

Still Kinetic is not an end-user prepaid wallet and does not create a recurring subscription for the developer's customers. End users complete a one-time card-binding and consent flow, choose a weekly or monthly spending cap, and may then be charged off-session when configured usage thresholds are reached. The developer separately pays Still Kinetic a weekly platform subscription while using the service.

## Why it was created

Many software products do not fit a simple monthly subscription or one-time purchase. A reader may pay after actively consuming an article, an education product may charge after a lesson is meaningfully used, a media application may charge for watch time, and an agent or API may charge after completing a measurable operation.

Building this safely requires much more than counting events. A developer otherwise has to create tracking adapters, identify each user and context, aggregate measurements correctly, prevent duplicate charges, collect payment consent, enforce spending limits, handle off-session payments, connect seller accounts, calculate a platform fee, and maintain a dashboard for configuration and reconciliation.

Still Kinetic was created to turn that repeated infrastructure work into an installable and configurable platform. Its purpose is to let developers test and operate usage-triggered business models without rebuilding the same metering and Stripe Connect machinery for every application and runtime.

## The user problem it solves

For developers, the central problem is the gap between “this action is measurable” and “this action can be billed safely and operated as a product.” Analytics tools can report that something happened, and payment tools can collect money, but the developer still has to connect those two systems and define the rules between them.

Still Kinetic closes that gap by providing:

- Consistent metric names and units across supported environments.
- Selective tracking so billing can be limited to a particular article, screen, workflow, agent operation, or other intended context.
- Visit-scoped cumulative tracking, so leaving and returning can begin a fresh visit instead of silently combining unrelated sessions.
- Repeated threshold units, so cumulative usage can trigger more than one legitimate charge while using distinct idempotency identities.
- Server-side validation of applications, subscriptions, enabled metrics, thresholds, cards, Stripe Connect state, and spending caps.
- Access decisions that a host application can use to show a cap banner, lock protected content, or ask the end user to increase their cap.
- A headless SDK for products where usage originates on a server rather than in a graphical interface.

For end users, the problem is uncertainty. Usage-based charging can feel unpredictable if the product does not explain what is measured, how much a threshold costs, or how spending is limited. Still Kinetic addresses the payment side of that uncertainty by requiring a saved payment method and an explicit spending cap before usage charges can proceed. The host developer remains responsible for presenting the pricing rule clearly and for deciding how their interface responds when access is denied.

## How it reduces stress

Still Kinetic is designed to reduce stress through assimilation, assurance, and practical next steps.

### Assimilation

The platform turns a multi-system billing flow into a sequence a developer can understand:

1. Register an application and choose the relevant metrics.
2. Configure a threshold value and charge amount for each metric.
3. Activate the developer subscription and complete Stripe Connect onboarding.
4. Install the appropriate SDK and start it only in the billable context.
5. Let each end user save a card and choose a spending cap.
6. Check access decisions and respond in the host application when the cap or another payment prerequisite blocks further use.

The dashboard and SDKs share the same metric vocabulary, which reduces the mental translation normally required between product code, analytics events, billing rules, and payment records.

### Assurance

Still Kinetic provides safeguards at several boundaries:

- Card details are collected by Stripe rather than stored in Still Kinetic's D1 database.
- The backend verifies the API key, active developer subscription, selected metric, configured threshold, connected Stripe account, end-user payment method, and spending cap before creating a charge.
- Cumulative threshold charges use explicit charge units and unit-specific idempotency keys to avoid treating every repeated threshold as the same payment.
- Backgrounded or hidden web and mobile views do not continue accumulating active stay duration.
- The API reports access states such as payment required, cap reached, inactive subscription, or incomplete Stripe Connect onboarding.
- The host application keeps control over what is blocked; Still Kinetic supplies the billing decision but does not secretly rewrite the developer's product interface.

These controls do not remove the developer's obligation to explain pricing, obtain appropriate consent, test the integration, handle exceptional payment states, and comply with applicable law. They do provide a clearer and more auditable foundation than an ad hoc client-side charging implementation.

### Practical next steps

When something prevents billing, the system is intended to produce an actionable state instead of leaving the developer to infer what happened. A developer can direct the appropriate person toward the next step:

- `payment_required`: ask the end user to save a card and set a cap.
- `cap_reached`: show a banner or wall and let the end user increase the cap before continuing.
- `subscription_inactive`: ask the application owner to reactivate the weekly Still Kinetic subscription.
- `connect_required`: ask the application owner to complete Stripe Connect onboarding.
- `allowed`: permit the relevant content or action and continue reporting usage.

This makes the product easier to operate because both developers and end users can understand why an action is unavailable and what must happen next.

## Why it is unique

Still Kinetic combines behavioral metering, threshold evaluation, payment consent, spending-cap enforcement, access decisions, Stripe Connect routing, and developer subscription management in one cross-platform system.

Its distinguishing idea is not merely “usage-based billing.” It is the ability to make product interactions themselves configurable billing inputs across web, mobile, desktop, server, CLI, and agent environments. The same management model can represent active reading time, interaction counts, movement distance, media duration, or explicit API operations without forcing every developer to build a separate billing backend for each runtime.

The platform also separates responsibilities deliberately:

- SDKs observe or submit usage and surface access decisions.
- The management backend owns threshold and payment enforcement.
- Stripe owns card data and payment processing.
- The developer's application owns the user experience, pricing explanation, and final content or feature wall.

That separation gives developers a reusable billing layer while preserving control over their product. It is especially suited to teams experimenting with interaction-based pricing, usage-gated content, paid agent operations, or other models that sit between conventional analytics and conventional subscriptions.
