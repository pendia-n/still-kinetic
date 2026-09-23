# Still Kinetic SDK Tracking and Billing Hardening Plan

Date: 2026-09-08  
Scope: `@stillkinetic/web-sdk`, `@stillkinetic/rn-sdk`, `@stillkinetic/desktop-sdk`, `@stillkinetic/api-only-sdk`, and the management backend paths that receive, aggregate, gate, and charge their events.

## Executive decision

Keep the existing closed set of 16 predefined metrics. Do not remove them and do not introduce arbitrary/custom event names.

The correct upgrade is additive hardening:

1. make every automatically measured metric obey a precise cross-platform definition;
2. implement the currently declared-but-not-automatically-tracked metrics where the runtime can genuinely observe them;
3. keep API-only broad, but describe it as a transport for developer-supplied measurements rather than an automatic tracker;
4. validate identity, units, ranges, event freshness, ordering, and duplicates at ingestion;
5. make aggregation, cap reservation, charge creation, and charge-unit advancement concurrency-safe;
6. make Stripe outcomes recoverable through a durable ledger and webhooks;
7. give host applications an enforceable access state before they allow more billable usage.

This plan does not claim that client telemetry is fraud-proof. Web, mobile, and desktop devices are controlled by the end user. The goal is internally consistent, tamper-resistant, duplicate-safe billing evidence with explicit limitations.

## Current architecture

```text
Web SDK ───────────────┐
React Native SDK ──────┼─> POST /api/events ─> access check ─> aggregate
Desktop SDK -> Web SDK ┤                                  └─> threshold
API-only SDK ──────────┘                                      └─> Stripe PaymentIntent

UI-capable SDK ─> SetupIntent/card consent ─> spending cap in D1
Developer dashboard ─> weekly Stripe subscription + Connect onboarding
```

The SDKs do not directly create usage charges. They submit fixed metric measurements. The management backend decides whether a threshold was crossed and creates the off-session Stripe Connect PaymentIntent.

## Rating system

- **Good**: automatically measured with an appropriate runtime signal, but still client telemetry.
- **Fair**: automatically measured, with material lifecycle, unit, or sampling weaknesses.
- **Weak**: implementation exists but can currently mismeasure normal use.
- **Manual only**: accepted as a fixed metric, but the developer must calculate and submit it.
- **Not implemented**: declared in the SDK/backend type list but no automatic tracker exists on that surface.
- **Not naturally observable**: that runtime cannot independently sense the metric; it can only receive a measurement produced elsewhere.

## Current metric coverage across all four SDKs

`Desktop` below means an Electron/Tauri/NW.js-style renderer or HTML WebView. The existing desktop SDK does not run as a native Electron main-process, Rust, Swift, Flutter, .NET, or Dioxus sensor.

| Fixed metric | Intended unit/meaning | Web SDK | React Native SDK | Desktop SDK | API-only SDK | Current confidence |
|---|---|---|---|---|---|---|
| `press_count` | count of deliberate pointer/touch presses | Automatic via every document `pointerdown` | Automatic only where returned `onPressIn` is attached | Same as WebView web tracker | Manual value submission | Fair |
| `scroll_length` | absolute travelled scroll distance | Automatic, `abs(deltaY)` in CSS px | Automatic, `abs(contentOffset.y delta)` in RN logical units | Same as WebView web tracker | Manual value submission | Fair |
| `scroll_speed` | instantaneous distance divided by elapsed ms | Automatic per animation-frame sample, px/ms | Automatic per delivered `onScroll`, logical-unit/ms | Same as WebView web tracker | Manual value submission | Fair-to-weak |
| `stay_duration` | active foreground duration in ms | Automatic five-second deltas | Automatic five-second deltas while hook is mounted | Same as WebView web tracker | Manual value submission | Weak currently |
| `type_speed` | typing speed in characters per minute | Automatic estimate from keydown timestamps | Automatic estimate from text-change timestamps | Same as WebView web tracker | Manual value submission | Weak |
| `swipe_count` | count of completed swipe gestures | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `pinch_zoom_count` | count of completed pinch gestures | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `long_press_count` | count of completed long presses | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `form_submit_count` | count of accepted form submissions | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `tab_switch_count` | count of qualifying tab/screen switches | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `search_count` | count of accepted search submissions | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `video_play_count` | count of qualifying transitions into playback | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `video_watch_duration` | active playback duration in ms | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `file_download_count` | count of confirmed download starts/completions, definition presently unspecified | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `share_count` | count of successful share actions, definition presently unspecified | Not implemented | Not implemented | Not implemented | Manual value submission | Manual only |
| `mouse_distance` | accumulated pointer travel distance in CSS px | Not implemented | Generally inapplicable to touch-only devices; possible on pointer-capable RN targets | Not implemented despite desktop suitability | Manual value submission | Manual only |

