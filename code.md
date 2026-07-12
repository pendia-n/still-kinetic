# 代码审查报告：StillKinetic

> 审查日期：2026-07-12
> 项目路径：`~/mvp/still-kinetic/`

---

## 一、项目概述

StillKinetic 是一个**用量计费基础设施平台**，允许开发者（App 管理员）针对最终用户的特定行为（点击、滚动、停留时长等）设置阈值，当用户行为超过阈值时通过 Stripe 自动扣费，平台抽取 25% 手续费用给开发者。

项目分为两个主要部分：

- **management/** — SvelteKit 管理后台（部署在 Cloudflare Workers 上），包含开发者仪表盘、API 端点（事件接收、阈值管理、Stripe 集成、TOTP 2FA 等）。
- **tracking-sdk/** — 客户端 SDK 包，分为 Web SDK 和 React Native SDK，负责在最终用户设备上采集行为指标并分批上报。

---

## 二、技术栈

### management/（后台）

| 层 | 技术 |
|---|---|
| 框架 | Svelte 5 (runes mode) + SvelteKit 2 |
| 部署 | Cloudflare Workers（`@sveltejs/adapter-cloudflare`） |
| 数据库 | Cloudflare D1（SQLite 系，通过 Drizzle ORM） |
| 认证 | JWT（`jose` 库）+ TOTP（自实现 Web Crypto） |
| 支付 | Stripe（自定义 HTTP Client，未使用官方 npm 包） |
| 密码学 | PBKDF2（Web Crypto）+ bcryptjs fallback |
| 验证 | valibot |
| 构建 | Vite 8 + wrangler 4 |

### tracking-sdk/

| 包 | 技术 |
|---|---|
| `@stillkinetic/web-sdk` | TypeScript, tsup, `@stripe/stripe-js` |
| `@stillkinetic/rn-sdk` | TypeScript, tsup, React, React Native, `@stripe/stripe-react-native` |

---

## 三、项目目录结构

```
still-kinetic/
├── management/
│   ├── wrangler.jsonc              # CF Workers 配置
│   ├── vite.config.ts              # Vite 构建配置（启用 runes mode）
│   ├── package.json                # 依赖：bcryptjs, jose, qrcode, valibot
│   ├── tsconfig.json
│   ├── drizzle.config.ts           # D1 数据库迁移配置
│   ├── worker-configuration.d.ts   # Wrangler 生成的类型
│   └── src/
│       ├── app.d.ts                # 全局类型声明（Platform.env, Locals）
│       ├── app.css                 # 全局样式 / 主题系统
│       ├── app.html                # HTML 模板
│       ├── lib/
│       │   ├── index.ts            # 空占位
│       │   └── server/
│       │       ├── db/
│       │       │   ├── schema.ts   # D1 表定义（Drizzle）
│       │       │   ├── client.ts   # 惰性全局 db 实例
│       │       │   └── index.ts    # 工厂函数 getDb()
│       │       ├── crypto.ts       # PBKDF2 密码哈希（Web Crypto）
│       │       ├── totp.ts         # 自实现 TOTP（RFC 6238）
│       │       ├── auth.ts         # JWT 签发/验证
│       │       ├── stripe.ts       # Stripe 自定义 HTTP Client
│       │       ├── metrics.ts      # 指标定义 & 配置常量
│       │       └── thresholdEngine.ts  # 阈值触发 + Stripe 扣费引擎
│       └── routes/
│           ├── +layout.svelte      # 全局布局（侧栏导航）
│           ├── +page.svelte        # 着陆页
│           ├── auth/+page.svelte   # 登录页
│           ├── register/+page.svelte  # 注册页
│           ├── dashboard/
│           │   ├── +page.svelte          # Manager 总览
│           │   ├── earnings/+page.svelte # Manager 收入看板
│           │   ├── admin/+page.svelte           # 开发者应用列表
│           │   └── admin/app/[id]/+page.svelte  # 应用详情
│           └── api/
│               ├── apps/             # CRUD
│               │   ├── +server.ts
│               │   ├── [id]/+server.ts
│               │   ├── [id]/thresholds/+server.ts
│               │   └── config/+server.ts
│               ├── events/+server.ts    # SDK 事件接收
│               ├── auth/
│               │   ├── login/+server.ts, register/+server.ts
│               │   └── totp/provision/+server.ts, totp/verify-login/+server.ts
│               ├── stripe/
│               │   ├── subscription/+server.ts, connect/+server.ts
│               │   └── webhook/+server.ts
│               └── end-user/
│                   ├── config/+server.ts     # 卡绑定 + 额度设置
│                   └── bind-card/+server.ts  # SetupIntent 初始化
│
└── tracking-sdk/
    └── packages/
        ├── web/
        │   └── src/
        │       ├── index.ts                 # StillKinetic 主类
        │       ├── core/types.ts            # 类型定义
        │       ├── transport/batchSender.ts # 事件批处理/发送
        │       ├── trackers/pressTracker.ts # 点击追踪
        │       ├── trackers/scrollTracker.ts# 滚动追踪（长度+速度）
        │       ├── trackers/typeTracker.ts  # 打字速度追踪
        │       ├── trackers/stayTracker.ts  # 停留时长追踪
        │       └── billing/CardBind.ts      # Stripe 卡绑定流程
        └── react-native/
            └── src/
                ├── index.ts                 # useStillKinetic hook
                ├── core/types.ts            # 类型定义
                ├── transport/batchSender.ts # RN 批处理发送
                ├── trackers/pressTracker.ts
                ├── trackers/scrollTracker.ts
                ├── trackers/typeTracker.ts
                └── trackers/stayTracker.ts
```

---

## 四、数据流

```
[最终用户设备]                    [平台后台 - Cloudflare Workers]          [Stripe]
      |                                     |                              |
      | SDK 采集事件                        |                              |
      | (press, scroll, type, stay)        |                              |
      |                                     |                              |
      |--- 批处理 5s/200条 --->|            |                              |
      |    POST /api/events    |            |                              |
      |    X-Api-Key: sk_xxx  |            |                              |
      |                         |           |                              |
      |                         |-- 校验 API Key -> lookup app ---------->|
      |                         |-- 校验 subscription active              |
      |                         |-- 校验 metric allowed                   |
      |                         |                                          |
      |                         |-- upsert event_aggregates  --------------|
      |                         |    (累计值 / 瞬时值)                    |
      |                         |                                          |
      |                         |-- 检查 threshold 是否触发 ---------------|
      |                         |    effective = value - baseline         |
      |                         |    if e >= th: 执行扣费                  |
      |                         |                                          |
      |                         |-- Stripe PaymentIntent 创建 -->----------|
      |                         |    amount + application_fee              |
      |                         |    transfer_data -> connect account      |
      |                         |                                          |
      |                         |-- 更新 trigger_logs + baseline ---------|
```

### 指标分类

- **累计指标**（CUMULATIVE_METRICS）：press_count, scroll_length, stay_duration, swipe_count 等 —— 值持续累加，扣费后更新 baseline_value。
- **瞬时指标**（INSTANTANEOUS_METRICS）：scroll_speed, type_speed, pinch_zoom_count —— 每次覆盖，有 60s 冷却。
- 阈值比较：累计型用 `value - baseline_value`，瞬时型直接用 `value`。

---

## 五、核心逻辑关键点

### 1. 认证体系

- JWT（HS256，7 天有效期）存储在 localStorage `sk_token`
- TOTP 双因素认证：两步登录流程
  - 第一步：用户名/密码验证通过后，返回 `loginToken`（5 分钟有效 temp JWT）
  - 第二步：提交 TOTP 码 + loginToken，验证通过后返回真实 JWT
- 角色系统：`manager`（平台管理员，可见所有 app）和 `admin`（普通开发者，仅见自己的 app）

### 2. 应用与订阅

- 应用分两个 tier：`basic`（$2/周，最多 2 个指标）和 `full`（$10/周，全部 16 个指标）
- Stripe 预创建 Price ID 在环境变量中（`STRIPE_PRICE_BASIC` / `STRIPE_PRICE_FULL`）
- 订阅通过 Stripe Checkout Session 创建，webhook 处理后续状态变更

### 3. 阈值引擎（thresholdEngine.ts）

- 事件进入后先 upsert `event_aggregates` 表
- 检查是否有匹配的 threshold → 超过阈值 → 检查冷却（瞬时指标）→ 执行 Stripe 扣费
- 扣费成功：更新 `baseline_value`（累计型），记录 `trigger_logs`，更新 `period_spend_cents`
- 扣费失败（如 Stripe 拒绝）：记录失败日志，不阻塞
- 消费额度控制：`spending_cap_cents` / `spending_cap_period`，周期性重置

### 4. SDK 事件采集

- Web SDK：`StillKinetic` 类 → `init()` 拉取服务端配置 → `start()` 启用追踪
- RN SDK：`useStillKinetic` Hook → 加载时拉取配置 → 返回 `onScroll`, `onPressIn`, `onChangeText` 处理器
- 批处理：5s 间隔或满 200 条触发上传，页面卸载/App 进入后台时立即刷出（sendBeacon / fetch keepalive）
- 重试机制：指数退避（1s, 2s, 4s），3 次后静默丢弃

### 5. Stripe 集成

- **未使用官方 npm 包**，自实现了 `StripeClient` 类（基于 `fetch`），兼容 CF Workers
- 支持：Customers, Checkout Sessions, Accounts (Connect Express), Account Links
- webhook 签名验证：`stripe.webhooks.constructEvent()` 实际只做了 `JSON.parse`（见下方 Bug）
- Stripe Connect：开发者在 app 详情页发起 Express 账户注册，webhook `account.updated` 标记 `connect_onboarded`

---

## 六、数据库表结构

### `users`
| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | UUID |
| username | text UNIQUE | 3-50 字符 |
| email | text UNIQUE | 可空 |
| password_hash | text | pbkdf2:100000:salt:hash 或 $2b$... |
| totp_secret | text | Base32 编码，可空 |
| role | 'manager'\|'admin' | 默认 admin |
| created_at | integer(timestamp) | ISO 字符串 |

### `apps`
| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | UUID |
| name | text | 应用名 |
| owner_id | text FK->users | 开发者 |
| tier | 'basic'\|'full' | 默认 basic |
| allowed_metrics | text | JSON 数组 |
| api_key | text UNIQUE | `sk_` 前缀 |
| stripe_connect_account_id | text | Stripe Connect 账户 |
| connect_onboarded | boolean | 是否完成注册 |
| stripe_subscription_id | text | Stripe 订阅 ID |
| stripe_customer_id | text | Stripe 客户 ID |
| subscription_status | text | active/inactive/past_due |

### `thresholds`
| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | UUID |
| app_id | text FK | 所属应用 |
| metric | text | 指标名称 |
| threshold_value | real | 触发阈值 |
| charge_amount_cents | integer | 扣费金额（美分） |

### `end_users`
| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | UUID |
| app_id + external_id | FK+unique | 应用内的最终用户标识 |
| stripe_customer_id | text | Stripe 客户 |
| stripe_payment_method_id | text | 绑定的支付方式 |
| spending_cap_cents/period | int+text | 消费额度限制 |
| period_start/period_spend_cents | int+int | 周期内累计消费 |

### `event_aggregates`
| 字段 | 类型 | 说明 |
|---|---|---|
| app_id + end_user_external_id + page_id + metric | UNIQUE | 复合唯一 |
| value | real | 当前累计值 |
| baseline_value | real | 上次触发阈值时的值 |
| last_triggered_at | timestamp | 上次扣费时间 |

### `trigger_logs`
| 字段 | 类型 | 说明 |
|---|---|---|
| app_id + end_user_external_id + metric + status | - | 扣费审计日志 |
| stripe_payment_intent_id | text | Stripe PI ID（成功时） |
| failure_reason | text | 失败原因 |

---

## 七、关键 Bug 与风险

### 🔴 严重 Bug #1：SDK 与服务器事件格式不匹配

**位置**：SDK `batchSender.ts` 与 `api/events/+server.ts`

**描述**：
- **SDK 发送的 Body**：`{ "appId": "...", "events": [...] }`
- **服务器期望的 Body**：事件对象数组 `[{ endUserId, pageId, metric, value, timestamp }]` 或单个事件对象

服务器代码：
```typescript
const events = Array.isArray(body) ? body : [body];  // body 是对象，不是数组
for (const ev of events) {                            // ev = { appId, events: [...] }
  if (!ev.metric || !isValidMetric(ev.metric))         // ev.metric === undefined
```

**影响**：所有 SDK 上报的事件都被**静默丢弃**，不会进入阈值引擎，完全无法触发扣费。

**修复方向**：SDK 端应当直接发送事件数组，API 端需要适配 `{ events: [...] }` 格式。

### 🔴 严重 Bug #2：getStripe() 缺少 env 参数

**位置**：多个文件调用 `getStripe()` 未传参

**涉及文件**：
- `thresholdEngine.ts:113` — `const stripe = getStripe();`
- `end-user/config/+server.ts:15` — `const stripe = getStripe();`
- `end-user/bind-card/+server.ts:21` — `const stripe = getStripe();`
- `webhook/+server.ts:7` — `const stripe = getStripe();`

`stripe.ts` 中的定义：
```typescript
export function getStripe(env: any) {  // 需要 env 参数
  const key = env?.STRIPE_SECRET_KEY;
```

**影响**：`env` 为 `undefined` 时，`env?.STRIPE_SECRET_KEY` 也是 `undefined`，抛出 `STRIPE_SECRET_KEY not set` 错误。

**对比**：`subscription/+server.ts:36` 和 `connect/+server.ts:17` 正确传入了 `env`。

### 🔴 严重 Bug #3：StripeClient 缺少 paymentIntents / setupIntents / paymentMethods

**位置**：`stripe.ts` 自定义 StripeClient 与 `thresholdEngine.ts` / `end-user/config/+server.ts` / `bind-card/+server.ts`

**描述**：
- `stripe.ts` 的 StripeClient 只实现了 `customers`、`checkout.sessions`、`accounts`、`accountLinks`、`webhooks`
- `thresholdEngine.ts:116` 调用 `stripe.paymentIntents.create()` — 但 StripeClient 没有此方法
- `end-user/config/+server.ts:23` 调用 `stripe.paymentMethods.attach()` — 无此方法
- `bind-card/+server.ts:41` 调用 `stripe.setupIntents.create()` — 无此方法

**影响**：这些调用会引发 `TypeError: Cannot read properties of undefined`，导致扣费流程完全中断。

**备注**：`thresholdEngine.ts:1` 还 import 了 `Stripe from 'stripe'`（npm 包），但 `stripe` 未出现在 `package.json` 依赖中。

### 🔴 严重 Bug #4：RN SDK 导出不存在的文件

**位置**：`tracking-sdk/packages/react-native/src/index.ts:11`

```typescript
export { CardBindScreen } from './billing/CardBindScreen';
```

**描述**：`tracking-sdk/packages/react-native/src/billing/CardBindScreen` 文件不存在（既无 `.ts` 也无 `.tsx`），仅 Web SDK 有 `billing/CardBind.ts`。

**影响**：RN SDK 构建时会报模块未找到错误，导致整个 SDK 无法编译。

### 🟡 中等 Bug #5：webhook 签名验证形同虚设

**位置**：`stripe.ts:97-99`

```typescript
webhooks: any = {
  constructEvent: (rawBody: string, _signature: string, _secret: string) => {
    return JSON.parse(rawBody);  // 直接解析，忽略签名
  },
};
```

**描述**：Stripe webhook 签名验证被完全绕过。任何能访问 webhook URL 的攻击者都可以伪造事件，如 `checkout.session.completed` 或 `account.updated`。

**影响**：可被利用来伪造订阅状态或 Connect 账户状态。

### 🟡 Bug #6：register 端点的导入命名冲突

**位置**：`register/+server.ts:4`

```typescript
import { verifyToken } from '$lib/server/totp';  // TOTP 验证函数
```

与 `auth.ts` 中的 JWT `verifyToken` 函数同名但不同功能。虽然当前不会混淆（注册没有 JWT 验证），但 `verifyToken` 这个命名容易产生误导，增加后续维护时的风险。

### 🟡 Bug #7：SDK BatchSender 的 apiKey 传递给方式不一致

**位置**：
- Web SDK `batchSender.ts` 发送 Body `{ appId, events }` + Header `X-Api-Key`
- RN SDK `batchSender.ts` 同样发送 `{ appId, events }` + Header `X-Api-Key`
- 服务器 `events/+server.ts` 从 `body.apiKey` 或 Header 读取

**描述**：SDK 将 apiKey 放在 Header 中，这是正确的做法。但 Body 中的 `appId` 字段未被服务端使用（服务端通过 apiKey 查库获取 appId），属于无意义的多余字段，建议移除。

### 🟡 潜在问题 #8：localStorage 存储敏感信息

**位置**：所有前端页面统一使用 `localStorage` 存储 `sk_token`（JWT 令牌）

**描述**：JWT Token 存储在 localStorage 中，使其容易受到 XSS 攻击。常见的做法是使用 HttpOnly Cookie 代替。

### ⚪ 观察：自定义 Stripe Client 的设计权衡

使用自定义 HTTP Client 而非官方 `stripe` npm 包有两个原因：
1. CF Workers 兼容性更好（不依赖 Node.js 内置模块）
2. 减小打包体积

但风险和成本也很明显：
- 缺失大量方法（已影响核心流程）
- webhook 签名验证被完全跳过
- 参数序列化逻辑需要手动维护

建议考虑 `@stripe/stripe-api` (Stripe's official fetch-based client for Workers) 或实现缺失的方法。

### ⚪ 观察：时间戳格式不一致

- `crypto.ts` 使用 `new Date().toISOString()`（ISO 8601 字符串）
- `schema.ts` 中 `created_at` 的类型定义为 `integer('created_at', { mode: 'timestamp' })`（Drizzle timestamp 模式，存储为 Unix 毫秒数）
- 但实际写入使用的是 `new Date().toISOString()`（字符串）

D1 (SQLite) 可以接受字符串，但这种类型与 ORM 定义的不匹配可能导致 Drizzle 查询行为异常。

### ⚪ 观察：阈值引擎负载

`processEvent()` 使用 fire-and-forget（`.catch()`），每个事件都会执行：
1. 一次 SELECT 查询 aggregate
2. 一次 Upsert（INSERT 或 UPDATE）
3. 一次 SELECT 查 threshold
4. 触发时：查询 app、查询 end_user、创建 PaymentIntent、批量更新 3 张表

对于高流量应用（如大量 press_count 事件），这可能会造成 D1 数据库的查询瓶颈（D1 有读取限制）。

---

## 八、架构评价

### 优势
1. **架构清晰**：SvelteKit + CF Workers + D1 的三件套架构现代化且部署简单
2. **主题系统优雅**：CSS 变量全在 `app.css` 中，仪表盘界面简洁一致
3. **TOTP 实现扎实**：手写 RFC 6238 实现，3 步时间窗口容差，不依赖第三方库
4. **Web Crypto 优先**：密码哈希、TOTP 均使用 Web Crypto API，跨平台兼容性强
5. **SDK 设计合理**：批处理 + 指数退避重试 + sendBeacon 兜底，对宿主应用零侵入
6. **阈值引擎设计巧妙**：baseline_value 机制使累计指标可在多次扣费间正确计算

### 主要风险
1. **事件数据流断裂**（Bug #1）：SDK → 服务器的事件格式不匹配是致命的，直接影响产品核心价值
2. **Stripe 集成半成品**：自定义 Client 缺失关键方法、webhook 无验证，核心扣费链路未通
3. **并发与 D1 性能**：没有考虑分布式环境下 event_aggregates 的并发更新问题
4. **安全遗漏**：webhook 签名验证为假实现、JWT 存 localStorage、无 CSP 头
5. **RN SDK 不完整**：缺少 CardBindScreen 文件，卡绑定流程在 RN 上不可用

### 改进建议
1. **优先修复事件数据流**：统一 SDK 发送格式与服务器期望格式
2. **补全 StripeClient 或迁移至官方 SDK**：实现 paymentIntents、setupIntents、paymentMethods 方法
3. **修复 webhook 签名验证**：使用 Stripe 官方 SDK 或手动验证 HMAC
4. **添加事件去重**：利用 idempotencyKey 防止重复扣费
5. **添加事务/锁机制**：防止并发扣费导致 spending cap 超限
6. **补充测试**：目前代码中没有任何测试（单元/集成/E2E）
7. **考虑 D1 优化**：高频指标（press_count）可能需要本地累积后批量写入
8. **移除 RN SDK 的 `CardBindScreen` 导出**或创建对应文件
