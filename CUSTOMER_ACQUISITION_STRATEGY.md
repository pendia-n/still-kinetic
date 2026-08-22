# Still Kinetic customer-validation and acquisition playbook

Research date: 2026-08-19  
Primary goal: find the first three design partners and one genuinely retained paying developer—not maximize followers, karma, views, or npm downloads.

## Executive decision

Still Kinetic should use Reddit, but not as a broadcast channel yet. Use it first to learn the language of developers who have already tried to implement usage billing, answer their questions, recruit interviews, and find three supervised pilots.

Do not run ads, do a large Product Hunt launch, or repeatedly post the landing-page link until the production payment path is hardened. The current product has several issues that can invalidate a pilot or create incorrect charges. Those issues are more urgent than low social reach.

The recommended order is:

1. Fix the production blockers and create a no-risk test-mode demo.
2. Interview 20–30 qualified developers who have faced billing or metering work.
3. Personally install one event for three design partners.
4. Observe at least one complete test flow from event to ledger to payment recovery.
5. Convert one pilot to a small paid plan.
6. Only then use Reddit, Show HN, Product Hunt, and technical content for broader distribution.

The product category is validated: Stripe Billing, Lago, OpenMeter, and Orb all sell usage metering or usage-based billing. What is **not** validated is Still Kinetic's specific wedge: automatic client-side behavior tracking that causes an immediate off-session card charge when a threshold is crossed.

## 1. What the product actually is today

Based on the current management and SDK code, Still Kinetic is not simply an analytics SDK and it is not a conventional metered-subscription platform.

The current flow is:

1. A developer creates an app, chooses metrics and thresholds, completes Stripe Connect onboarding, and pays Still Kinetic's weekly subscription.
2. A web, React Native, desktop, or API-only SDK sends usage events identified by an app, end user, page, metric, and value.
3. The management backend aggregates those events and evaluates the developer's threshold.
4. The end user must previously have saved a card and selected a weekly or monthly spending cap.
5. A threshold crossing creates an off-session Stripe PaymentIntent using a destination charge.
6. The connected developer receives the charge minus Still Kinetic's 25% application fee. Still Kinetic's platform account pays the Stripe processing fee and is exposed to refunds and disputes under the current destination-charge design.

The distinctive promise is therefore:

> Instrument a product action, apply a threshold, enforce an end-user spend cap, and collect a Stripe payment without building that workflow yourself.

That is different from the usual competitor flow:

| Product | Typical flow | Main difference from Still Kinetic |
|---|---|---|
| Stripe Billing | Meter events → aggregate usage → subscription invoice | Usually bills in a billing period rather than creating a new card charge at each threshold |
| Lago | Events → metrics → pricing plan → invoice → payment provider | Broader billing and invoicing engine; not focused on automatic behavioral trackers |
| OpenMeter | Events → meters → entitlements/limits/billing | Metering-first infrastructure, including AI and API usage |
| Orb | Immutable events → metrics → prices → subscriptions → invoices | Enterprise-grade rating, auditing, pricing changes, and invoicing |
| Still Kinetic | SDK behavior/event → threshold → immediate off-session PaymentIntent → Connect transfer | Smaller and more opinionated; includes tracking adapters and user-set caps, but has less billing infrastructure |

The category has demand. Still Kinetic must prove that developers want the final row rather than one of the first four.

## 2. Promotion-readiness gate

These are customer-acquisition issues because a financial product wins through correctness and trust. A broken first pilot is more damaging than a quiet launch.

### P0: resolve before inviting production payments

| Finding | Evidence in the current project | Customer impact | Required proof before promotion |
|---|---|---|---|
| External browser requests fail CORS preflight | The live `OPTIONS /api/events` request returned `405`, and there is no CORS/OPTIONS handler in management | The web SDK cannot send its JSON/X-Api-Key request from a normal app on another origin | A real example app on a different domain completes config, card setup, event ingestion, and a test payment |
| The browser's public app key can submit arbitrary `endUserId`, metric values, and page IDs | [`events/+server.ts`](management/src/routes/api/events/+server.ts) trusts the app key and request body | A modified client can forge usage or target a predictable user ID; client telemetry must not be sufficient authority to charge a card | Short-lived server-signed end-user tokens, server-side billable-event validation, replay protection, and an abuse test |
| Stripe idempotency is reused across later threshold crossings | [`thresholdEngine.ts`](management/src/lib/server/thresholdEngine.ts) builds the idempotency key from the persistent aggregate ID | Later crossings can return the first PaymentIntent instead of creating a new charge while local spend/log data advances | A unique charge-attempt ID per crossing and tests for first, second, retry, concurrent, and failed crossings |
| Event processing is launched but not awaited or attached to the Worker lifetime | `processEvent()` starts `processEventAsync()` and the route returns immediately | A Worker may end before aggregation or payment work completes | Use the platform's request lifetime mechanism/queue and demonstrate durable processing under load and retries |
| Beacon flush sends the key in a place the endpoint does not read | [`batchSender.ts`](tracking-sdk/packages/web/src/transport/batchSender.ts) adds `apiKey` to the beacon URL; the event route reads only the body or header | Page-exit events are silently rejected | An unload/visibility integration test proves delivery |
| Client-side behavior is treated as billable truth | Scroll, typing, press, and duration values originate in a browser or device controlled by the end user | Values can be modified, replayed, blocked, or generated by automation | Restrict automatic metrics to advisory metering, or have the developer's trusted backend attest the final billable action |
| No production payment recovery path is visible | The Stripe webhook handles developer subscriptions and Connect onboarding, but not usage PaymentIntent success/failure, disputes, refunds, or action-required recovery | Users and developers cannot reliably reconcile or recover failed charges | Payment webhooks, an end-user ledger, receipts/notifications, retry/re-authentication flow, refund flow, and dispute handling |