### Coverage conclusion

- Web automatically implements 5 of 16 fixed metrics.
- React Native exposes handlers/logic for the same 5, but only four are conditionally returned to the host; stay tracking runs internally.
- Desktop automatically provides exactly the Web SDK's coverage because it wraps that package.
- API-only automatically measures none. It transports explicit values for all 16 fixed metrics.
- Eleven declared metrics currently have no automatic tracker in any UI SDK.

## Metric-by-metric hardening

### `press_count`

Current behavior:

- Web counts every document-level `pointerdown`, including controls unrelated to the developer's intended billable area.
- React Native counts only components to which the developer attaches `onPressIn`.
- A press can be counted even if the eventual action is cancelled or fails.

Enhancements:

- Web: support an explicit root element and include/exclude selectors so only the configured page region is measured.
- Web: choose and document one semantic event: `pointerup`, trusted `click`, or successful activation. `pointerdown` is earliest but least certain.
- Web: ignore non-primary buttons, synthetic/non-trusted events where appropriate, disabled controls, repeated pointer IDs, and movement that becomes a drag.
- React Native: compose with an existing handler rather than requiring replacement; deduplicate rapid duplicate callbacks; define accessibility/keyboard activation behavior.
- All: emit one stable event ID per counted press and cap impossible rates server-side.

Recommended billing confidence after hardening: **medium**, suitable only when the commercial rule really is “one observed press,” not “one successful business operation.”

### `scroll_length`

Current behavior:

- Both automatic implementations add absolute distance deltas, so scrolling down and back up both count.
- Web samples at animation-frame cadence.
- React Native depends on the host's `scrollEventThrottle` and reports React Native logical coordinates, which are not guaranteed to equal browser CSS pixels across device densities.

Enhancements:

- Define the unit as logical display pixels/points, or normalize to CSS-equivalent px. Do not call both physical pixels without conversion.
- Clamp jumps caused by restoration, programmatic scrolling, layout shifts, list virtualization, anchor navigation, or content replacement.
- Optionally count only direct user gesture intervals, not programmatic scrolls.
- Track nested/selected scroll containers instead of only `window.scrollY` on web.
- Reset sampler baselines on focus, visibility changes, route transitions, and visit changes.
- Emit accumulated distance at a controlled interval instead of one event per sampled movement.

Recommended billing confidence after hardening: **medium-low** because rendering and device differences remain.

### `scroll_speed`

Current behavior:

- It is classified as instantaneous.
- The backend charges when a submitted sample reaches the threshold, with a 60-second cooldown.
- Sampling cadence differs substantially between browser animation frames and React Native callbacks.

Enhancements:

- Specify whether the value is peak, mean, median, or percentile speed over a fixed observation window.
- Prefer a rolling 500–1,000 ms window and minimum travel distance; reject single-frame spikes.
- Use monotonic clocks for local deltas.
- Normalize platform units.
- Include the sample window duration and number of samples internally so the SDK can reject low-quality estimates before submission.
- Make the backend cooldown explicit in dashboard help and access responses.

Recommended billing confidence after hardening: **low-to-medium**. Speed is highly sensitive to sampling and is less suitable for direct billing than cumulative count/duration metrics.

### `stay_duration`

Current behavior and defects:

- Web correctly closes a segment on hidden/blur, but every five-second report unconditionally reopens the segment. Therefore a report tick can restart timing while the page is still hidden or unfocused.
- React Native closes on background/inactive, but its report also unconditionally reopens the segment. A timer tick can restart timing while the application remains backgrounded.
- React Native measures component mount lifetime, not navigation focus. Screens retained in a navigator can continue accumulating.
- Web creates a fresh visit on `start()`; React Native creates a visit per hook mount; API-only requires the caller to supply a fresh `visitId`.
- Client timers can be throttled, suspended, modified, replayed, or blocked.

Enhancements:

