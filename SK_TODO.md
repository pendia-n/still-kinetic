# SK_TODO.md — Still Kinetic 行動手冊
## 2026年7月 → 2027年6月 | 行為觸發微支付引擎

---

# SWOT Analysis / SWOT 分析

## Strengths / 優勢
- **S1** — 真實技術藍海：沒有人做「行為觸發」計費（用量計費有Metronome/Orb，行為觸發沒有）
- **S2** — Stripe收購Metronome（$1B）驗證了「計費細分是真實退出路徑」
- **S3** — 產品形態清晰：JS SDK（前端）+ API（後端）+ 閾值引擎 + 餘額管理
- **S4** — 可走開發者社群（Indie Hackers/HN/Product Hunt），是六產品中最適合社群曝光的

## Weaknesses / 劣勢
- **W1** — 概念階段，零repo，零代碼
- **W2** — 市場教育成本高（行為觸發是新概念，開發者不理解）
- **W3** — 瀏覽器標準化速度慢（Web Monetization API仍在W3C提案階段，未成標準）
- **W4** — 自建門檻不算太高，大SaaS公司可能自己做

## Opportunities / 機會
- **O1** — Stripe Metronome收購後，Stripe生態對計費創新的關注度極高 → 曝光機會
- **O2** — Stripe收購只覆蓋了「用量計費」，行為觸發缺口仍在（Stripe自己也承認Billing無法處理真正規模化的複雜計費）
- **O3** — Web Monetization API若成為標準，SK是首批SDK提供者
- **O4** — 內容平台變現需求永遠存在（廣告衰退、訂閱疲勞）

## Threats / 威脅
- **T1** — Stripe自己擴充Billing功能納入行為觸發（最大威脅）
- **T2** — Orb（融資$19M）可能擴展到行為觸發領域
- **T3** — 開發者社群滲透需要時間和持續投入，與命盤福德宮限制衝突
- **T4** — 若行為觸發概念無法在12個月內獲得牽引力，市場可能永遠不會成熟

---

# 四維行動要點 / Four-Dimension Action Points

---

## 一、政策 / Policy

### 2026年7-12月
- [ ] **P1** — 追蹤Web Monetization API W3C標準化進度（目前仍為提案階段）
  - *EN: Track Web Monetization API W3C standardization progress*
- [ ] **P2** — 研究PSD3（歐盟支付服務指令第三版）對微支付的影響
  - *EN: Research PSD3 impact on micropayments*
- [ ] **P3** — Stripe Partner Program合規要求（要上Stripe App Marketplace需符合的條件）
  - *EN: Understand Stripe Partner Program requirements for App Marketplace listing*

### 2027年1-6月
- [ ] **P4** — GDPR合規：行為數據追蹤（滾動深度、停留時間）涉及用戶隱私
  - *EN: GDPR compliance: behavioral tracking data (scroll depth, dwell time) involves user privacy*
- [ ] **P5** — 準備Stripe App Marketplace提交材料
  - *EN: Prepare Stripe App Marketplace submission materials*

---

## 二、收入 / Revenue

### 2026年7-12月 — 零收入，專注MVP
- [ ] **R1** — 零收入預期。目標：JS SDK最小版本完成
  - *EN: Zero revenue expectation. Goal: JS SDK MVP complete*
- [ ] **R2** — 定價模型設計：平台抽成模式（內容平台收款，SK抽3-5%）
  - *EN: Pricing model: platform commission (content platforms collect, SK takes 3-5%)*

### 2027年1-6月 — Beta驗證期
- [ ] **R3** — 目標：3家beta合作夥伴（不需付費，只需使用並給回饋）
  - *EN: Goal: 3 beta partners (free usage in exchange for feedback)*
- [ ] **R4** — 若Beta回饋正面，開始設計付費tier
  - *EN: If beta feedback positive, design paid tiers*
- [ ] **R5** — 準備Stripe App Marketplace上架
  - *EN: Prepare Stripe App Marketplace listing*

---

## 三、流行與技能 / Popularity & Skills