### P1: resolve before a broad public launch

- Add a test suite. No project test/spec files were found during this review. Billing needs deterministic tests for duplicate events, concurrency, caps, period rollover, retries, failures, refunds, and webhook replay.
- Add database uniqueness where the business model assumes it: at least `(app_id, external_id)` for end users and `(app_id, metric)` if only one threshold is supported per metric.
- Reconcile schema drift. Subscription code reads and writes `apps.stripe_customer_id`, but that column is absent from the checked-in initial migration and Drizzle schema.
- Validate amounts, cap periods, end-user IDs, values, timestamps, request sizes, and event counts server-side.
- Enforce Stripe webhook timestamp tolerance and event deduplication, not only an HMAC comparison.
- Decide who is merchant/settlement merchant, what appears on the card statement, and who handles tax, refunds, receipts, and disputes. The current code creates destination charges without `on_behalf_of`.
- Provide a visible revoke-card/disable-autopay control and preserve evidence of explicit off-session consent. Stripe says the agreement should cover permission, anticipated timing/frequency, and how the amount is determined.
- Do not describe a weekly/monthly cap as protection unless users can see current spend, recent charges, remaining cap, and failed/skipped events.
- Reconcile product claims. Web automatically implements five metrics; the landing page presents sixteen as if they are equally available. The API-only SDK can report explicit metrics, but the platform/package matrix must state what is automatic, manual, or unsupported.
- Add monitoring, alerting, an incident response path, and a support contact before real money is enabled.

### Safe launch standard

The product is ready for a small production pilot when all of the following can be demonstrated in a recorded end-to-end test:

- Cross-origin integration works from a clean sample app.
- A valid user can consent, save a card, select a cap, and revoke permission.
- A forged or replayed browser event cannot charge another user.
- Two legitimate threshold crossings cause exactly two payments—not one and not three.
- A retry causes no duplicate payment.
- A failed off-session payment produces a user-visible recovery action.
- A cap prevents the payment atomically under concurrent events.
- The developer and end user can both see an understandable ledger.
- A refund and dispute event update the ledger correctly.
- The platform can explain the card statement descriptor and receipt.

This is not legal or tax advice. Before inviting consumer-facing apps, review the consent, merchant-of-record, tax, privacy, and refund model with qualified counsel and Stripe.

## 3. Unit economics: the current $1 example is dangerous

The code keeps 25% through `application_fee_amount` and uses destination charges. Stripe's documentation says the platform pays processing fees for destination charges and its balance is debited for refunds and disputes.

Using Stripe's currently published US domestic-card example of 2.9% + $0.30 per successful card charge, approximate economics are:

| End-user charge | 25% application fee (rounded by current code) | Approx. Stripe processing fee | Approx. Still Kinetic net before other costs | Developer transfer before its other costs |
|---:|---:|---:|---:|---:|
| $1.00 | $0.25 | $0.33 | **-$0.08** | $0.75 |
| $1.50 | $0.38 | $0.34 | about **$0.04** | $1.12 |
| $3.00 | $0.75 | $0.39 | about $0.36 | $2.25 |
| $5.00 | $1.25 | $0.45 | about $0.81 | $3.75 |

Rates vary by country, card, currency conversion, Connect configuration, disputes, and negotiated pricing. This table is directional, but it shows why a $1 PaymentIntent on every threshold is not a sustainable default. At the public US rate, the break-even charge is roughly $1.36 before support, hosting, fraud, Connect, refunds, or dispute costs.

Before promoting, choose and validate one of these models:

1. **Aggregate usage, then charge once.** Keep event-level metering but collect a larger daily/weekly invoice or top-up. This is the most economical default.
2. **Prepaid credits.** The user buys a larger credit pack, and product actions deduct from a transparent ledger. This reduces payment frequency but adds stored-value/product-design questions.
3. **Higher-value actions only.** Immediate charges are only used for actions worth at least several dollars, such as a completed export, generated report, paid research job, or premium asset—not pixels or keystrokes.
4. **Developer pays processing and risk through direct charges.** This changes the Connect architecture and responsibilities and must be designed deliberately.

Do not assume developers will accept both `$2/week` or `$10/week` and a 25% revenue cut. Current alternatives set a very different reference point: Stripe Billing advertises 0.7% of Billing volume for pay-as-you-go Billing, while open-source Lago provides a free self-hosted option. They are not identical products, but a prospect will still use them as price anchors.

For the first three design partners, charge nothing and use Stripe test mode. After successful pilots, test pricing rather than declaring it:

- Variant A: $0 sandbox, then $29/month plus 1–3% of successfully collected usage revenue.
- Variant B: $19–$49/month based on active end users or successful billable events, with no revenue share.
- Variant C: no platform fee during beta, then negotiated design-partner pricing in exchange for a case study.

Do not change pricing from a spreadsheet alone. Ask pilots which unit feels fair and compare stated willingness with an actual attempt to pay.

## 4. Choose a narrow initial customer

### Recommended first ICP

Target a solo developer or team of fewer than ten people that:

- already has a live or nearly live API, MCP tool, AI workflow, data-processing app, or professional utility;
- already uses Stripe or is actively implementing payments;
- has a clearly valuable completed action such as a successful tool call, export, report, conversion, render, or processing job;
- has personally spent at least several days building usage metering, credits, limits, or billing logic;
- has enough action value to aggregate charges or charge at least several dollars;
- can make an integration decision without procurement; and
- will let the founder observe the integration and resulting ledger.

This ICP fits the API-only SDK best and avoids treating untrusted browser behavior as payment authority. It is also where current discussion is strongest: API and AI products already think in usage, limits, credits, and successful jobs.

### Secondary ICP to test later

- Paid content or research products that sell explicit access events, not passive reading behavior.
- Desktop professional tools that sell exports, renders, analyses, or completed jobs.
- Mobile apps with explicit paid actions and a strong consent UI.
- Agencies repeatedly implementing Stripe usage logic for client apps.

### Do not target first

- Generic SaaS founders whose fixed monthly plan already works.
- Enterprise finance teams that require contracts, invoices, tax, revenue recognition, SLAs, and audit controls.
- High-frequency low-value API calls where a PaymentIntent per threshold is uneconomic.
- Consumer apps that want to charge because a person scrolled, typed, clicked, or remained on a page without a clear purchase decision.
- Idea-stage founders with no product and no recent billing pain. They produce compliments, not validation.

### The job to be done

Use this hypothesis in interviews:

> When a small software team wants to monetize a valuable product action, it needs a trustworthy way to measure the action, limit customer exposure, collect payment, and reconcile failures without building a billing subsystem.

The interview must determine whether the desired collection model is immediate payment, periodic invoice, prepaid credits, or entitlement enforcement. Do not force the answer to match the current code.

## 5. Positioning to test

The current hero, “Bill by what users do,” is memorable but too broad. “Track scrolls, taps, keystrokes—and charge” can sound like surveillance or a dark pattern. It describes implementation, not the valuable outcome.

### Recommended primary message

> **Charge for completed actions—not seats.**  
> Add event metering, customer spend limits, and Stripe payment collection to an API or app without building the billing workflow yourself.

This is a hypothesis, not final copy. Test it against alternatives:

| Message | Audience | What it tests |
|---|---|---|
| “Charge for completed actions—not seats.” | API, AI, professional tools | Whether value-based actions are a stronger wedge than behavioral metrics |
| “Add usage billing and customer spend limits to Stripe in one integration.” | Small Stripe developers | Whether cap + payment plumbing is the real pain |
| “Charge for successful MCP tool calls.” | MCP builders | Whether a narrow API-only vertical produces faster pilots |
| “Turn product events into transparent, capped payments.” | Broader product developers | Whether transparency/caps reduce trust objections |

### Language to avoid

- “Charge behind the user's back.” Say “explicitly authorized off-session payment.”
- “Bill clicks, typing, and scrolls.” Lead with valuable completed outcomes.
- “Micropayments” while using one card transaction per small threshold.
- “Stripe handles the usage billing.” Still Kinetic evaluates the threshold and creates PaymentIntents; Stripe processes the payment.
- “16 automatic metrics” unless every package actually implements them automatically.
- “Set and forget” until retries, disputes, reconciliation, and monitoring exist.
- “Safe public API key” until the identity and event-authority design prevents forged charges.

## 6. Validate before trying to scale traffic

### Thirty-interview target

Run 30 conversations in three batches of ten. Change the interview target or message only between batches so the evidence is interpretable.

Batch 1: API/MCP/AI tool developers.  
Batch 2: desktop/professional tool developers.  
Batch 3: Stripe agencies and small SaaS developers who have implemented credits or usage billing.

### Qualification score

Give one point for each “yes”:

- Has a live product or active beta.
- Uses Stripe or another processor now.
- Implemented or attempted usage/credit billing in the last six months.
- Can describe a specific failure, delay, support burden, or revenue loss.
- Has a billable action worth at least $3 or is willing to aggregate usage.
- Can install an SDK/server client.
- Controls the decision.
- Can start a test-mode pilot within two weeks.

Prioritize prospects scoring six or more. Do not spend founder time convincing people scoring two.

### Interview script

Do not show the landing page for the first ten minutes.

1. “Tell me about the last time you implemented—or decided not to implement—usage-based billing.”
2. “What exactly did you want to meter?”
3. “How does usage become money today: invoice, credits, top-up, or individual charge?”
4. “Which part took the most engineering or support time?”
5. “What went wrong: duplicate events, inaccurate meters, failed cards, surprise bills, caps, refunds, tax, or reconciliation?”
6. “What volume and typical charge size do you have?”
7. “Who bears payment fees, refunds, and chargebacks?”
8. “What would make you refuse a third-party billing layer?”
9. “What have you tried, and why was it insufficient?”
10. “If this problem disappeared, what would ship sooner or earn more?”
11. “Can you show me the current code, spreadsheet, Stripe configuration, or support ticket?”
12. After showing the demo: “What would prevent you from running this in test mode next week?”

Avoid “Would you use this?” and “Do you like it?” Those invite politeness. Ask about past behavior, current artifacts, costs, and a dated next step.

### Evidence ladder

Treat evidence in this order:

1. A prospect describes a recent problem without being prompted.
2. They show existing code, invoices, tickets, or manual work.
3. They introduce the person responsible for payments.
4. They schedule a pilot date.
5. They install the test integration.
6. They send real test events and inspect the ledger.
7. They enable a small production scope.
8. They pay and continue using it four weeks later.

Compliments, social likes, karma, npm downloads, waitlist emails, and “interesting idea” are weak evidence.