- Maintain an explicit state machine: `active`, `hidden`, `blurred`, `background`, `unfocused`, `stopped`.
- Reopen a segment only when all required active conditions are true.
- Use monotonic time for elapsed segments and wall-clock time only for event timestamps.
- React Native: accept an explicit `isScreenFocused`/navigation lifecycle signal and pause immediately on blur.
- Web: handle page lifecycle events (`pagehide`, persisted `pageshow`, freeze/resume where available) and BFCache correctly.
- Clamp any single reported duration delta to a small maximum consistent with the report interval plus tolerance.
- Add sequence numbers and event IDs so delayed/replayed deltas cannot count twice.
- Preserve fresh-visit semantics: leaving and returning starts from zero for threshold aggregation.
- Define whether temporary blur within one visit pauses or ends the visit; recommendation: pause on blur, end only on route/resource lifecycle stop.

Recommended billing confidence after hardening: **medium for ordinary use, never fraud-proof**. This should be described as active foreground time measured by the client.

### `type_speed`

Current behavior and defects:

- Web treats Backspace and Enter as character-producing keys and counts key events rather than actual text changes.
- React Native pushes one timestamp per `onChangeText` callback regardless of whether one character, a pasted paragraph, autocorrect, composition, or deletion changed the text.
- Both divide event count by elapsed window time, so the displayed unit “characters per minute” is not consistently true.

Enhancements:

- Measure grapheme-count deltas rather than callback/key counts.
- Define treatment of deletion, paste, autofill, dictation, IME composition, autocorrect, and programmatic updates.
- Recommended rule: count positive user-originated grapheme additions; exclude paste/autofill/programmatic replacement unless explicitly documented.
- Use a minimum observation window and character count before emitting.
- Submit a rolling aggregate at a controlled cadence instead of every input change.
- Clamp implausible CPM values and treat speed as instantaneous with documented cooldown behavior.

Recommended billing confidence after hardening: **low-to-medium** due to keyboard, IME, accessibility, and input-method variation.

### `swipe_count`

Additive implementation:

- Web/desktop: Pointer Events gesture recognizer with minimum distance, maximum duration, direction consistency, and one completion per pointer sequence.
- React Native: PanResponder/Gesture Handler adapter with equivalent logical thresholds.
- Do not count scrolling and swiping twice when one gesture drives a scroll surface; the developer must select the intended gesture scope.
- API-only remains explicit transport for a swipe count measured by another runtime.

Expected confidence: **medium** after a shared gesture specification.

### `pinch_zoom_count`

Additive implementation:

- Count one completed two-pointer scale gesture after a minimum scale change.
- Do not count every movement callback.
- Distinguish browser viewport zoom, element/content pinch gestures, and programmatic zoom.
- React Native needs an explicit gesture surface integration.
- Desktop support depends on trackpad/touch gesture events available in the renderer.

Expected confidence: **medium-low** because platform gesture APIs vary.

### `long_press_count`

Additive implementation:

- Define minimum hold duration, movement tolerance, cancellation, and one count per pointer/touch lifecycle.
- Cancel on scroll, drag, multitouch, focus loss, background, or component unmount.
- Use the same default duration and tolerance in web, React Native, and desktop logical units.

Expected confidence: **medium**.

### `form_submit_count`

Additive implementation:

- Web/desktop can observe trusted `submit` events inside a configured root.
- Specify whether to count attempted submit, browser-valid submit, or developer-confirmed successful submit. Automatic DOM observation can only reliably prove an attempt.
- React Native has no universal form event; provide a wrapper/helper the developer calls from the existing submit handler, still using this fixed metric.
- Do not imply that a client event proves backend success.

Expected confidence: **medium for attempts**, **manual integration required for successful submits**.

### `tab_switch_count`

Additive implementation:

- Define this as switching an application-owned tab/screen, not browser tab visibility, unless the product intentionally wants browser visibility transitions.
- Web/desktop application tabs require explicit binding to tab controls or router changes.
- React Native requires navigation state/focus integration.
- Debounce redirects, nested navigators, and rapid programmatic transitions.

Expected confidence: **medium after the definition is fixed**.

### `search_count`

Additive implementation:

- Count a deliberate search submission, not each keystroke.
- Web/desktop: bind to configured search forms/controls.
- React Native: helper for `onSubmitEditing` or the app's search callback.
- Deduplicate retries and repeated submission of the same query within a short configurable interval.
- Avoid sending query text; only send count metadata needed for billing.

Expected confidence: **medium**.

