<script lang="ts">
  import '../../app.css';

  const metrics = [
    ['stay_duration', 'ms', 'Active visible time on the current page'],
    ['scroll_length', 'px', 'Cumulative absolute scrolling on the current page'],
    ['scroll_speed', 'px/ms', 'Instantaneous scroll velocity'],
    ['type_speed', 'CPM', 'Typing speed across text inputs'],
    ['press_count', 'count', 'Cumulative presses on the current page'],
  ];
</script>

<div class="guide-page">
  <header class="guide-header">
    <a href="/" class="guide-brand"><img src="/sk-logo.svg" alt="StillKinetic" /> StillKinetic</a>
    <nav><a href="/auth" class="btn-ghost">Sign In</a><a href="/register" class="btn-brand">Get Started</a></nav>
  </header>

  <main class="guide-container">
    <p class="section-title">Developer Guide</p>
    <h1>Turn product usage into Stripe charges</h1>
    <p class="lead">Install the SDK, configure thresholds in the dashboard, and let StillKinetic evaluate usage and route payments through Stripe Connect.</p>

    <section class="card guide-card">
      <h2>1. Install</h2>
      <pre><code>npm install @stillkinetic/web-sdk @stripe/stripe-js</code></pre>
      <p>Use the React Native package for mobile apps. Electron and Tauri apps can use the web package.</p>
    </section>

    <section class="card guide-card">
      <h2>2. Configure your app</h2>
      <p>Register an app, subscribe to Basic or Full, complete Stripe Connect onboarding, select allowed metrics, and add one threshold per metric.</p>
      <div class="metric-list">
        {#each metrics as metric}
          <div><code>{metric[0]}</code><span>{metric[1]}</span><small>{metric[2]}</small></div>
        {/each}
      </div>
    </section>

    <section class="card guide-card">
      <h2>3. Track only selected pages</h2>
      <p>Create and start the SDK on the billable page, then stop it on route change. The page ID keeps aggregates separate.</p>
      <pre><code>{`const sk = new StillKinetic({
  appId: 'YOUR_APP_ID',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  apiBaseUrl: 'https://YOUR_WORKER.workers.dev',
  stripePublishableKey: 'pk_live_...',
  endUserId: currentUser.id,
  pageId: '/articles/' + articleId,
  trackedMetrics: ['stay_duration', 'scroll_length'],
});

await sk.init();
sk.start();

// On route leave or component unmount:
sk.stop();`}</code></pre>
    </section>

    <section class="card guide-card">
      <h2>4. Collect one-time billing consent</h2>
      <p>Each end user saves a card and chooses their own spending cap. Card details stay with Stripe; StillKinetic stores Stripe references and the cap for that user.</p>
      <pre><code>{`await sk.setupBilling('#card-element', {
  amountCents: 300,
  period: 'weekly',
});`}</code></pre>
      <div class="notice"><strong>Important:</strong> this authorizes future off-session usage charges. It is not a prepaid balance or a recurring end-user subscription.</div>
    </section>

    <section class="card guide-card">
      <h2>5. Understand the payment flow</h2>
      <div class="flow"><span>User saves card</span><b>→</b><span>Threshold reached</span><b>→</b><span>Stripe charges user</span><b>→</b><span>Developer receives payout</span></div>
      <p>StillKinetic keeps its configured platform fee and sends the remainder to the developer’s connected Stripe account. If the user’s cap would be exceeded, the charge is skipped; the SDK does not automatically block the app’s feature.</p>
    </section>

    <section class="guide-cta"><h2>Ready to connect your app?</h2><a href="/register" class="btn-brand">Create a developer account →</a></section>
  </main>
</div>

<style>
  .guide-page { min-height:100vh; background:var(--bg); }
  .guide-header { background:var(--bg-card); border-bottom:1px solid var(--border); padding:1rem max(1.5rem, calc((100% - 960px) / 2)); display:flex; justify-content:space-between; align-items:center; }
  .guide-brand { display:flex; align-items:center; gap:0.5rem; color:var(--brand); font-weight:700; }
  .guide-brand img { width:1.5rem; height:1.5rem; border-radius:4px; }
  .guide-header nav { display:flex; gap:0.5rem; }
  .guide-container { max-width:860px; margin:0 auto; padding:3.5rem 1.5rem 5rem; }
  h1 { font-size:2.25rem; margin:0.5rem 0 0.8rem; }
  .lead { max-width:680px; color:var(--text-muted); font-size:1rem; line-height:1.6; margin-bottom:2rem; }
  .guide-card { margin-bottom:1rem; }
  .guide-card h2 { font-size:1.05rem; margin-bottom:0.65rem; }
  .guide-card p { color:var(--text-muted); line-height:1.55; margin-bottom:0.9rem; }
  pre { overflow-x:auto; background:#1F2937; color:#F9FAFB; padding:1rem; border-radius:6px; margin:0.8rem 0; font-size:0.78rem; line-height:1.55; }
  .metric-list { display:grid; gap:0.45rem; }
  .metric-list div { display:grid; grid-template-columns:180px 70px 1fr; gap:0.7rem; align-items:center; padding:0.55rem 0.7rem; background:var(--bg-input); border-radius:5px; }
  .metric-list code { color:var(--brand-dark); }
  .metric-list span { color:var(--brand); font-size:0.78rem; font-weight:700; }
  .metric-list small { color:var(--text-muted); }
  .notice { border-left:3px solid var(--brand); background:var(--brand-bg); padding:0.8rem; color:var(--text-muted); font-size:0.85rem; line-height:1.5; }
  .flow { display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:0.55rem; margin:1rem 0; color:var(--brand); font-weight:600; font-size:0.82rem; }
  .flow span { background:var(--brand-bg); border:1px solid rgba(248,88,34,0.2); padding:0.55rem 0.7rem; border-radius:5px; }
  .guide-cta { text-align:center; padding:2rem 0 0.5rem; }
  .guide-cta h2 { margin-bottom:0.8rem; }
  @media (max-width:640px) { h1 { font-size:1.8rem; } .metric-list div { grid-template-columns:1fr 55px; } .metric-list small { grid-column:1 / -1; } }
</style>