### Go/no-go thresholds after 30 interviews

Continue the current wedge if:

- at least 10 people report the problem from recent experience;
- at least five ask to test it;
- at least three complete an installation;
- at least one agrees to pay after the pilot; and
- the desired payment cadence is compatible with acceptable unit economics.

Narrow or pivot if developers want metering but overwhelmingly prefer periodic invoices, prepaid credits, or webhooks that their own backend handles.

Stop building new SDK adapters if 100 qualified, personalized contacts produce fewer than 10 conversations or 30 conversations produce no completed pilot. That is a market signal, not a social-media failure.

## 7. The design-partner offer

The first offer should remove adoption risk:

> I am looking for three developers who already need usage billing. I will personally help wire one billable event in Stripe test mode, build the first threshold and cap, and stay with the integration until the event ledger reconciles. There is no charge during the pilot. In return, I need one recorded feedback call and permission to publish an anonymized result; a named case study is optional.

Scope each pilot tightly:

- one app;
- one trusted billable event;
- one currency;
- one test customer;
- one cap policy;
- one success/failure/retry demonstration; and
- a two-week evaluation window.

Pilot success means the developer can answer all of these without asking you:

- Which event was received?
- Why did it count?
- What amount is due?
- Did a charge occur exactly once?
- Who received what amount?
- How much cap remains?
- What happens after failure, refund, or cancellation?

Do not ask a pilot to connect a live Stripe account, pay a weekly fee, and trust an unknown package before a working test-mode proof exists.

## 8. Channel priority

| Priority | Channel | Purpose now | Weekly operating target |
|---:|---|---|---|
| 1 | Personalized founder outreach | Recruit qualified interviews and pilots | Research 25 prospects, send 15–25 personalized messages, book 3–5 calls |
| 2 | Reddit comments and native posts | Learn wording, answer real questions, earn niche credibility | 10–15 useful comments; at most one native research/lesson post |
| 3 | Small developer communities | Find MCP, Stripe, API, Electron/Tauri, and indie app builders | Join only communities you can genuinely contribute to; 3 useful discussions |
| 4 | GitHub/npm/docs | Establish technical trust and capture high-intent search | One runnable example or documentation improvement per week |
| 5 | Show HN | Obtain technical feedback once the demo is usable without a sales call | One launch after three pilots, not before |
| 6 | Product Hunt | Package an already-working launch and collect reviews | Prepare after pilots; do not use as validation substitute |
| 7 | Search content | Build compounding demand around specific implementation problems | One evidence-backed technical article every 1–2 weeks |
| 8 | X/Threads/Medium/Substack | Repurpose evidence, maintain a public trail | Optional; no more than 10–15% of founder time |
| 9 | TikTok/Instagram short video | Demonstrate a visually clear workflow if convenient | Pause as a primary channel; repurpose one real demo rather than making generic promos |

The lack of traction on Instagram, TikTok, Medium, Substack, and Threads is not yet evidence against the product. Those accounts have little distribution, and generic developer infrastructure is not naturally visual. More importantly, a new audience cannot compensate for an unvalidated offer.

## 9. Reddit plan for `u/Fit-Secret-7235`

Reddit blocked automated access to the public profile during this research, so this section uses the supplied baseline: approximately 31 karma after two days, mostly post karma from recreational communities, one comment karma, and little or no technical contribution history.

### What that baseline means

- Thirty-one karma is enough to start participating, but unrelated post karma does not create trust in a technical subreddit.
- The weakness is not the username or recreational history. It is the absence of visible, useful participation in the communities where prospective customers live.
- Do not delete normal recreational participation, buy karma, use multiple accounts, repost for karma, or manufacture comments. Build a real technical history.
- Reddit's own spam policy prohibits repeated or unsolicited mass engagement and warns accounts whose contributions primarily link to a business they benefit from.

### First 14 days

#### Profile setup

Use a clear bio such as:

> Developer building Still Kinetic: usage-triggered Stripe billing and customer spend controls. Looking for three API/MCP design partners. I disclose whenever I mention it.

Add one stable product link to the profile if Reddit allows it. Do not put the link in every comment.

#### Daily routine: 30–45 minutes

1. Search for fresh posts containing `usage based billing`, `metered billing`, `Stripe meters`, `credits`, `spend cap`, `MCP billing`, `API monetization`, `off-session payment`, and `Stripe Connect`.
2. Read the full thread and the community's live rules.
3. Leave one or two technically useful comments that answer the question without requiring a click.
4. Mention Still Kinetic only when directly relevant, disclose that you built it, and prefer asking permission before sending a link or DM.
5. Record the problem language and the author's qualification score in the lead tracker.

Aim for 10–15 substantive technical comments before the first product-adjacent post. Quality matters more than a mechanical karma ratio.

### Community map

Rules change, so verify each community's live sidebar and pinned threads immediately before posting.

| Community type | Examples to inspect | Appropriate contribution | Avoid |
|---|---|---|---|
| Payments | `r/stripe` and payment-development discussions | Explain SetupIntents, metering, caps, idempotency, or destination-charge economics | Support claims you cannot verify; presenting yourself as Stripe |
| MCP/API | `r/mcp`, API-development communities | Ask how builders charge for successful calls; share a test-mode integration after it works | Generic launch copy or unrelated links |
| Founder | `r/SaaS`, `r/SideProject`, `r/indiehackers`, `r/startups` | Candid lessons, numbers, failed assumptions, requests for specific technical feedback where permitted | “I built X, sign up” repeated across communities |
| Framework | `r/webdev`, React, Node, React Native, Electron, and Tauri communities | Native code examples and implementation lessons | A product pitch disguised as a tutorial |