### `video_play_count`

Additive implementation:

- Web/desktop: observe media transition from paused to playing; distinguish initial play, resume, replay, autoplay, and programmatic play.
- Recommended default: count a play only after a minimum continuous playback duration, and at most once per media item per visit unless replay billing is intentionally enabled in the fixed behavior.
- React Native: provide adapters around common player callbacks rather than assuming one universal video component.

Expected confidence: **medium**.

### `video_watch_duration`

Additive implementation:

- Accumulate only while media is actually playing, sufficiently visible, application is foregrounded, playback rate is valid, and the screen is focused.
- Use media playback-time deltas as the primary meter, cross-checked against monotonic wall time; do not count buffering, seeking, paused time, or background playback unless explicitly intended.
- Clamp discontinuities caused by seek or source replacement.
- Reuse duration event IDs, sequence numbers, lifecycle state, and duplicate protection.

Expected confidence: **medium**, usually stronger than generic stay duration when tied to a real media clock.

### `file_download_count`

Additive implementation:

- A browser SDK cannot reliably prove that a file completed downloading after navigation leaves the page.
- Web/desktop automatic tracking can count a configured download initiation only.
- API-only is the preferable reporter when the developer backend successfully authorizes or streams the fixed download operation.
- Define initiation versus completion in dashboard copy; do not mix them under one threshold.

Expected confidence: **low for browser completion, medium-to-high for server-reported delivery**.

### `share_count`

Additive implementation:

- Web: use the Web Share API result where available; a resolved call does not always prove that a recipient received content.
- React Native: use the platform share result and normalize cancelled/dismissed outcomes.
- Desktop: support renderer share integrations where available; otherwise explicit fixed-metric reporting.
- Count successful share-sheet completion according to the platform response, not merely opening the sheet.

Expected confidence: **medium-low**.

### `mouse_distance`

Additive implementation:

- Web/desktop: accumulate Euclidean distance from pointer-move coordinates, only for the primary mouse/pointer within a configured active root.
- Ignore touch pointers unless the metric definition intentionally includes them.
- Clamp teleport-like jumps, pointer-lock transitions, display changes, and stale resumed coordinates.
- Batch local distance rather than sending every move.
- React Native touch-only targets should not pretend to measure mouse distance; pointer-capable desktop RN targets can add a specific adapter.

Expected confidence: **medium-low** and strongly device-dependent.

## Web SDK hardening plan

### P0 correctness

- Fix the stay timer so report ticks do not restart hidden or blurred sessions.
- Track visibility and focus independently; active means visible **and** focused.
- Fix unload/beacon authentication. The sender appends `apiKey` to the query string, while the current ingestion endpoint reads only request body or `X-Api-Key`.
- Store removable references for `beforeunload` and `visibilitychange` sender listeners; prevent listener/timer multiplication across repeated starts.
- Mark sender stopped state, set timer to `null`, and make `start()`/`stop()` safely repeatable.
- Do not silently lose exhausted retries without exposing an `onDeliveryFailure` callback and diagnostics.
- Add stable batch and event IDs, local sequence numbers, and bounded retry persistence.

### P1 measurement consistency

- Add scoped roots/selectors for press, scroll, typing, gesture, media, and pointer metrics.
- Add the missing automatic trackers that the browser can honestly observe.
- Use monotonic elapsed time.
- Normalize units and clamp abnormal samples.
- Handle SPA route/resource lifecycle explicitly rather than relying only on `window.location.pathname` captured indirectly.
- Expose status: initializing, active, paused, stopped, subscription inactive, delivery degraded.

### P1 billing integration

- Require an access preflight before starting/resuming a billable metric when the cached decision is missing or stale.
- Pause trackers immediately after `cap_reached`, `payment_required`, `connect_required`, or inactive subscription responses.
- Provide a callback for approaching cap, not only denial.
- Expose delivery acknowledgement separately from charge status.
- Improve card setup validation and error details; ensure cap changes do not silently reset spend without an explicit backend rule.

## React Native SDK hardening plan

### P0 correctness

- Fix background duration reopening in the five-second report callback.
- Tie stay duration to actual navigation focus, not merely component mount.
- Only run stay tracking when `stay_duration` is enabled and the developer subscription is confirmed active.
- Move BatchSender lifecycle into an effect and stop it on unmount; current construction/start occurs during render and has no corresponding hook cleanup.
- Handle configuration/user changes by flushing and replacing the sender and visit identity safely.
- Export `CardBindScreen`; the README imports it from the package root, but the current root index does not export it.
- Return `loading`, `subscriptionActive`, access state, and explicit stop/pause controls from the hook.

