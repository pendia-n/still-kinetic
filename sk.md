# Still Kinetic — Build Manual / 構建手冊

> *Behavior-triggered micro-payment engine / 行為觸發微支付引擎*
>
> *npm SDK + Stripe Connect off-session charging, threshold-triggered*
> *npm SDK + Stripe Connect 離線扣款，閾值觸發*
>
> Version: P2 MVP (2026年7月 → 2027年6月)
> Exit thesis: $1–2M acquisition via Stripe ecosystem
> 退出目標：Stripe 生態系收購，估值 $1–2M

---

## Table of Contents / 目錄

1. [Product Overview / 產品概述](#1-product-overview--產品概述)
2. [Architecture Diagram / 架構圖](#2-architecture-diagram--架構圖)
3. [SDK Platform Adapters / SDK 平台適配器](#3-sdk-platform-adapters--sdk-平台適配器)
4. [Event Tracking Schema / 事件追蹤架構](#4-event-tracking-schema--事件追蹤架構)
5. [Threshold Engine Design / 閾值引擎設計](#5-threshold-engine-design--閾值引擎設計)
6. [Stripe Connect Payment Flow / Stripe Connect 支付流程](#6-stripe-connect-payment-flow--stripe-connect-支付流程)
7. [Dashboard Roles / 儀表板角色](#7-dashboard-roles--儀表板角色)
8. [Backend Stack Specification / 後端技術棧規格](#8-backend-stack-specification--後端技術棧規格)
9. [Monthly Cap Enforcement / 每月上限執行](#9-monthly-cap-enforcement--每月上限執行)
10. [Build Order / 構建順序](#10-build-order--構建順序)
11. [Deployment + Compliance Checklist / 部署與合規檢查清單](#11-deployment--compliance-checklist--部署與合規檢查清單)

---

## 1. Product Overview / 產品概述

### English

**Still Kinetic** is a behavior-triggered micro-payment engine. It is NOT usage-based billing — it is *threshold-triggered* billing.

A third-party app developer installs the Still Kinetic npm SDK (`@stillkinetic/web`, `@stillkinetic/rn`, or `@stillkinetic/electron`). The SDK passively tracks end-user behavior signals: press count, scroll length, type speed, and stay duration. When a developer-configured threshold is crossed, the SDK signals the backend, which fires an off-session Stripe PaymentIntent — silently charging the end user without requiring per-action consent.

**Key differentiator:** Stripe bought Metronome for $1B (usage-based billing). Behavior-triggered billing is still an open blue ocean. This window will not stay open forever — Stripe may expand into this space.

**Revenue model (three layers):**
- **Take rate:** 25% of every processed charge via `application_fee_amount`
- **Platform fee:** Flat monthly fee per installing app (optional P1)
- **Volume tiers:** Decreasing take rate at high volume (optional P2)

**Exit thesis:** P2 product optimized for Stripe ecosystem acquisition ($1–2M).

### 中文

**Still Kinetic** 是一個行為觸發微支付引擎。它不是「用量計費」——它是「閾值觸發計費」。

第三方應用開發者安裝 Still Kinetic 的 npm SDK（`@stillkinetic/web`、`@stillkinetic/rn` 或 `@stillkinetic/electron`）。SDK 被動追蹤最終用戶的行為訊號：點擊次數、滾動長度、打字速度和停留時長。當開發者設定的閾值被觸發時，SDK 通知後端，後端發起一筆 Stripe 離線 PaymentIntent——靜默扣款，無需用戶每次確認。

**關鍵差異化：** Stripe 以 $10 億收購 Metronome（用量計費）。行為觸發計費仍是真正的藍海市場。這個窗口不會永遠敞開——Stripe 可能隨時進入此領域。

**收入模型（三層）：**
- **抽成：** 每筆處理費用的 25%（透過 `application_fee_amount`）
- **平台費：** 每個安裝應用的月度固定費用（可選，P1）
- **階梯費率：** 高交易量時降低抽成比例（可選，P2）

**退出目標：** P2 產品，針對 Stripe 生態系收購優化（$1–2M）。

---

## 2. Architecture Diagram / 架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│                        END USER / 最終用戶                       │
│  Browser / React Native / Electron / Tauri                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  @stillkinetic/web │ @stillkinetic/rn │ @stillkinetic/e  │  │
│  │  [press, scroll, type, stay] → batched event stream       │  │
│  └──────────────────────┬────────────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────────────┘
                          │ HTTP POST /events (batched, every N sec)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INGESTION LAYER / 接入層                      │
│  Fastify or Cloudflare Workers                                  │
│  • Auth: app API key (X-API-Key header)                         │
│  • Validate event schema                                        │
│  • Enqueue to Redis Streams or SQS                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    QUEUE / 隊列                                  │
│  Redis Streams or AWS SQS                                       │
│  • Decouples SDK bursts from billing logic                      │
│  • Enables retry + exactly-once processing                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESSING LAYER / 處理層                     │
│  Node Worker (stateless)                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. Dequeue batch of raw events                          │    │
│  │ 2. Compute per-session aggregates:                      │    │
│  │    press_count, scroll_length, type_speed, stay_duration│    │
│  │ 3. Write to Postgres (events_agg)                       │    │
│  │ 4. Run threshold check against app config               │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└─────────────────────────────┼────────────────────────────────────┘
                              │ threshold crossed?
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PAYMENT ORCHESTRATION / 支付編排              │
│  Stripe Connect Service                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. Has PaymentMethod on file?                           │    │
│  │    ├─ No  → return SETUP_REQUIRED (client_secret)       │    │
│  │    └─ Yes → check monthly cap                           │    │
│  │ 2. Create PaymentIntent:                                │    │
│  │    amount: $X, off_session: true, confirm: true         │    │
│  │    application_fee_amount: 25% of $X                    │    │
│  │    on_behalf_of: connected_account_id                   │    │
│  │ 3. Webhook: payment_intent.succeeded / .payment_failed  │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└─────────────────────────────┼────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LEDGER + RECEIPT / 帳本 + 收據               │
│  Postgres (append-only) + async email/webhook                   │
│  • charges table: itemized record per transaction               │
│  • receipt fired async (email or in-app notification)           │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    DASHBOARD / 儀表板                            │
│  Next.js + Postgres                                             │
│  • Manager view: all apps, global revenue, take-rate config     │
│  • Admin view: own app metrics, thresholds, payout history      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. SDK Platform Adapters / SDK 平台適配器

### Common Core / 共通核心 (`@stillkinetic/core`)

TypeScript core shared across all platform adapters.

```typescript
// Event schema — every platform adapter normalizes to this
interface StillKineticEvent {
  sessionId: string;
  appId: string;
  eventType: 'press' | 'scroll' | 'type' | 'stay';
  metricType: 'count' | 'length' | 'speed' | 'duration';
  value: number;
  timestamp: number;       // Unix ms
  pageContext?: string;    // route / screen name
}
```

### Web Adapter / 網頁適配器 (`@stillkinetic/web`)

| Signal | Implementation | Reliability |
|--------|---------------|-------------|
| 信號 | 實現方式 | 可靠性 |
| Press count | `click` / `pointerdown` listeners, page-scoped | High |
| Scroll length | `scrollY` / `scrollHeight` delta | High |
| Type speed | `keydown` timestamps, per-field or per-page | High |
| Stay duration | Page Visibility API + `performance.now()` diff | High |

- Bundled as ESM + UMD
- Tree-shakeable — only load the signals the app needs
- `StillKinetic.init({ appId, apiKey, signals: ['press','scroll','type','stay'] })`

### React Native Adapter / React Native 適配器 (`@stillkinetic/rn`)

| Signal | Implementation | Reliability |
|--------|---------------|-------------|
| 信號 | 實現方式 | 可靠性 |
| Press count | `onPress` / gesture responder counts per screen | High |
| Scroll length | `onScroll` offset delta + content size computation | Medium-High |
| Type speed | `onKeyPress` / `onChangeText` timing | Medium (70–80% — keyboard/IME variance) |
| Stay duration | `AppState` + screen focus lifecycle (React Navigation) | High |

- Native module bridge for performance-sensitive signals (scroll)
- Uses `react-native-reanimated` worklets for scroll tracking on UI thread

### Desktop Adapter / 桌面適配器 (`@stillkinetic/electron`)

| Signal | Implementation | Reliability |
|--------|---------------|-------------|
| 信號 | 實現方式 | 可靠性 |
| Press count | Same DOM APIs inside Chromium (Electron) or WebView (Tauri) | High |
| Scroll length | Same as web — DOM APIs | High |
| Type speed | Same as web | High |
| Stay duration | Window focus/blur events | High |

- Electron: preload script exposes IPC bridge
- Tauri: Rust command via `tauri::command` → JS listener
- Single package with platform detection

### Batching & Transport / 批處理與傳輸

- Events batch every 5 seconds (configurable: 1–30s)
- Max batch size: 100 events
- HTTP POST to `/events` with `X-API-Key` header
- Queue on failure with exponential backoff (max 3 retries)
- Offline-safe: events queued in memory, flushed on reconnect

---

## 4. Event Tracking Schema / 事件追蹤架構

### Valid Metric Combinations / 有效指標組合

Four action types × four measure types = 16 cells total. Only **~10–11** are semantically valid.

|  | Count / 計數 | Length / 長度 | Speed / 速度 | Duration / 時長 |
|---|---|---|---|---|
| **Press / 按鍵** | ✅ `press_count` | ✗ (press has no length) | ✅ `press_interval` / rate | ✅ `hold_duration` |
| **Scroll / 滾動** | ✅ `scroll_event_count` | ✅ `scroll_length` (px) | ✅ `scroll_velocity` (px/ms) | ✅ `scroll_time` (ms) |
| **Type / 打字** | ✅ `keystroke_count` | ✗ (no length concept) | ✅ `type_speed` (wpm/cpm) | ✅ `typing_session_duration` |
| **Stay / 停留** | ✗ (not countable) | ✗ | ✗ | ✅ `stay_duration` (ms) |

**Valid combos (10–11 total):**
1. `press_count` — total press/click events in a session
2. `press_interval` — average time between presses (speed)
3. `hold_duration` — how long a press is held
4. `scroll_event_count` — number of discrete scroll events
5. `scroll_length` — total pixels scrolled (vertical + horizontal)
6. `scroll_velocity` — derived: `scroll_length ÷ scroll_time`
7. `scroll_time` — total milliseconds spent scrolling
8. `keystroke_count` — total keydown/keypress events
9. `type_speed` — words/characters per minute
10. `typing_session_duration` — total ms spent typing
11. `stay_duration` — total ms on page/screen

### Composite / Derived Metrics / 複合指標

These are derived analytics (not raw tracking) — can be computed in the processing layer:
- **Engagement score:** weighted combination of scroll + press + stay
- **Scroll velocity percentiles:** P50 / P90 / P99 across sessions
- **Abandonment rate:** sessions with stay < 3s

### Database Schema / 資料庫架構

```sql
-- Raw events (write-once, append-only)
CREATE TABLE events_raw (
  id            UUID DEFAULT gen_random_uuid(),
  app_id        VARCHAR(64) NOT NULL,
  session_id    VARCHAR(64) NOT NULL,
  event_type    VARCHAR(16) NOT NULL,  -- press|scroll|type|stay
  metric_type   VARCHAR(16) NOT NULL,  -- count|length|speed|duration
  value         DOUBLE PRECISION NOT NULL,
  page_context  VARCHAR(256),
  client_ts     BIGINT NOT NULL,       -- client timestamp
  ingested_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Session aggregates
CREATE TABLE events_agg (
  id            UUID DEFAULT gen_random_uuid(),
  app_id        VARCHAR(64) NOT NULL,
  session_id    VARCHAR(64) NOT NULL,
  user_id       VARCHAR(64),           -- end user identifier
  agg_start     TIMESTAMPTZ NOT NULL,
  agg_end       TIMESTAMPTZ NOT NULL,
  press_count   INTEGER DEFAULT 0,
  scroll_length DOUBLE PRECISION DEFAULT 0,
  scroll_velocity DOUBLE PRECISION,
  type_speed    DOUBLE PRECISION,
  stay_duration BIGINT DEFAULT 0,
  page_context  VARCHAR(256),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id)
);
```

---

## 5. Threshold Engine Design / 閾值引擎設計

### Overview / 概述

The threshold engine is a **stateless** Node worker that reads app configuration from Postgres and compares cumulative user usage against configured thresholds.

### App Configuration (per app) / 應用配置（每個應用）

Stored in the `apps` table, configured via the Admin dashboard:

```typescript
interface ThresholdConfig {
  // Which metric triggers the charge
  metric: 'press_count' | 'scroll_length' | 'type_speed' | 'stay_duration'
          | 'scroll_velocity' | 'scroll_time' | 'keystroke_count'
          | 'press_interval' | 'hold_duration' | 'typing_session_duration';

  // Threshold value (crossing this fires a charge)
  threshold: number;

  // Comparison operator
  operator: 'gt' | 'gte' | 'eq' | 'lt' | 'lte';

  // Charge amount in cents (USD)
  charge_amount: number;  // e.g., 100 = $1.00

  // Charge mode
  mode: 'per_trigger' | 'top_up';

  // Top-up amount (if mode === 'top_up')
  top_up_amount?: number;

  // Session scope — does threshold reset per session or accumulate?
  scope: 'per_session' | 'cumulative';

  // Max monthly charge (enforced by engine, not Stripe)
  monthly_cap_cents: number;  // default: 5000 ($50)
}
```

### Engine Logic / 引擎邏輯

```
Input:  events_agg row (new or updated session aggregate)
        app_config (from Postgres)
        user_monthly_total (sum of charges for this user this month)

Engine:

1.  IF user_monthly_total >= monthly_cap_cents
      → SKIP (monthly cap reached, do nothing)
      → LOG: cap_reached

2.  LOAD app_config.threshold_configs
    FOR each threshold_config:
      a. Extract metric_value from events_agg
      b. Compare metric_value against threshold using operator
      c. IF threshold crossed:
           IF user has no PaymentMethod on file:
             → RETURN { action: 'setup_required', client_secret }
           ELSE:
             → FIRE PaymentIntent
               amount = charge_amount
               application_fee_amount = charge_amount * 0.25
               description = "Behavior threshold: ${metric} > ${threshold}"

3.  After PaymentIntent success/failure:
    WRITE to charges table
    IF mode === 'top_up':
      UPDATE customer_balance
```

### Edge Cases / 邊界情況

| Case | Behavior |
|------|----------|
| 情況 | 行為 |
| User reaches cap mid-month | Reject charge, log cap_reached, emit user notification |
| Stripe charge fails (insufficient funds) | Log failed_charge, retry once at 24h, then flag for admin review |
| Multiple thresholds crossed in one batch | Fire one charge per threshold (dedup by config_id + session_id) |
| SDK offline for extended period | Events queue locally, flush on reconnect, engine handles backdated aggregates |

---

## 6. Stripe Connect Payment Flow / Stripe Connect 支付流程

### Architecture / 架構

```
[End User]                              [App's Stripe Account]        [Still Kinetic Platform]
    │                                          │                              │
    ├── SetupIntent (one-time) ─────────────► │                              │
    │  (usage: off_session)                   │                              │
    │  (mandate disclosed: rate + threshold)  │                              │
    │  ◄── client_secret ─────────────────── │                              │
    │                                          │                              │
    │  [Future threshold crosses]              │                              │
    ├── events → SDK → backend ───────────────┼──────────────────────────────┤
    │                                          │                              │
    │                     PaymentIntent ──────►│                              │
    │                     (off_session: true,  │                              │
    │                      confirm: true,      │                              │
    │                      amount: $1.00,      │                              │
    │                      application_fee     │                              │
    │                      _amount: $0.25)     │                              │
    │                                          │                              │
    │                     ◄── succeeds ────── │                              │
    │                                          │   $0.75 settles to app       │
    │                                          │   $0.25 settles to platform  │
    │                                          │   (atomic split, one tx)     │
```

### Step-by-Step / 逐步流程

#### Step 1: One-Time SetupIntent (Mandatory) / 一次性 SetupIntent（強制）

This is **NOT optional** — it's a Stripe technical requirement for off-session charging. Without it, charges will be declined by the bank.

```
When end user first crosses a threshold:

SDK → POST /api/setup-required { appId, userId }
Server:
  1. Create Stripe Customer (if none)   ── attached to connected account
  2. Create SetupIntent with:
     usage: 'off_session',
     on_behalf_of: connected_account_id
  3. Return client_secret to SDK
  
SDK opens Stripe Elements / Checkout:
  - End user enters card
  - Disclosures (MANDATORY, must be visible):
    * "You will be charged automatically based on usage"
    * Rate: $X per [metric] threshold
    * Threshold: [value] [metric]
    * Monthly cap: $50
    * No per-action prompts — silent charges after this setup
  - SetupIntent confirmed → PaymentMethod saved

Server stores: { userId, stripeCustomerId, stripePaymentMethodId, setupConfirmedAt }
```

**Stripe mandate text requirements (EU/UK SCA compliance):**
> "By providing your payment method, you authorize [App Name] to charge your payment method automatically based on usage thresholds set by [App Name]. You can cancel at any time from your dashboard. Charges will not exceed $50 per month."

#### Step 2: Off-Session PaymentIntent (All Future Charges) / 離線 PaymentIntent（所有後續扣款）

```
When threshold crossed AND PaymentMethod on file:

Server:
  1. Check monthly cap (see Section 9)
  2. If cap OK:
     const paymentIntent = await stripe.paymentIntents.create({
       amount: charge_amount_cents,       // e.g., 100 = $1.00
       currency: 'usd',
       customer: stripeCustomerId,
       payment_method: stripePaymentMethodId,
       off_session: true,
       confirm: true,
       application_fee_amount: fee_cents, // e.g., 25 = $0.25
       transfer_data: {
         destination: connected_account_id,
       },
       description: `Still Kinetic: ${metric} threshold crossed`,
       metadata: {
         app_id: appId,
         user_id: userId,
         threshold_metric: metric,
         threshold_value: threshold.toString(),
       },
     });
  3. On success → write to charges table → fire receipt webhook
  4. On failure → log + retry at 24h → if still fails, flag admin
```

#### Step 3: Webhook Handling / Webhook 處理

```
stripe webhooks:
  payment_intent.succeeded → mark charge complete, update ledger
  payment_intent.payment_failed → log failure, notify user via app
  setup_intent.succeeded → update user setup status
  setup_intent.setup_failed → notify user to retry card entry
```

### Top-Up Variant (Optional) / 預充值變體（可選）

Instead of per-trigger charges, use Stripe Customer Balance:
1. First threshold: create SetupIntent + charge top-up amount (e.g. $5)
2. Funds accrue in Customer Balance on the connected account
3. Subsequent thresholds: deduct from balance via `stripe.customers.updateBalanceTransaction`
4. When balance < threshold × 2: auto-trigger new top-up charge
5. **Caveat:** Stripe Customer Balance does NOT natively split via `application_fee_amount` — you'd need a second Stripe Transfers API call to move your 25% cut. **Per-trigger with `application_fee_amount` is strictly superior.** (See FAQ analysis.)

### Fee Structure / 費用結構

| Component | Amount | Destination |
|-----------|--------|-------------|
| 組成 | 金額 | 去向 |
| Total charge | $1.00 | — |
| Stripe processing fee | ~$0.029 + 2.9% | Stripe |
| App owner (connected account) | $0.75 − Stripe fee | App's Stripe balance |
| Still Kinetic (platform) | $0.25 | Platform Stripe balance |

Stripe fee is charged once on the full amount — no additional fee for the split.

---

## 7. Dashboard Roles / 儀表板角色

### Two-Role System / 雙角色系統

| Role | Access Scope | Can See | Can Do |
|------|-------------|---------|--------|
| 角色 | 存取範圍 | 可查看 | 可操作 |
| **Manager** (you / 你) | All apps, global | All app metrics, all charges, total revenue, take-rate config, cross-app analytics | Configure platform take rate (%), view all apps, manage connected accounts, view Stripe account balance |
| **Admin** (app owner / 應用擁有者) | Own app only | Own users' aggregate metrics, own threshold/price config, own payout history, own charge logs (no PII of other apps) | Set thresholds per metric, set price per trigger, view own revenue split, view own payout history |

### Manager Dashboard View / 管理者儀表板視圖

```
┌─────────────────────────────────────────────────┐
│  Still Kinetic — Manager Dashboard              │
├─────────────────────────────────────────────────┤
│  Overview                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Apps     │ │ Total Rev│ │ Charges  │        │
│  │ 12       │ │ $3,420   │ │ Today: 47│        │
│  └──────────┘ └──────────┘ └──────────┘        │
│                                                  │
│  App List                                        │
│  ├─ BookReader Pro     $1,240     25%  │
│  ├─ StudyFlash        $890       25%  │
│  ├─ CodeDrill         $720       25%  │
│  └─ ...                                    │
│                                                  │
│  Global Take Rate: [25%] ▼                     │
│  Platform Fee Tier: Free / $49 / $199          │
└─────────────────────────────────────────────────┘
```

### Admin Dashboard View / 管理員儀表板視圖

```
┌─────────────────────────────────────────────────┐
│  Still Kinetic — Admin Dashboard (BookReader)  │
├─────────────────────────────────────────────────┤
│  Your App: BookReader Pro                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Active   │ │ Revenue  │ │ Pending  │        │
│  │ Users: 85│ │ This Mo: │ │ Payout:  │        │
│  │          │ │ $340     │ │ $255     │        │
│  └──────────┘ └──────────┘ └──────────┘        │
│                                                  │
│  Threshold Config                                │
│  ┌──────────────┬──────────┬───────┬──────────┐ │
│  │ Metric       │ Threshold│ Price │ Status   │ │
│  ├──────────────┼──────────┼───────┼──────────┤ │
│  │ stay_duration│ 5 min    │ $1.00 │ 🟢 Active│ │
│  │ scroll_length│ 1000px   │ $0.50 │ 🟢 Active│ │
│  │ press_count  │ 50       │ $0.25 │ 🔴 Off   │ │
│  └──────────────┴──────────┴───────┴──────────┘ │
│                                                  │
│  Recent Charges                                  │
│  ┌──────────┬──────────┬───────┬──────────────┐ │
│  │ User     │ Amount   │ Date  │ Status       │ │
│  ├──────────┼──────────┼───────┼──────────────┤ │
│  │ user_123 │ $1.00    │ 07/07 │ ✅ settled   │ │
│  │ user_456 │ $0.50    │ 07/06 │ ✅ settled   │ │
│  └──────────┴──────────┴───────┴──────────────┘ │
│                                                  │
│  Monthly Cap: $50.00 per user                   │
└─────────────────────────────────────────────────┘
```

### Auth / 認證

- JWT-based session (NextAuth or custom)
- Manager: seed account created at deployment — not self-registerable
- Admin: created when app owner installs SDK and connects Stripe account via OAuth
- End user: no dashboard access by default (optional self-serve view for usage history + cancel)

---

## 8. Backend Stack Specification / 後端技術棧規格

### Full Stack / 完整技術棧

| Layer | Choice | Rationale |
|-------|--------|-----------|
| 層級 | 技術選擇 | 理由 |
| **Core language** | TypeScript | SDK + backend + dashboard all TS — minimal context switching |
| **SDK (core)** | TS with platform adapters | `@stillkinetic/core` + `@stillkinetic/web` / `@stillkinetic/rn` / `@stillkinetic/electron` |
| **Ingestion API** | Fastify or Cloudflare Workers | High write volume, low latency — Workers for serverless, Fastify for dedicated |
| **Event queue** | Redis Streams or AWS SQS | Decouple burst writes from processing; SQS if already on AWS, Redis if lighter infra |
| **Worker** | Node (stateless) | Reads queue, computes aggregates, checks thresholds, fires Stripe calls |
| **Database** | Postgres | Append-only events + config + ledger — source of truth for audit/disputes |
| **ORM / DB client** | Drizzle or Prisma | Type-safe, migration tooling built-in |
| **Dashboard** | Next.js + Postgres | Full-stack React, server components for data-heavy pages |
| **Auth** | NextAuth / JWT | Two roles (Manager, Admin) — simple, no org tree needed |
| **Stripe** | Stripe Connect (Standard) | `application_fee_amount`, `on_behalf_of`, `transfer_data` |
| **Deployment** | Docker + Vercel/Railway | Worker + API in Docker, dashboard on Vercel, Postgres on Railway or Supabase |

### Database Tables / 資料庫表

```sql
-- Apps registered with Still Kinetic
CREATE TABLE apps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(128) NOT NULL,
  api_key             VARCHAR(64) UNIQUE NOT NULL,
  stripe_account_id   VARCHAR(64),          -- Stripe Connect account ID
  threshold_config    JSONB NOT NULL DEFAULT '{}',
  platform_fee_tier   VARCHAR(16) DEFAULT 'free',
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- End users (per app)
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id              UUID REFERENCES apps(id),
  external_user_id    VARCHAR(128),          -- app's own user ID
  stripe_customer_id  VARCHAR(64),
  stripe_payment_method_id VARCHAR(64),
  setup_confirmed_at  TIMESTAMPTZ,          -- NULL until SetupIntent done
  monthly_charge_total_cents INTEGER DEFAULT 0,
  billing_cycle_month VARCHAR(7),            -- '2026-07'
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(app_id, external_user_id)
);

-- All charges (append-only)
CREATE TABLE charges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id              UUID REFERENCES apps(id),
  user_id             UUID REFERENCES users(id),
  stripe_payment_intent_id VARCHAR(64),
  amount_cents        INTEGER NOT NULL,
  fee_cents           INTEGER NOT NULL,       -- application_fee_amount
  currency            VARCHAR(3) DEFAULT 'usd',
  metric              VARCHAR(32),            -- which threshold was crossed
  metric_value        DOUBLE PRECISION,
  status              VARCHAR(16) DEFAULT 'pending', -- pending|succeeded|failed
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Raw events (write-once, see Section 4)
CREATE TABLE events_raw (...);
CREATE TABLE events_agg (...);
```

### Service Endpoints / 服務端點

```
POST   /api/events             ─ SDK batch event ingestion (X-API-Key)
POST   /api/setup-required     ─ Initiate SetupIntent flow
POST   /api/setup-confirmed    ─ Confirm SetupIntent complete
GET    /api/health             ─ Health check
─── Dashboard API ───
GET    /api/apps               ─ List apps (Manager) / own app (Admin)
GET    /api/apps/:id/metrics   ─ App metrics & aggregates
PUT    /api/apps/:id/threshold ─ Update threshold config
GET    /api/apps/:id/charges   ─ Charge history
GET    /api/revenue            ─ Global revenue (Manager only)
─── Stripe Webhooks ───
POST   /webhooks/stripe        ─ payment_intent.*, setup_intent.* events
```

---

## 9. Monthly Cap Enforcement / 每月上限執行

### Design Principle / 設計原則

The $50 monthly cap is enforced **application-layer** — it is NOT a Stripe object. Stripe does not have a native "monthly max per user" concept that interacts cleanly with Connect splits. Enforcing it in your own backend is simpler, cheaper, and more auditable.

### Data Model / 資料模型

```typescript
// Per user, per calendar month
interface UserMonthlyCap {
  userId: string;
  month: string;           // '2026-07'
  totalChargedCents: number;  // sum of successful charges this month
  capCents: number;         // 5000 (default, configurable per app)
  lastChargeAt: string;     // ISO timestamp
}
```

### Enforcement Flow / 執行流程

```
Before every PaymentIntent creation:

1. READ user.monthly_charge_total_cents (from users table)
   + billing_cycle_month

2. CHECK if billing_cycle_month matches current month
   ├─ YES → use existing total
   └─ NO  → reset total to 0, update billing_cycle_month

3. COMPARE totalChargedCents + chargeAmountCents > capCents
   ├─ YES → REJECT charge
   │        LOG: { action: 'cap_reached', user_id, month, total, cap }
   │        EMIT: webhook to app (optional notification to user)
   │        RETURN: { action: 'blocked', reason: 'monthly_cap_reached' }
   └─ NO  → PROCEED with PaymentIntent

4. AFTER PaymentIntent succeeds:
   UPDATE users SET
     monthly_charge_total_cents = monthly_charge_total_cents + amount_cents
   WHERE id = userId;
```

### Reset Logic / 重置邏輯

- Caps reset on the **1st of each month at 00:00 UTC**
- Reset is implicit: first charge of new month detects `billing_cycle_month !== current_month` and resets
- No cron job needed — the check is part of the charge flow

### Edge Cases / 邊界情況

| Scenario | Behavior |
|----------|----------|
| 場景 | 行為 |
| User charges $49 in June, $2 attempted on June 30 → July 1 | $2 rejected (cap: total would be $51). Next charge on July 1 resets, $2 succeeds. |
| App changes cap from $50 to $100 mid-month | Engine reads app config dynamically — new charges use new cap. Already-charged total carries over. |
| User has multiple PaymentMethods across sessions | Single Stripe Customer ID, single monthly total — unaffected. |
| PaymentIntent succeeds but charge is later disputed/refunded | Refunded amounts do NOT restore monthly cap allocation (by design — prevents gaming). |

### TypeScript Implementation Sketch / TypeScript 實現草稿

```typescript
async function enforceMonthlyCap(
  userId: string,
  appId: string,
  chargeAmountCents: number
): Promise<{ allowed: boolean; reason?: string }> {
  const user = await db.users.findOne({ id: userId, app_id: appId });
  const app = await db.apps.findOne({ id: appId });
  
  const currentMonth = new Date().toISOString().slice(0, 7); // '2026-07'
  const cap = app.threshold_config?.monthly_cap_cents ?? 5000; // default $50
  
  if (user.billing_cycle_month !== currentMonth) {
    // New month — reset
    await db.users.update(
      { id: userId },
      { monthly_charge_total_cents: 0, billing_cycle_month: currentMonth }
    );
    return { allowed: true };
  }
  
  const newTotal = user.monthly_charge_total_cents + chargeAmountCents;
  if (newTotal > cap) {
    return { allowed: false, reason: 'monthly_cap_reached' };
  }
  
  return { allowed: true };
}
```

---

## 10. Build Order / 構建順序

### Phase 0: Foundation (Weeks 1–2) / 基礎階段（第 1–2 週）

- [ ] Initialize monorepo (pnpm workspaces / turborepo)
- [ ] Set up TypeScript configs (core + platform adapters)
- [ ] Create `@stillkinetic/core` with event schema types
- [ ] Set up Postgres schema (migrations via Drizzle/Prisma)
- [ ] Scaffold Fastify API server with health endpoint
- [ ] Set up Docker Compose (Postgres + Redis + API + Worker)
- [ ] CI/CD: GitHub Actions → lint, test, build
- [ ] **Deliverable:** empty app boots, health check returns 200

### Phase 1: SDK Core & Ingestion (Weeks 3–4) / SDK 核心與接入（第 3–4 週）

- [ ] Build `@stillkinetic/web` adapter: press, scroll, type, stay listeners
- [ ] Implement event batching (5s interval, max 100 events)
- [ ] Implement `/events` endpoint with API key auth + schema validation
- [ ] Write Redis Streams queue consumer
- [ ] Write Node worker: dequeue → compute session aggregates → write to Postgres
- [ ] Add retry + backoff for failed event ingestion
- [ ] **Deliverable:** SDK sends events → queue → worker → Postgres pipeline works end-to-end

### Phase 2: Threshold Engine (Weeks 5–6) / 閾值引擎（第 5–6 週）

- [ ] Build threshold config storage (JSONB in apps table)
- [ ] Write threshold evaluation logic (stateless, deterministic)
- [ ] Wire threshold check into worker pipeline
- [ ] Handle all edge cases (multi-threshold, per-session vs cumulative)
- [ ] Add logging: threshold_crossed, cap_reached, no_payment_method
- [ ] **Deliverable:** engine detects threshold crossing in aggregate stream

### Phase 3: Stripe Connect Integration (Weeks 7–8) / Stripe Connect 整合（第 7–8 週）

- [ ] Create Stripe Connect platform account
- [ ] Implement Connect Onboarding flow for app owners (OAuth)
- [ ] Build `/setup-required` endpoint: create SetupIntent, return client_secret
- [ ] Build `/setup-confirmed` endpoint: store PaymentMethod reference
- [ ] Build PaymentIntent orchestration with `application_fee_amount`
- [ ] Implement Stripe webhook handlers:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `setup_intent.succeeded`
  - `setup_intent.setup_failed`
- [ ] Write charges table (append-only ledger)
- [ ] **Deliverable:** full charge flow: threshold → PaymentIntent → receipt

### Phase 4: Monthly Cap & Ledger (Week 9) / 每月上限與帳本（第 9 週）

- [ ] Implement `enforceMonthlyCap()` in charge pipeline
- [ ] Build reset logic (first charge of month, implicit reset)
- [ ] Write charge history query with pagination
- [ ] Add async receipt notification (in-app toast via webhook to app)
- [ ] **Deliverable:** charges respect $50 cap, all recorded in ledger

### Phase 5: Dashboard (Weeks 10–11) / 儀表板（第 10–11 週）

- [ ] Scaffold Next.js app with auth (NextAuth + JWT)
- [ ] Manager view:
  - [ ] App list with revenue per app
  - [ ] Global charge log
  - [ ] Take-rate configuration (25% default, adjustable)
- [ ] Admin view:
  - [ ] Own app metrics (active users, revenue, pending payout)
  - [ ] Threshold configuration UI (add/edit/remove thresholds)
  - [ ] Charge history table
  - [ ] Monthly cap setting
- [ ] Stripe Connect OAuth flow in dashboard (app connects Stripe account)
- [ ] **Deliverable:** dashboard operational; app owners can configure thresholds

### Phase 6: RN & Desktop Adapters (Weeks 12–13) / React Native 與桌面適配器（第 12–13 週）

- [ ] Build `@stillkinetic/rn` adapter:
  - [ ] Press: gesture responder bridge
  - [ ] Scroll: `onScroll` delta + content size computation
  - [ ] Type: `onChangeText` timing with IME noise normalization
  - [ ] Stay: `AppState` + React Navigation focus lifecycle
- [ ] Build `@stillkinetic/electron` adapter:
  - [ ] Preload script with IPC bridge
  - [ ] Same DOM listeners as web adapter
- [ ] Build `@stillkinetic/tauri` adapter (if time permits)
- [ ] Write shared integration tests across all three adapters
- [ ] Publish all three packages to npm
- [ ] **Deliverable:** three platform-specific packages on npm, all passing integration tests

### Phase 7: Polish & Docs (Week 14) / 打磨與文檔（第 14 週）

- [ ] Write SDK README with quickstart for each platform
- [ ] Write API documentation (OpenAPI/Swagger)
- [ ] Add dashboard tooltips + empty states
- [ ] Load testing: simulate 100 concurrent SDKs, 10K events/min
- [ ] Security audit: API key rotation, rate limiting, CSRF on dashboard
- [ ] Staging deployment (Railway/Supabase + Vercel)
- [ ] **Deliverable:** deployable MVP with docs

### Phase 8: Launch Prep (Week 15+) / 發布準備（第 15 週+）

- [ ] Stripe Connect platform verification (submit to Stripe)
- [ ] Create landing page + Product Hunt launch plan
- [ ] Write Indie Hackers / HN launch post
- [ ] Recruit 2–3 pilot app developers
- [ ] Monitor chargeback rate (target: < 0.5%)
- [ ] **Deliverable:** live product with real app integrations

---

## 11. Deployment + Compliance Checklist / 部署與合規檢查清單

### Pre-Deployment / 部署前

#### Infrastructure / 基礎設施

- [ ] Postgres instance provisioned (Railway, Supabase, or AWS RDS)
- [ ] Redis instance provisioned (Upstash, Redis Cloud, or ElastiCache)
- [ ] Docker images built for API + Worker
- [ ] Domain + TLS configured (e.g., `api.stillkinetic.com`, `app.stillkinetic.com`)
- [ ] Environment variables managed (no hardcoded secrets):
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `DATABASE_URL`
  - `REDIS_URL`
  - `JWT_SECRET`
  - `PLATFORM_STRIPE_ACCOUNT_ID`
- [ ] Rate limiting on `/events` endpoint (e.g., 100 req/sec per API key)
- [ ] API key rotation mechanism (admin dashboard → regenerate key)

#### Stripe Connect / Stripe Connect

- [ ] Stripe Connect platform account created (Standard type)
- [ ] Connect Onboarding configured (redirect_uris, brand settings)
- [ ] Webhook endpoints registered in Stripe dashboard
- [ ] `application_fee_amount` policy defined (default: 25%)
- [ ] Connected account requirements verified (no additional verification for Standard accounts)
- [ ] Test mode vs live mode: all E2E tests pass in test mode first

### Compliance / 合規

#### Mandatory Disclosures (Non-Negotiable) / 強制揭露（不可協商）

These are not policy opinions — they are Stripe technical requirements for off-session charging. Omission will cause charge failures and account termination.

- [ ] **One-time SetupIntent with mandate text:**
  > "By providing your payment method, you authorize [App Name] to charge your payment method automatically based on usage thresholds set by [App Name]. You can cancel at any time from your dashboard. Charges will not exceed $50 per month."
- [ ] **Threshold + rate visible at setup** (not buried in terms of service)
- [ ] **Monthly cap ($50) displayed** before card entry
- [ ] **Itemized receipt per charge** (email or in-app notification, not necessarily UI-blocking)
- [ ] **Usage history available** to end user (optional self-serve dashboard)

#### Platform Policies / 平台政策

- [ ] Terms of Service drafted (covering SDK usage, fee structure, data handling)
- [ ] Privacy Policy drafted (covering event tracking, data retention, Stripe data sharing)
- [ ] App store compliance review:
  - Apple App Store: no hidden SDKs, disclosed tracking + billing
  - Google Play Store: user consent for behavior tracking
- [ ] GDPR / CCPA:
  - Data Processing Agreement (DPA) with app owners
  - Right to deletion: end user can request event data removal
  - Data retention: raw events auto-deleted after 90 days
- [ ] PCI-DSS: handled by Stripe (SAQ A — no card data touches your servers)

#### Monitoring & Alerts / 監控與警報

- [ ] Stripe account health: monitor for Radar flags, dispute rate, account restrictions
- [ ] Chargeback rate target: < 0.5% (industry standard for low-risk billing)
- [ ] Error rate: PaymentIntent failure rate < 2%
- [ ] Ingestion pipeline: event lag < 30s (if queue backlog > 10K → alert)
- [ ] Dashboard: weekly revenue report, failed charge review, new app signups
- [ ] Webhook health: all Stripe webhooks return 200 within 5s

#### Launch Checklist / 發布檢查清單

- [ ] All E2E tests pass in Stripe test mode
- [ ] Stripe Connect platform submitted for review (takes 1–5 business days)
- [ ] Dashboard responsive on mobile (app owners configure from phone)
- [ ] SDK packages published to npm (`@stillkinetic/core`, `@stillkinetic/web`, `@stillkinetic/rn`, `@stillkinetic/electron`)
- [ ] Quickstart guide written (5 minutes to integrate)
- [ ] Pilot apps onboarded (2–3 developers)
- [ ] Monitoring dashboard (Grafana or Datadog) operational
- [ ] Incident response runbook documented:
  - Stripe charge failures → check Radar, check PaymentMethod expiry
  - Queue backlog spike → scale worker replicas
  - Dashboard down → Vercel auto-rollback to last stable deploy

---

## Appendices / 附錄

### A. SWOT Analysis / SWOT 分析

| Strength / 優勢 | Weakness / 劣勢 |
|----------------|----------------|
| S1 — Real blue ocean: no one does behavior-triggered billing | W1 — Zero code, concept stage |
| S2 — Stripe Metronome ($1B) validates billing-exit path | W2 — High market education cost |
| S3 — Clear product shape: SDK + API + threshold + balance | W3 — Browser Web Monetization API still W3C draft |
| S4 — Developer community (Indie Hackers / HN / Product Hunt) | W4 — Low build barrier, large SaaS may build in-house |
| **Opportunity / 機會** | **Threat / 威脅** |
| O1 — Stripe ecosystem attention on billing innovation | T1 — Stripe expands Billing into behavior triggers |
| O2 — Usage-based gap filled by Metronome, behavior gap open | T2 — Orb ($19M funded) may expand into behavior triggers |
| O3 — First SDK provider if Web Monetization API standardizes | T3 — Community penetration takes sustained effort |
| O4 — Content monetization demand (ad fatigue, sub fatigue) | T4 — Window may not mature within 12 months |

### B. Glossary / 術語表

| Term | English | Chinese |
|------|---------|---------|
| Threshold | Configurable value trigger | 閾值 |
| Off-session | Stripe charge without user present | 離線扣款 |
| SetupIntent | One-time card setup for future charges | 一次性卡號設定 |
| PaymentIntent | Stripe's charge object | 支付意圖 |
| application_fee_amount | Platform's cut in a Connect charge | 平台抽成金額 |
| Connected account | The app's Stripe account | 關聯帳戶 |
| Mandate | Legal authorization for recurring charges | 授權指令 |
| Customer Balance | Stripe's internal balance object | 客戶餘額 |
| Take rate | Percentage fee per transaction | 抽成比例 |
| SCA | Strong Customer Authentication (EU/UK) | 強客戶認證 |

### C. Key Design Constraints / 關鍵設計約束

> **One-time consent is NOT optional.**
>
> It is a Stripe technical requirement for off-session charging.
> Without SetupIntent `usage: off_session`, the charge call will be declined by the bank.
> This is an engineering constraint, not a policy position.

> **The monthly cap ($50) is enforced at the application layer, not in Stripe.**
>
> Stripe has no native per-user monthly cap that works with Connect splits.
> Enforcing it in your own backend is simpler, cheaper, and more auditable.

> **Per-trigger charge with `application_fee_amount` is strictly superior to top-up-to-balance.**
>
> Top-up requires manual split logic (Stripe Transfers API) and two audit trails.
> Per-trigger splits atomically in one transaction — one API call, one fee, one audit record.

---

*© 2026 Still Kinetic. Built with insight from Stripe's Metronome acquisition gap.*
*「Stripe 買了 $10B 的用量計費，但行為觸發的缺口依然敞開 — 這個窗口不會永遠開著。」*