`r/SaaS` has recently tightened self-promotion. A moderator post says direct links require community karma and self-promotion is limited. Treat that as a warning to participate first and re-check current rules. `r/webdev` also warns against excessive self-promotion. `r/SideProject` is structurally more launch-friendly, but the post still needs a useful story and details.

### The first four Reddit posts

Do not publish these on consecutive days or copy the same body into multiple subreddits. Adapt each to a community and omit the product link unless its rules clearly allow it.

#### Post 1: unit-economics lesson

Suggested title:

> I built per-action Stripe charges and discovered a $1 charge can lose the platform money

Suggested body:

> I am building a developer SDK that turns a usage threshold into a Stripe Connect payment. While checking the destination-charge economics, I realized my original $1 example was wrong as a business default: a 25% application fee leaves $0.25, while a public US card rate of 2.9% + $0.30 is about $0.33—and the platform pays it in this flow. So the platform loses roughly eight cents before support, refunds, or disputes.
>
> I am now comparing three models: aggregate into one weekly payment, prepaid credits, or only charge immediately for actions worth several dollars. If you have implemented usage billing, which model did customers actually understand and trust? What broke in production?
>
> Disclosure: I am researching this for a product I built. No link; I am looking for implementation experience, not signups.

This post is valuable even if nobody clicks your profile, and the replies directly test the business model.

#### Post 2: cap/enforcement research

Suggested title:

> When a customer reaches a usage-spend cap, should the product block, degrade, or ask for approval?

Explain one concrete use case and ask respondents what they currently do. Do not present a poll if the subreddit requires prior approval for surveys. Follow up with every substantive answer.

#### Post 3: technical implementation

Suggested title:

> What I learned implementing idempotent threshold billing on Cloudflare Workers + Stripe Connect

Only publish after the idempotency and Worker-lifetime issues are fixed. Include the failure mode, invariant, test cases, and a small self-contained code excerpt. A technical community should learn something without visiting your site.

#### Post 4: pilot request

Suggested title:

> Looking for 3 API/MCP builders to test one usage-billing event with me

State the exact qualification, scope, free test-mode offer, time required, and feedback request. Do not say “any feedback appreciated.” Ask for a specific kind of developer and a dated test.

### Comment pattern

Use this shape, not a canned script:

1. Directly answer the person's question.
2. Name the tradeoff or failure mode they may have missed.
3. Give a concrete next step or official source.
4. If relevant: “Disclosure: I am building in this area. I can share the test harness I use if that would help.”

Never mass-DM people who commented. Ask publicly: “Would it be useful if I sent you the test-mode example?” Only continue after a yes.

### Reddit success metric

The weekly target is not karma. It is:

- five qualified conversations;
- two interviews booked;
- one person willing to inspect a demo; and
- repeated problem language you can put on the landing page.

## 10. Direct prospecting: the fastest route to the first customers

### Where to find prospects

- Recent Reddit posts asking about Stripe metering, credits, MCP billing, API monetization, caps, or usage invoices.
- Show HN and Product Hunt launches for APIs, AI agents, data-processing tools, and professional utilities that visibly use credits or usage pricing.
- GitHub repositories containing Stripe meter-event, credit-ledger, or usage-limit code. Do not advertise in issues; use the maintainer's public business contact if one exists.
- npm packages and starter kits for MCP, API monetization, Electron/Tauri, React Native, and Stripe.
- Stripe freelancers and small agencies that have implemented the same plumbing for multiple clients.
- Founders who publicly wrote about billing bugs, surprise invoices, credit systems, or abandoned usage pricing.

Useful searches:

```text
site:reddit.com/r/stripe "usage based" billing
site:reddit.com/r/mcp billing OR payments OR credits
site:news.ycombinator.com "usage based billing"
site:github.com "meter_events" stripe
site:github.com "usage credits" stripe
"implemented usage based billing" founder
"Stripe metered billing" "looking for"
```

### Research invitation

> Hi [name]—I saw your [post/project] about [specific billing problem]. I am researching how small [API/MCP/desktop] teams turn product usage into charges without building a meter, cap system, and payment-recovery flow. I am not asking you to buy anything. Could I ask you six questions in a 15-minute call? I will send you the anonymized findings afterward.

### Pilot invitation

Use this only after the prospect confirms the problem:

> Your [specific event] sounds close to the workflow I am testing. I can personally wire one event in Stripe test mode, set one cap, and verify success/retry/failure with you. No fee and no production card required. It should take about 45 minutes from your side. If it is not useful, you uninstall it. Would [specific date] work?

### Follow-up

> Closing the loop on this. The reason I thought of you was [one specific detail]. If usage billing is not a priority now, no reply is needed. If it is, I can send a two-minute demo instead of scheduling a call.

Send at most two follow-ups. Do not automate high-volume messages from a new identity.

### Lead tracker fields

Maintain a simple sheet or CSV with:

```text
name
company_or_project
source_url
segment
live_product_yes_no
current_payment_model
billable_event
typical_event_value
monthly_event_volume
recent_problem
current_alternative
qualification_score
first_contact_date
reply
interview_date
pilot_date
pilot_stage
objection
next_action
next_action_date
```

Review it every Friday. The purpose is to learn which segment, problem, and message advances to a pilot—not to build a giant list.

## 11. Landing page and trust assets