### P1 measurement consistency

- Add fixed-metric adapters for gestures, navigation/tab changes, media, sharing, search submission, and forms where React Native has no universal global signal.
- Normalize RN logical coordinates versus browser CSS-pixel wording.
- Compose returned callbacks with host callbacks safely.
- Account for app inactive/background, screen blur, fast refresh, strict-mode rendering, orientation change, and virtualized-list jumps.
- Replace callback-count typing speed with grapheme delta measurement.

### P1 delivery and billing

- Persist bounded unsent batches across temporary background/network failure using a host-provided storage adapter.
- Attach event IDs and sequence numbers before persistence.
- Surface terminal delivery failure.
- Pause billable handlers after a denied access response.
- Add explicit card-consent text/version receipt, cap validation limits, payment-method replacement, and revoke flow.

## Desktop SDK hardening plan

### Current boundary

The package is a WebView facade, not a general native desktop SDK. Its automatic quality is exactly the Web SDK's quality, plus desktop lifecycle complications.

### P0 correctness

- Inherit all Web SDK timing, batching, identity, and access fixes.
- Treat window minimized, hidden, suspended, unfocused, renderer frozen, and machine sleep as paused states.
- Detect large monotonic gaps after system sleep and do not charge them as active duration.
- Document renderer-only operation prominently; `detectDesktopRuntime()` returning `webview` on a non-browser context does not make that context supported.
- Keep Stripe.js and payment collection confined to a secure renderer/WebView context.

### P1 desktop-specific tracking

- Add scoped pointer/mouse-distance measurement, wheel/scroll normalization, keyboard/typing handling, and media lifecycle support.
- Add optional host lifecycle bridges for Electron and Tauri so the renderer receives authoritative minimize/suspend/focus events.
- Avoid collecting from privileged preload/main-process contexts.
- Provide a transport-only companion pattern for native hosts that measure one of the same fixed metrics outside the DOM. This must not introduce custom metric names.

### P1 billing panel

- Add explicit consent version, merchant/app name, metric summary, cap period, and explanation of off-session charges.
- Add payment-method replacement/removal and cap update/revoke behavior.
- Make teardown complete by clearing every retained element reference.
- Define Content Security Policy and navigation restrictions for desktop payment views.

## API-only SDK: restrict it or keep it broad?

### Decision

Keep API-only broad across all 16 predefined metrics. Do **not** remove mouse, scroll, swipe, typing, or duration types from its TypeScript union.

However, explicitly define API-only as a **transport SDK**, not an automatic measurement SDK.

Why:

- An API server cannot directly observe a physical mouse, swipe, pinch, or foreground screen.
- It can legitimately receive those measurements from a trusted native collector, desktop process, device gateway, WebSocket session, or developer backend and forward them.
- It can directly calculate some fixed metrics, such as API-backed search counts, download delivery counts, server-confirmed form submissions, or duration derived from a controlled session protocol.
- Restricting the union by runtime would prevent legitimate backend-first architectures without making billing safer.
- Safety comes from provenance, identity, schema/range validation, event IDs, and documented measurement responsibility—not from deleting metric names from this package.

### Required API-only distinctions

Classify documentation and metadata by observation mode:

| Observation mode | Meaning | Typical fixed metrics |
|---|---|---|
| `server_observed` | Backend directly saw the operation | `search_count`, `file_download_count`, `form_submit_count` |
| `client_forwarded` | Backend forwards a device measurement | `mouse_distance`, `swipe_count`, `pinch_zoom_count`, `scroll_length`, `scroll_speed`, `type_speed` |
| `session_derived` | Backend calculates from controlled start/heartbeat/stop records | `stay_duration`, `video_watch_duration` |

These are provenance labels for existing metrics, not custom event types. The backend should store provenance and apply appropriate validation. It must not assume `server_observed` merely because the API-only package sent the request.

### API-only hardening plan