### 2026年7-9月
- [ ] **S1** — JS SDK核心開發：前端行為監聽（scroll/click/dwell time）+ 後端API計數
  - *EN: Core JS SDK dev: frontend behavior listeners + backend API counter*
- [ ] **S2** — 閾值引擎設計：用戶可自定義觸發條件（如「滾動60% + 5篇文章」→ 觸發）
  - *EN: Threshold engine design: user-definable trigger conditions*

### 2026年10-12月
- [ ] **S3** — Stripe整合（預充值 + 觸發扣款 + 餘額不足鎖定）
  - *EN: Stripe integration (prepaid balance + triggered charge + insufficient balance lock)*
- [ ] **S4** — Indie Hackers發第一篇build log（SK概念 + 為什麼行為觸發不同於用量計費）
  - *EN: First Indie Hackers build log (SK concept + why behavior-triggered ≠ usage-based)*

### 2027年1-6月
- [ ] **S5** — Stripe App Marketplace提交（Product Hunt不可用；Stripe生態直接曝光更精準）
  - *EN: Stripe App Marketplace submission (Product Hunt not available; Stripe ecosystem exposure is more targeted)*
- [ ] **S6** — 直接冷郵件給中型SaaS公司CTO，附demo（HN不可用；冷郵件符合七殺外出征戰格）
  - *EN: Direct cold email to mid-size SaaS CTOs with demo (HN not available; cold email fits 七殺外出征戰格)*
- [ ] **S7** — 寫一篇對比文章：「Metronome/Orb做用量，Still Kinetic做行為——差異在哪」
  - *EN: Comparison article: "Metronome/Orb do usage, Still Kinetic does behavior — the difference"*
- [ ] **S8** — 聯繫Stripe Partner生態圈中的開發者工具公司，探索合作
  - *EN: Contact dev-tool companies in Stripe Partner ecosystem for collaboration*

---

## 四、靈活對策 / Countermeasures

### 若Web Monetization API無法在12個月內成為標準
- **CM1** — 完全放棄瀏覽器原生路線，專注B2B SaaS內部計費引擎（每個SaaS公司都需要）
  - *EN: Abandon browser-native route entirely, focus on B2B SaaS internal billing engine*

### 若Stripe自己推出行為觸發功能
- **CM2** — 這是被收購的最佳信號。加速建立差異化客戶案例，讓Stripe選擇買你而非自建
  - *EN: This is the best acquisition signal. Accelerate differentiated case studies so Stripe buys you instead of building*

### 若開發者社群無反應
- **CM3** — 轉向直接賣給中型SaaS公司（不需要開發者社群曝光，冷郵件直銷）
  - *EN: Pivot to direct B2B sales to mid-size SaaS companies (no dev community needed)*

### 若開發進度慢
- **CM4** — MVP極簡化：只做前端JS滾動監聽 + Stripe單次扣款。閾值引擎和後端API推遲
  - *EN: MVP minimalism: frontend JS scroll listener + Stripe single charge only. Defer threshold engine and backend API*

### 若12個月內完全無牽引力
- **CM5** — 凍結SK，資源全部轉移到FM。SK是P2，不是必須成功的產品
  - *EN: Freeze SK, redirect all resources to FM. SK is P2, not a must-win product*

---

## 時間線總覽 / Timeline Overview

```
2026 Jul ─ JS SDK核心開發開始
     Aug ─ 行為監聽 + API計數完成
     Sep ─ 閾值引擎設計
     Oct ─ Stripe整合
     Nov ─ Indie Hackers首篇build log
     Dec ─ MVP完成 + 內部測試

2027 Jan ─ Beta合作夥伴招募
     Feb ─ Product Hunt上架
     Mar ─ HN Show HN
     Apr ─ 回饋迭代
     May ─ Stripe App Marketplace提交
     Jun ─ H1結算：go/no-go（需有3+ beta用戶正面回饋才繼續）
```

---

> **SK的價值取決於Stripe會不會做行為觸發。目前他們只做了用量。這個窗口不會永遠開著。**
> *SK's value depends on whether Stripe builds behavior-triggered billing. They've only done usage-based so far. This window won't stay open forever.*