The current landing page is visually compact but asks a developer to trust an unknown platform with money before providing enough proof.

### Current-page problems to address

- “Scrolls, taps, keystrokes” makes the product sound invasive and encourages low-value billing examples.
- “Stripe handles usage billing” obscures Still Kinetic's responsibility for aggregation, thresholds, caps, and PaymentIntent creation.
- Pricing is based on two versus sixteen metrics, although buyers care about reliable events, customers, charges, revenue, and support.
- The page shows only the web and React Native npm links despite four packages.
- It lacks a runnable demo, architecture/security explanation, test-mode path, event ledger screenshot, failure/retry explanation, GitHub/repository links, changelog, status page, refund/support policy, and credible proof.
- It does not explain how Still Kinetic differs from Stripe Billing, Lago, OpenMeter, or Orb.

### Recommended page order

1. Outcome-focused hero.
2. A 60–90 second real demo with Stripe test mode.
3. A six-line API-only integration for one trusted event.
4. Exact money flow: event, threshold, cap, PaymentIntent/invoice, developer payout, fee.
5. “When to use this / when not to use this.”
6. Security and consent model.
7. End-user ledger and remaining-cap screenshot.
8. SDK matrix showing automatic versus explicit metrics for all four packages.
9. Comparison with Stripe Billing/credits/in-house logic.
10. Simple sandbox pricing and production pricing.
11. Named case study or transparent beta metrics.
12. CTA: “Run the test example” and secondary CTA: “Apply for a design-partner install.”

### Proposed first-screen copy

> **Charge for completed actions—not seats.**
>
> Meter a successful tool call, export, report, or job; enforce the customer's spend limit; and collect through Stripe without building the event-to-payment workflow yourself.
>
> **Run the test integration** · **See the 90-second flow**

Under the hero, state plainly:

> Best for trusted backend events and higher-value or aggregated usage. Not intended to charge users for passive behavior without explicit consent.

That sentence will reduce raw signup volume and increase qualified trust.

### Minimum trust package

- Public documentation with copy-paste test-mode examples.
- One public example app and server.
- Package repository, license, changelog, versioning policy, support contact, and security-reporting address.
- npm metadata: repository, homepage, bugs URL, keywords, package provenance, and package-specific README.
- Architecture diagram showing what data enters D1 and Stripe.
- Clear privacy statement: card data stays in Stripe; identify every non-card datum Still Kinetic stores.
- Explicit off-session mandate language and consent-record behavior.
- Status and incident page, even if initially simple.
- Refund, dispute, failed-payment, cancellation, and data-deletion behavior.
- Test results for idempotency, forged events, caps, concurrency, webhook replay, and payment recovery.

## 12. Content strategy: publish evidence, not promo

One strong technical artifact can be adapted into a blog post, a Reddit-native post, an HN submission, a short demo, and documentation. Do not create five generic social posts from no evidence.

Recommended topics, in order:

1. “Why a $1 Stripe charge can lose money in a Connect platform.”
2. “Immediate usage charges vs periodic invoices vs prepaid credits.”
3. “How to design idempotency for repeated billing thresholds.”
4. “Why browser telemetry should not directly authorize a charge.”
5. “How to collect explicit consent for variable off-session payments.”
6. “What should a spend cap do: block, degrade, queue, or ask?”
7. “Billing a successful MCP tool call: event schema and retry rules.”
8. “Page-scoped duration tracking without billing the home screen.”
9. “Destination vs direct charges for a developer platform.”
10. “A transparent event-to-payment ledger on Cloudflare D1.”
11. “What three developers taught me about usage billing.”
12. “Still Kinetic vs Stripe Meters: when each model fits.”

Every article should include:

- a real failure or decision;
- a diagram, calculation, test, or code sample;
- the tradeoff, not only the preferred answer;
- the audience for whom the advice is wrong; and
- one CTA appropriate to the stage: answer a question, inspect a demo, or apply for a pilot.

Medium and Substack can host or syndicate these articles, but they are archives—not the primary acquisition engine. Short videos should show a real event crossing a threshold, a cap stopping a charge, or a retry remaining idempotent. A logo animation or feature list is unlikely to attract a billing developer.

## 13. Launch sequence

### Stage A: private proof

Prerequisite: P0 issues resolved.

- Build one API/MCP test app and one end-user billing/ledger view.
- Record the 90-second flow.
- Recruit ten interviews and three pilot candidates manually.
- Run all payments in Stripe test mode.

Exit condition: three developers complete a test event and can explain the resulting ledger.

### Stage B: narrow community launch

- Publish the unit-economics lesson and one technical lesson on Reddit, each natively and in the appropriate community.
- Invite qualified readers to a design-partner install, not a generic signup.
- Publish the sample repo and package documentation.
- Ask pilots for an honest quote only after they experience the workflow.

Exit condition: one pilot enables a limited production use case and agrees to pay.

### Stage C: Show HN

Show HN officially expects something users can try and recommends minimizing signup barriers. Launch only when a visitor can run a meaningful test without connecting a live Stripe account.

Suggested title after proof:

> Show HN: Still Kinetic – turn trusted product events into capped Stripe payments

The first comment should explain why the product exists, the narrow use case, what is technically unusual, current limitations, and what feedback is requested. Do not ask anyone to upvote.

### Stage D: Product Hunt

Product Hunt can provide distribution and feedback, but it should amplify pilot proof rather than manufacture it. Its official guide encourages makers to launch their own product, build community before launch, and never pay for hunters or ask directly for upvotes.