- Use a server-only credential distinct from the public browser/mobile app key.
- Never put server secrets in browser, React Native, or desktop renderer bundles.
- Add event ID/idempotency key, sequence, observed-at timestamp, visit ID, and provenance.
- Validate finite values, fixed unit, maximum delta, maximum rate, timestamp skew, batch size, and event age per metric.
- Reject malformed/disallowed events explicitly instead of reporting blanket success after silently skipping them.
- Return per-event acceptance results.
- Separate `accepted`, `aggregated`, `threshold_reached`, `charge_pending`, `charged`, `failed`, and `skipped` states.
- Add charge-result lookup or webhook delivery because the current `track()` response cannot prove charge success.
- Add timeout, abort signal, retry policy, retry-after handling, and structured error codes.
- Provide helper functions only for the existing fixed metrics, with unit-safe parameters.

### API-only billing certainty

API-only can improve certainty when the backend truly observes the event, but it cannot guarantee that a developer is honest. Still Kinetic can prove who authenticated the request, which fixed metric/value they asserted, whether it was duplicated, how it affected the threshold, and what Stripe did. It cannot independently prove the developer delivered the underlying service.

## Management ingestion hardening

Current ingestion risks:

- `appId` from the payload is not cross-checked, although the app is selected by API key.
- Event fields are loosely typed through `any`.
- `endUserId`, `pageId`, `value`, and timestamp are not strictly validated.
- Negative, non-finite, enormous, stale, future, or malformed values can reach aggregation.
- Unsupported/disallowed events are silently dropped while the response remains `{ ok: true }`.
- The public application key identifies the app but does not establish a trustworthy end-user identity.
- There is no event ID or ingestion deduplication ledger.
- Events in a batch are processed serially, but concurrent requests can race on the same aggregate and spending cap.

Required changes:

- Introduce a strict request schema and per-metric validator.
- Resolve app identity only from the credential and reject mismatched supplied app IDs.
- Separate public client credentials from server credentials.
- Use short-lived end-user tokens signed by the developer backend for UI SDK identity, or another binding that prevents arbitrary `endUserId` impersonation.
- Add an `ingested_events` table keyed by app and event ID.
- Record accepted/rejected reason per event.
- Add request size, event count, metric-rate, user-rate, and app-rate limits.
- Define a retention policy for raw events versus aggregates.
- Add origin/CORS policy for browser requests without treating CORS as authentication.

## Threshold and aggregation hardening

Current strengths:

- Fixed metrics are separated into cumulative and instantaneous groups.
- Cumulative metrics use `floor(value / threshold)` and `charge_units`, enabling repeated units.
- Stripe idempotency keys include app, user, metric, aggregate, and charge unit.
- Fresh visit IDs are embedded into `pageId`, so cumulative aggregation can reset between visits.

Current risks:

- Read-modify-write aggregation is not atomic; concurrent events can overwrite values or produce duplicate charge attempts.
- Cap check and cap increment are not one atomic reservation.
- Stripe is called before D1 records the successful charge and spend increment. A crash between Stripe success and D1 update can leave local state behind Stripe.
- `charge_units` advances only after local success handling, while Stripe retry/recovery is not represented as a durable pending unit.
- Instantaneous idempotency uses `Date.now()` as charge unit and therefore is not a stable identity for request retries.
- Changing a threshold after usage accumulated has undefined retroactive behavior.
- The aggregate key is dependent on `pageId` string construction rather than explicit resource/visit columns.

Required changes:

- Give every event and every threshold unit a stable identity.
- Use transactional/conditional updates or a per-app-user serialization mechanism suitable for Cloudflare, such as a Durable Object when strict concurrency is required.
- Reserve cap and threshold unit before calling Stripe.
- Persist a pending charge attempt before the external call.
- Reconcile pending attempts by retrieving Stripe PaymentIntent status.
- Finalize spend and charge unit exactly once on confirmed success.
- Release reservations on definitive failure.
- Define threshold edits as prospective: store rule version/effective time and avoid retroactively charging old accumulation unless explicitly intended.
- Store visit ID separately from page/screen ID in the next schema revision.

## Cap and access hardening

Current behavior:

- Access blocks inactive developer subscriptions, incomplete Connect onboarding, absent end-user payment method, exhausted cap, or insufficient remaining cap for the next configured charge.
- Weekly means a rolling seven-day interval and monthly means a rolling 30-day interval beginning at stored `period_start`.

Enhancements:

- Decide and document whether cap periods are rolling intervals or calendar periods. Preserve current rolling behavior unless deliberately migrated.
- Perform period rollover persistently and atomically rather than calculating a temporary zero only in reads.
- Return `requiredCents`, `remainingCents`, period start/end, next reset, metric, and charge state.
- Add `approaching_cap`, `payment_failed`, `authentication_required`, and `temporarily_unavailable` where the host must behave differently.
- Cache access decisions only briefly and invalidate after every accepted threshold unit or billing configuration change.
- Provide an explicit revoke payment authorization endpoint and behavior.
- Never imply that SDK callbacks automatically block the host application. The host must enforce the decision.

## Stripe and ledger hardening

Current behavior:

- End users authorize cards through SetupIntents.
- Usage charges are off-session destination PaymentIntents with a 25% application fee.
- `trigger_logs` records succeeded, failed, and skipped attempts.
- The webhook currently concentrates on developer subscriptions and Connect account updates.

Required changes:

- Add PaymentIntent webhook handling for success, failure, cancellation, and processing states.
- Store pending attempts before Stripe calls, with a unique threshold-unit key enforced by D1.
- Reconcile D1 against Stripe after timeout or Worker interruption.
- Store Stripe request ID, PaymentIntent status, failure code, decline code, rule version, cap period, event/aggregate unit, and timestamps.
- Support off-session authentication-required outcomes and tell the UI SDK that the user must return to an on-session flow.
- Add refund/dispute handling and reverse local spend/ledger state according to a documented policy.
- Verify that connected account capability requirements match destination charges, not merely `charges_enabled` assumptions.
- Add webhook event deduplication by Stripe event ID.
- Apply timestamp tolerance during Stripe signature verification.
- Keep developer weekly subscription state separate from end-user usage PaymentIntent state.

## Shared SDK contract

Create one internal/shared contract package or generated schema for:

- the 16 fixed metric identifiers;
- unit and aggregation category;
- minimum/maximum valid values;
- default sample/report cadence;
- cumulative versus instantaneous behavior;
- access statuses;
- event envelope and API response types.

This prevents the four packages and management backend from drifting through duplicated unions and arrays.

Suggested fixed metadata—not new metric names:

```text
metric
value
unit
eventId
sequence
visitId
pageOrScreenId
observedAt
provenance
sdkName
sdkVersion
```

The server remains authoritative for thresholds, prices, allowed metrics, subscription state, caps, and charge results.

## Priority implementation sequence

### Phase 0: establish exact semantics

- Write one specification row for every fixed metric: unit, cumulative/instantaneous mode, reset boundary, inclusion/exclusion rules, maximum plausible value/rate, and platform applicability.
- Resolve ambiguous definitions for form submission, tab switch, download, sharing, playback, typing, and scroll units.

### Phase 1: stop known incorrect measurement and delivery

- Fix web and React Native background duration reopening.
- Add React Native navigation focus and sender cleanup.
- Fix web beacon authentication/delivery.
- Export the React Native billing component documented by the package.
- Make start/stop lifecycle idempotent across SDKs.
- Add strict ingestion validation.

### Phase 2: duplicate and concurrency safety

- Add event IDs and ingestion deduplication.
- Add stable threshold-unit IDs.
- Add atomic cap reservation and serialized aggregation.
- Add durable pending charge records and Stripe reconciliation.
- Add Stripe PaymentIntent webhook lifecycle and webhook deduplication.

### Phase 3: access enforcement contract

- Expand access decision fields and statuses.
- Pause SDK measurement on denial.
- Give developers preflight and post-event enforcement examples for each platform.
- Add payment-method replacement, cap update, and revoke flows.

### Phase 4: implement the remaining fixed trackers

- Web/desktop first: mouse distance, form submit, media play/watch, search submit, long press, swipe/pinch where APIs permit.
- React Native: gesture, navigation, media, search/form, sharing adapters.
- Keep platform-inapplicable combinations disabled or manual rather than pretending they are automatic.

### Phase 5: reliability and observability

- Bounded offline queue with event IDs.
- Delivery/acceptance/charge telemetry.
- Admin reconciliation tools.
- Per-app anomaly/rate dashboards.
- SDK version and provenance reporting.

## Minimum test matrix before production billing claims

### Measurement

- Visible/focused duration only.
- Hidden, blur, background, minimized, navigation blur, device sleep, and app suspension do not accrue duration.
- Stop/unmount flushes once.
- Leave and return creates a fresh visit and fresh cumulative aggregate.
- Scroll restoration and virtualized jumps are excluded or clamped.
- Typing handles paste, deletion, IME, autocorrect, and programmatic changes according to specification.
- Gestures count once per completed gesture.
- Video duration excludes pause, seek, buffering, hidden playback where excluded, and source change.

