# Code Review Findings — still-kinetic

## BUG 1 (CRITICAL): Frontend Auth Flow Broken After Cookie Migration

The server-side JWT→HttpOnly cookie migration (fix #6) changed login/register/verify-login to return `{ role }` in the response body (no `token` field), with the actual JWT set via `Set-Cookie` header. But **the frontend Svelte pages were never updated** to match.

**Files affected:**

- `auth/+page.svelte` lines 41, 59: `localStorage.setItem('sk_token', data.token)` — `data.token` is `undefined` because the server returns `{ role: ... }` without a `token` field
- `register/+page.svelte` line 107: same issue — `data.token` is undefined
- `+layout.svelte` line 11: checks `localStorage.getItem('sk_token')` for auth guard — always falsy after login
- `+page.svelte` line 8-12: same localStorage check — redirect never fires
- All dashboard pages (admin, earnings, manager overview): send `Authorization: Bearer ${token}` header where `token()` reads localStorage — always sends `Bearer undefined`

**Impact:** After the cookie migration, NO user can log in through the web UI. The auth guard in `+layout.svelte` never detects the user as logged in, and all API calls send `Authorization: Bearer undefined`. The cookie is correctly set by the server but the Svelte frontend never reads from it — it relies entirely on localStorage which is never populated.

---

## BUG 2 (CRITICAL): Some Endpoints Use Bearer Auth Without `platform` (Broken on CF Workers)

Several endpoints parse the `Authorization` header for JWT but **don't pass `platform`** to `verifyToken()`. This causes `getSecret(undefined)` to fall back to `process.env.JWT_SECRET`, which **does not exist on Cloudflare Workers** (secrets come from `platform.env`).

**Affected endpoints:**

- `apps/[id]/+server.ts` (GET handler, line 7):
  ```ts
  const user = await verifyToken((request.headers.get('authorization') || '').slice(7));
  //                                                                              ^ missing platform
  ```
- `apps/[id]/thresholds/+server.ts` (ALL 4 handlers, lines 6, 18, 57, 82):
  ```ts
  const user = await verifyToken((request.headers.get('authorization') || '').slice(7));
  ```

**Compare with correctly migrated endpoints:**
- `apps/+server.ts` (uses `getAuthTokenFromRequest` → cookies ✓)
- `stripe/connect/+server.ts` (uses `getAuthTokenFromRequest` + passes `platform` ✓)
- `stripe/subscription/+server.ts` (uses `getAuthTokenFromRequest` + passes `platform` ✓)

**Impact:** GET on `apps/[id]` and all CRUD on thresholds fail silently on deployed CF Workers — `verifyToken` returns `null` because `JWT_SECRET` is unresolvable, so every request is treated as "unauthorized".

---

## BUG 3 (CRITICAL): SDK CardBind Calls Nonexistent API Endpoints

Both the Web SDK and RN SDK call API endpoints that **do not exist** in the management server.

**Web SDK** (`tracking-sdk/packages/web/src/billing/CardBind.ts`):
- Line 43: `${baseUrl}/api/billing/setup-intent` — **should be** `/api/end-user/bind-card`
- Line 72: `${baseUrl}/api/billing/end-user-config` — **should be** `/api/end-user/config`

**RN SDK** (`tracking-sdk/packages/react-native/src/billing/CardBindScreen.tsx`):
- Line 30: `${baseUrl}/api/billing/setup-intent` — **should be** `/api/end-user/bind-card`
- Line 54: `${baseUrl}/api/billing/end-user-config` — **should be** `/api/end-user/config`

**Actual server endpoints:**
- `management/src/routes/api/end-user/bind-card/+server.ts` → `/api/end-user/bind-card`
- `management/src/routes/api/end-user/config/+server.ts` → `/api/end-user/config`

**Impact:** The entire card-binding/billing flow is broken in both SDKs — all attempts to bind a card or set spending caps result in 404 errors.

---

## BUG 4 (HIGH): `event_aggregates` INSERT References Missing `created_at` Column

**File:** `thresholdEngine.ts` line 49-52
```sql
INSERT INTO event_aggregates (id, app_id, end_user_external_id, page_id, metric, value, baseline_value, updated_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
```

The `event_aggregates` schema (`db/schema.ts` lines 57-67) does **NOT** have a `created_at` column:
```
id, appId, endUserExternalId, pageId, metric, value, baselineValue, lastTriggeredAt, updatedAt
```

All other tables (`users`, `apps`, `thresholds`, `end_users`, `trigger_logs`) have `created_at` defined in their schema, but `event_aggregates` is missing it.

**Impact:** Every event ingestion call that creates a new aggregate row will throw a D1 SQL error, preventing threshold tracking from working for new end users/pages/metric combinations.

---

## BUG 5 (HIGH): `+ 'Z'` Appended to Already-Timezone-Aware ISO Strings

**File:** `thresholdEngine.ts`

Line 66:
```ts
const elapsed = Date.now() - new Date(lastTriggeredAt + 'Z').getTime();
```
`lastTriggeredAt` is stored as `new Date().toISOString()` which produces `"2026-07-12T14:05:00.000Z"`. Appending `'Z'` creates `"2026-07-12T14:05:00.000ZZ"` — an **invalid date string** that produces `NaN` from `Date.parse()`/`getTime()`.

Line 96:
```ts
let ps = eu.period_start ? new Date(eu.period_start + 'Z') : null;
```
Similarly, `period_start` is stored as an ISO string by `bind-card/+server.ts` line 31. Appending `'Z'` creates an invalid date.

**Impact:** 
- The instantaneous cooldown check (`isI && lastTriggeredAt`) is always bypassed because `new Date(invalidString).getTime()` is `NaN`, and `Date.now() - NaN` is `NaN`, which is NOT `< 60000`, so it always evaluates as false. Every instantaneous metric event incurs a charge (no cooldown).
- The spending cap period reset check fails and never resets, so `period_start` is always treated as current and the user may hit their cap permanently.

---

## BUG 6 (HIGH): Type Mismatch — ISO Strings Stored in Integer Timestamp Columns

**Schema intent:** All `created_at`, `period_start`, `period_spend_cents` etc. are defined as `integer(..., { mode: 'timestamp' })` in the Drizzle schema.

**Actual INSERT values:** The raw D1 queries store `new Date().toISOString()` (e.g., `"2026-07-12T14:05:00.000Z"`) into these integer columns.

**Affected inserts:**
- `register/+server.ts` line 72: `created_at = ?` ← ISO string
- `apps/+server.ts` line 71: `created_at = ?` ← ISO string
- `thresholds/+server.ts` line 51: `created_at = ?` ← ISO string
- `bind-card/+server.ts` line 31: `period_start = ?` ← ISO string
- `thresholdEngine.ts` lines 51-52, 136-137: `created_at = ?` ← ISO string

Since these bypass Drizzle and use raw D1 prepared statements, the values are stored as TEXT in SQLite instead of INTEGER. The `dashboard/+page.svelte` line 61 does `new Date(app.created_at).toLocaleDateString()` — since it's already an ISO text string, this works by accident. But numeric comparisons and time arithmetic could fail.

---

## BUG 7 (MEDIUM): Mixed Auth Strategies Across Endpoints

The project has **two inconsistent auth mechanisms**:

**Cookie-based (post-migration):**
- `apps/+server.ts` (GET/POST): uses `getAuthTokenFromRequest()` → cookies
- `apps/[id]/+server.ts` (PATCH/DELETE): uses `getAuthTokenFromRequest()` → cookies
- `stripe/connect/+server.ts`: uses `getAuthTokenFromRequest()` → cookies
- `stripe/subscription/+server.ts`: uses `getAuthTokenFromRequest()` → cookies
- `auth/me/+server.ts`: uses `getAuthTokenFromRequest()` → cookies

**Bearer-header-based (pre-migration, broken):**
- `apps/[id]/+server.ts` (GET): parses `Authorization` header (also missing `platform` — see BUG 2)
- `apps/[id]/thresholds/+server.ts` (ALL): parses `Authorization` header (also missing `platform`)

**Impact:** Inconsistent and confusing — some endpoints check cookies, others check Bearer. And since the frontend sends `Authorization: Bearer undefined` (BUG 1) while the browser auto-sends cookies, only the cookie-based endpoints would work (if the user's browser has the cookie).

---

## BUG 8 (MEDIUM): Duplicate `platformFeeFraction()` Function

**Files:**
- `lib/server/stripe.ts` lines 11-13: `export function platformFeeFraction(): number { return 0.25; }`
- `lib/server/metrics.ts` lines 53-55: `export function platformFeeFraction(): number { return 0.25; }`

The `thresholdEngine.ts` imports it from `./stripe` (correct). The `metrics.ts` version is dead code — never imported anywhere. Dead code that will diverge if one is updated and the other isn't.

---

## BUG 9 (MEDIUM): Unused `import Stripe from 'stripe'` in thresholdEngine.ts

**File:** `thresholdEngine.ts` line 1:
```ts
import Stripe from 'stripe';
```

The custom `StripeClient` class in `stripe.ts` is used instead (via `getStripe()`). The npm `stripe` package is never referenced anywhere in this file. This import would fail at build time if the `stripe` npm package isn't installed in the management project.

---

## BUG 10 (MEDIUM): RN SDK Activates Stay Tracker Even When Subscription Inactive

**File:** `index.ts` (RN SDK) lines 77-80:
```ts
const { onPressIn } = usePressTracker(config, sender, pageId);
const { onScroll } = useScrollTracker(config, sender, pageId, effectiveMetrics);
const { onChangeText } = useTypeTracker(config, sender, pageId);
useStayTracker(config, sender, pageId);
```

These hooks are called **unconditionally** — even when `trackingEnabled` is false. While press/scroll/type trackers only fire when their returned handlers are called (and the return on lines 83-88 conditionally provides `undefined` handlers), the `useStayTracker` hook has a `useEffect` that starts a `setInterval` and an `AppState` listener that **runs unconditionally**. This means:

- The 5-second report interval fires constantly even when subscription is inactive
- Events still get enqueued and sent to the server (which will 402-reject them)
- Unnecessary network traffic and battery drain

---

## BUG 11 (LOW): `bind-card/+server.ts` Missing Validation for `spendingCapCents`

**File:** `bind-card/+server.ts` — the endpoint accepts `spendingCapCents` from the SDK without validation:
- No check for negative or zero values
- No check for maximum value
- No type validation

The schema defines it as nullable, so a missing or invalid value would store `null` or garbage.

---

## BUG 12 (LOW): Unused Type Imports and Declarations

**File:** `app.d.ts` lines 9-11 — declares `STRIPE_PUBLISHABLE_KEY` and `STRIPE_CONNECT_CLIENT_ID` in the `App.Platform` interface, but neither is referenced anywhere in the codebase. If these aren't deployed as CF Workers secrets, the type declarations are misleading.

---

## Summary

| # | Severity | Issue |
|---|----------|-------|
| 1 | CRITICAL | Frontend auth flow broken after cookie migration — `data.token` is always undefined, all API calls send `Bearer undefined` |
| 2 | CRITICAL | 5 endpoints call `verifyToken()` without `platform` — JWT secret unresolvable on CF Workers, always returns "unauthorized" |
| 3 | CRITICAL | Web + RN SDK CardBind calls `/api/billing/setup-intent` and `/api/billing/end-user-config` — neither endpoint exists (should be `/api/end-user/bind-card` and `/api/end-user/config`) |
| 4 | HIGH | `event_aggregates` INSERT references `created_at` column that doesn't exist in the schema — SQL error on every new event aggregation |
| 5 | HIGH | `+ 'Z'` appended to already-UTC ISO strings creates invalid dates — cooldown check broken, spending cap reset broken |
| 6 | HIGH | ISO strings stored in integer timestamp columns via raw D1 queries (bypass Drizzle type coercion) |
| 7 | MEDIUM | Mixed auth strategies — some endpoints read cookies, others parse Authorization header |
| 8 | MEDIUM | Duplicate `platformFeeFraction()` function in `metrics.ts` (dead code) |
| 9 | MEDIUM | Unused `import Stripe from 'stripe'` in `thresholdEngine.ts` — would fail if package not installed |
| 10 | MEDIUM | RN SDK stay tracker always runs `setInterval` even when subscription is inactive |
| 11 | LOW | `bind-card/+server.ts` doesn't validate `spendingCapCents` |
| 12 | LOW | `STRIPE_PUBLISHABLE_KEY` and `STRIPE_CONNECT_CLIENT_ID` declared in types but never used |