Launch assets:

- one-line promise;
- 3–5 screenshots or a short product demo;
- clear maker story;
- a first comment with the problem, technical approach, and design-partner result;
- live responses throughout launch day; and
- a conversion goal such as five qualified demos, not “Product of the Day.”

## 14. Thirty-day operating plan

### Days 1–5: make the pilot safe

- Fix and test CORS, request lifetime, event identity/authorization, per-crossing idempotency, beacon delivery, and amount validation.
- Add payment webhook/recovery, basic ledger, consent record, cap visibility, and revoke control.
- Reconcile database migrations.
- Decide whether the pilot uses immediate charges, aggregation, or credits.
- Create one end-to-end test script and record the output.

### Days 6–7: prepare evidence

- Build one runnable API/MCP example.
- Rewrite the first-screen message for a trusted value event.
- Add the four-package matrix and “when not to use” section.
- Prepare the two-minute demo and design-partner page.
- Create the lead tracker and first 50-prospect list.

### Week 2: interview, do not launch

- Send 15–25 personalized research invitations.
- Complete five to eight interviews.
- Leave 10 useful Reddit comments in relevant threads.
- Publish the unit-economics Reddit post if community rules allow it.
- Summarize the exact words prospects use for the problem and alternatives.

### Week 3: install pilots

- Complete the next five to eight interviews.
- Start up to three test-mode pilots.
- Observe integrations live; do not merely email docs.
- Record time to first valid event, errors, objections, and requested payment cadence.
- Publish one technical lesson only after the associated fix is complete.

### Week 4: ask for commitment

- Complete the remaining interviews needed for 20–30 total.
- Ask successful pilots for a dated production scope and a real price decision.
- Publish an anonymized pilot result with exact numbers where permitted.
- Decide whether to continue, narrow to MCP/API billing, pivot to aggregate/credit metering, or stop.
- Schedule Show HN/Product Hunt only if the exit conditions are met.

### Daily founder schedule

| Time | Activity |
|---:|---|
| 25 min | Read fresh high-intent discussions and capture prospect/problem data |
| 30 min | Research and send 3–5 personalized messages |
| 20 min | Write one or two useful community replies |
| 45–90 min | Interview or supervised pilot |
| 15 min | Update tracker, objections, and next actions |

Product work outside this block should be driven by a pilot blocker, not a new platform adapter or metric.

## 15. Funnel and weekly scorecard

Track these numbers every Friday:

```text
qualified prospects researched
personalized contacts sent
positive replies
interviews booked
interviews completed
qualified problems confirmed
pilot invitations
pilot commitments
SDK/server installs
first valid events
complete test payment flows
limited production activations
paying developers
week-4 retained developers
gross payment volume
successful payment count
failed/recovered payment count
refund/dispute count
support hours per pilot
```

Useful rates:

```text
reply rate = positive replies / personalized contacts
interview rate = completed interviews / personalized contacts
pilot rate = pilot commitments / qualified interviews
activation rate = first valid event / pilot commitments
payment-proof rate = complete test flow / first valid event
paid conversion = paying developers / activated pilots
retention = week-4 retained developers / paying developers from the cohort
```

Initial diagnostic thresholds—not universal benchmarks:

- Reply rate below 10%: prospect list or first sentence is weak.
- Interviews happen but fewer than 30% describe recent pain: ICP is weak.
- Strong pain but fewer than 30% accept a free supervised pilot: proposed solution or trust is weak.
- Pilots start but fewer than 50% reach first event: onboarding is weak.
- Test flows work but nobody accepts a price: value/pricing is weak.
- People pay but do not remain active for four weeks: product does not become part of their billing workflow.

Do not use karma, followers, video views, or npm download counts as the main scorecard. The npm downloads API showed activity for all four packages in the most recent available month, but registry downloads can include CI, mirrors, security scanners, and repeated installs; they are not customer proof without activation data.

## 16. Experiments and decisions

Run one main variable at a time.

| Hypothesis | Small test | Pass signal | Decision if it fails |
|---|---|---|---|
| MCP/API builders have urgent billing pain | 10 interviews from live API/MCP products | 4+ recent painful implementations; 2 pilots | Test professional desktop tools |
| “Completed actions” is clearer than behavioral tracking | Two batches of 10 comparable outreach messages | Meaningfully higher qualified reply/pilot rate | Interview objections and test “spend limits + Stripe” |
| Immediate payment is desired | Ask every qualified interview to rank immediate, invoice, and credits; run one prototype | 3+ pilots select immediate for a concrete economic reason | Pivot engine toward aggregation/credits |
| User-set caps improve conversion/trust | Show the same flow with/without visible ledger/cap | Prospects identify it as purchase-enabling, not merely nice | Treat caps as hygiene rather than headline |
| Current weekly + 25% pricing works | Ask successful pilots to choose it with a real payment method | At least one pays without a custom exception | Test monthly/volume pricing and lower take rate |
| Reddit can source buyers | Four weeks of useful participation and two permitted native posts | 5 qualified calls or 1 pilot | Keep Reddit for research; move acquisition effort to direct outreach/partners |

## 17. Objections to expect—and honest answers

### “Stripe already has usage-based billing.”

Correct. Stripe Billing supports meter events, subscriptions, invoices, and alerts. Still Kinetic must win only where its SDK adapters, threshold workflow, customer caps, or Connect routing eliminate meaningful custom work. Demonstrate that difference in a five-minute test; do not claim Stripe cannot meter usage.

### “Why would I pay 25% plus a weekly fee?”