### Delivery

- Duplicate request/event is accepted at most once.
- Retry after timeout does not duplicate an aggregate or charge.
- Out-of-order sequences are handled deterministically.
- Offline queue survives process/app lifecycle within documented limits.
- Beacon/background flush authenticates successfully.

### Billing

- Exact threshold crossing charges once.
- One event crossing multiple cumulative units produces each intended unit exactly once.
- Two concurrent crossings do not overcharge.
- Cap allows an exact-fit charge and blocks one cent beyond it.
- Period rollover is atomic.
- Stripe timeout after remote success reconciles without another charge.
- Authentication-required, decline, cancellation, refund, and dispute states reconcile correctly.
- Inactive developer subscription and incomplete Connect onboarding block processing.
- Threshold edit does not unexpectedly charge historical accumulation.

### Cross-platform consistency

- Equivalent scripted interaction produces values within defined tolerance on browser, React Native, and desktop.
- Unit labels shown in the dashboard match emitted values.
- Unsupported automatic combinations are clearly marked, while API-only manual forwarding still accepts the fixed metric with valid provenance.

## Documentation corrections identified

- Web README examples instantiate `TrackPay`, although the exported class is `StillKinetic`.
- Web README calls `start()` without the documented required `await init()` flow; current code otherwise leaves subscription inactive and attaches no trackers.
- Web README says “subset of the 5” while the exported fixed union contains 16; only five are automatic.
- React Native README imports `CardBindScreen`, but the package root currently does not export it.
- React Native README refers to `useTrackPay`, while the exported hook is `useStillKinetic`.
- React Native README describes wrapping the internal tracker through start/stop-equivalent logic that the public hook does not expose.
- “Tracking must never throw” should not mean silently claiming success for invalid/disallowed inputs or permanently losing exhausted retries. Host applications need observable, non-disruptive failure states.

## Final recommendation

Still Kinetic should remain a fixed-metric tracking and threshold-billing platform. Nothing in the existing metric model needs to be removed. The immediate work is not adding new monetization concepts; it is making the current claims true and consistent.

The highest-risk present issues are:

1. hidden/background duration can restart and overcount;
2. public-key/end-user identity can be impersonated;
3. event input and values are insufficiently validated;
4. retries and concurrency can produce lost evidence or inconsistent billing state;
5. cap checking and charging are not atomic;
6. Stripe success can occur before local state is durably finalized;
7. most declared metrics are manual-only despite appearing in the common metric list.

Keep API-only broad because it is the universal transport for the same closed metrics. Make its limitation explicit: it does not sense mouse speed, scrolling, swipes, typing, or duration by itself. It transports measurements supplied by code that can observe them, while the management backend validates, aggregates, caps, and bills them.

## Source paths inspected

- `tracking-sdk/packages/web/src/index.ts`
- `tracking-sdk/packages/web/src/core/types.ts`
- `tracking-sdk/packages/web/src/trackers/*`
- `tracking-sdk/packages/web/src/transport/batchSender.ts`
- `tracking-sdk/packages/web/src/billing/CardBind.ts`
- `tracking-sdk/packages/react-native/src/index.ts`
- `tracking-sdk/packages/react-native/src/core/types.ts`
- `tracking-sdk/packages/react-native/src/trackers/*`
- `tracking-sdk/packages/react-native/src/transport/batchSender.ts`
- `tracking-sdk/packages/react-native/src/billing/CardBindScreen.tsx`
- `tracking-sdk/packages/desktop/src/index.ts`
- `tracking-sdk/packages/desktop/src/billing/DesktopBillingPanel.ts`
- `tracking-sdk/packages/api-only/src/index.ts`
- `tracking-sdk/packages/api-only/src/types.ts`
- `management/src/routes/api/events/+server.ts`
- `management/src/routes/api/end-user/*`
- `management/src/lib/server/metrics.ts`
- `management/src/lib/server/thresholdEngine.ts`
- `management/src/lib/server/access.ts`
- `management/src/lib/server/stripe.ts`
- `management/src/routes/api/stripe/webhook/+server.ts`
- `management/src/routes/api/apps/config/+server.ts`
- `management/src/routes/api/apps/[id]/thresholds/+server.ts`
- `management/migrations/*`