There is no persuasive answer until customer value and payment economics are proven. Treat current pricing as a hypothesis. A prospect comparing it with Stripe Billing's volume fee or open-source metering will likely object.

### “Can a user fake an event and charge somebody?”

With the current public client-key design, that concern is valid. Do not hand-wave it. Production launch requires server-attested identity/events and replay protection.

### “What happens when SCA or the card issuer requires the user?”

An off-session attempt can fail or require action. The product needs to notify the user, return them to a recovery flow, and reconcile the eventual result. “Stripe handles it” is incomplete.

### “What stops a surprise bill?”

The intended answer is explicit consent, visible pricing rules, a user-set cap, current-spend display, notifications, receipts, revoke controls, and an understandable ledger. The cap alone is insufficient.

### “Why should I trust an unknown billing platform?”

Trust must come from a public test harness, narrow permissions, security design, package provenance, deterministic tests, visible ledgers, transparent limitations, named users, support responsiveness, and correct handling of failures—not the number of SDKs.

### “Why connect Stripe before I can even test?”

A good onboarding path should not require a live account or paid weekly subscription before the developer sees an end-to-end result. Offer a sandbox/test-mode path first.

## 18. Likely pivots if the interviews disagree with the current product

Do not treat a pivot as failure. The expensive mistake would be promoting the wrong behavior more loudly.

### If developers want credits, not per-threshold card charges

Keep event ingestion, thresholds, caps, and SDKs. Replace each small PaymentIntent with a prepaid or aggregated ledger. This may improve economics and user comprehension.

### If MCP/API demand is strongest

Make the API-only SDK the primary product. Add a hosted end-user billing portal for consent/payment setup and use trusted server events. De-emphasize automatic scroll/type tracking.

### If developers only want metering and enforcement

Sell reliable event metering, spend alerts, and entitlement webhooks while developers keep control of Stripe. This reduces merchant/payment risk and competes more directly with OpenMeter's lower end.

### If agencies show more pain than app founders

Offer a reusable white-label integration and implementation support. One agency can bring multiple apps, but it will require clearer tenant isolation and operational controls.

### If nobody wants a third-party Connect relationship

Research a model that operates inside the developer's own Stripe account or sends verified usage to their existing Stripe Billing setup. Do not change funds flow without a separate Stripe/merchant/liability design review.

## 19. Source notes

### Current project evidence

- SDK packages and intended flow: [`tracking-sdk/README.md`](tracking-sdk/README.md)
- Event authentication and ingestion: [`management/src/routes/api/events/+server.ts`](management/src/routes/api/events/+server.ts)
- Aggregation, caps, idempotency, and destination PaymentIntent: [`management/src/lib/server/thresholdEngine.ts`](management/src/lib/server/thresholdEngine.ts)
- Card setup and cap storage: [`bind-card/+server.ts`](management/src/routes/api/end-user/bind-card/+server.ts) and [`config/+server.ts`](management/src/routes/api/end-user/config/+server.ts)
- Stripe webhooks: [`webhook/+server.ts`](management/src/routes/api/stripe/webhook/+server.ts)
- Browser batch/beacon transport: [`batchSender.ts`](tracking-sdk/packages/web/src/transport/batchSender.ts)
- Current landing and developer guide: [`+page.svelte`](management/src/routes/+page.svelte) and [`guide/+page.svelte`](management/src/routes/guide/+page.svelte)

### Market and payment sources

- [Stripe usage-based billing](https://docs.stripe.com/billing/subscriptions/usage-based)
- [Stripe Billing pricing](https://stripe.com/billing/pricing)
- [Stripe card pricing](https://stripe.com/pricing)
- [Stripe SetupIntents and off-session consent](https://docs.stripe.com/payments/setup-intents)
- [Stripe destination charges](https://docs.stripe.com/connect/destination-charges)
- [Stripe Connect dispute responsibility](https://docs.stripe.com/connect/disputes)
- [Lago product workflow](https://docs.getlago.com/guide/introduction/welcome-to-lago)
- [OpenMeter documentation](https://openmeter.io/docs)
- [Orb's event-to-invoice model](https://docs.withorb.com/how-orb-works)

### Acquisition and community sources

- [Reddit's official spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam)
- [Recent r/SaaS moderator note on tighter self-promotion](https://www.reddit.com/r/SaaS/comments/1slno92/new_rule_against_selfpromo/)
- [Show HN guidelines](https://news.ycombinator.com/showhn.html)
- [Product Hunt launch guide](https://www.producthunt.com/launch)
- [Product Hunt preparation guidance](https://www.producthunt.com/launch/before-launch)
- [Stripe Atlas: Your first 10 customers](https://stripe.com/guides/atlas/starting-sales)
- [Paul Graham: Do Things That Don't Scale](https://www.paulgraham.com/ds.html)

## Final recommendation

Spend the next month acting like a researcher and implementation partner, not a social-media marketer.

The highest-probability path is:

1. Make the API-only path safe and demonstrably correct.
2. Focus the story on valuable completed actions, not passive behavior.
3. Recruit 30 conversations through personalized outreach and useful Reddit participation.
4. Personally complete three test-mode installations.
5. Let observed customer preference decide between immediate charges, aggregated billing, and credits.
6. Charge only after a pilot reaches value; launch broadly only after one customer retains.

If this works, Reddit becomes a credible public notebook of real billing lessons and a source of qualified developers. If it does not, the interviews will tell you what to change far faster than another hundred zero-view promo videos.
