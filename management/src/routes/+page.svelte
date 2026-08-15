<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';

  let ready = $state(false);

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        window.location.href = data.role === 'manager' ? '/dashboard' : '/dashboard/admin';
      }
    } catch {}
    ready = true;
  });
</script>

<div class="lp">
  <header class="lp-header">
    <div class="lp-container">
      <div class="lp-logo">
        <img src="/sk-logo.svg" alt="SK" class="lp-logo-img" />
        <span class="lp-logo-txt">StillKinetic</span>
      </div>
      <nav class="lp-nav">
        <a href="/guide" class="btn-ghost">Developer Guide</a>
        <a href="/auth" class="btn-ghost">Sign In</a>
        <a href="/register" class="btn-brand">Get Started</a>
      </nav>
    </div>
  </header>

  <section class="lp-hero">
    <div class="lp-container">
      <h1>Bill by what users <em>do</em></h1>
      <p class="lp-sub">Track real user actions — scrolls, taps, keystrokes — and charge through Stripe Connect when thresholds are crossed.</p>
      <div class="lp-cta">
        <a href="/register" class="btn-brand">Get Started →</a>
        <a href="/auth" class="btn-ghost">Sign In</a>
      </div>
    </div>
  </section>

  <section class="lp-section lp-alt">
    <div class="lp-container">
      <p class="section-title">Example</p>
      <h2 class="lp-example-title">Charge by meaningful usage</h2>
      <div class="lp-example-grid">
        <div class="card lp-example-card">
          <span class="lp-example-label">Developer config</span>
          <code>stay_duration ≥ 300000 ms → $1.00</code>
          <code>scroll_length ≥ 200 px → $1.50</code>
        </div>
        <div class="card lp-example-card">
          <span class="lp-example-label">User protection</span>
          <p>A user saves a card once and chooses a weekly spending cap. Charges stop when the cap would be exceeded.</p>
        </div>
      </div>
      <a href="/guide" class="btn-brand lp-example-link">Read the integration guide →</a>
    </div>
  </section>

  <section class="lp-section">
    <div class="lp-container">
      <p class="section-title">Metrics</p>
      <div class="lp-grid">
        <div class="card">
          <h3 class="lp-metric-h">Count</h3>
          <p class="lp-metric-p">press_count, swipe_count, form_submit_count, search_count, share_count</p>
          <span class="lp-unit">unit: count</span>
        </div>
        <div class="card">
          <h3 class="lp-metric-h">Distance</h3>
          <p class="lp-metric-p">scroll_length, mouse_distance</p>
          <span class="lp-unit">unit: px</span>
        </div>
        <div class="card">
          <h3 class="lp-metric-h">Duration</h3>
          <p class="lp-metric-p">stay_duration, video_watch_duration</p>
          <span class="lp-unit">unit: ms</span>
        </div>
        <div class="card">
          <h3 class="lp-metric-h">Speed</h3>
          <p class="lp-metric-p">scroll_speed, type_speed</p>
          <span class="lp-unit">unit: CPM / px/ms</span>
        </div>
      </div>
    </div>
  </section>

  <section class="lp-section lp-alt">
    <div class="lp-container">
      <p class="section-title">Pricing</p>
      <div class="lp-price-grid">
        <div class="card lp-price-card">
          <h3>Basic</h3>
          <p class="lp-price">$2<span>/week</span></p>
          <ul>
            <li>2 metrics</li>
          </ul>
          <a href="/register" class="btn-brand" style="display:block;text-align:center">Choose Basic</a>
        </div>
        <div class="card lp-price-card" style="border-color:var(--brand)">
          <h3>Full</h3>
          <p class="lp-price">$10<span>/week</span></p>
          <ul>
            <li>16 metrics</li>
          </ul>
          <a href="/register" class="btn-brand" style="display:block;text-align:center">Choose Full</a>
        </div>
      </div>
    </div>
  </section>

  <section class="lp-section lp-alt">
    <div class="lp-container">
      <p class="section-title">SDK Packages</p>
      <div class="lp-links">
        <a href="https://www.npmjs.com/package/@stillkinetic/web-sdk" class="btn-brand" target="_blank" rel="noopener">@stillkinetic/web-sdk →</a>
        <a href="https://www.npmjs.com/package/@stillkinetic/rn-sdk" class="btn-ghost" target="_blank" rel="noopener">@stillkinetic/rn-sdk →</a>
      </div>
    </div>
  </section>

  <section class="lp-section">
    <div class="lp-container">
      <p class="section-title">How It Works</p>
      <div class="lp-steps">
        <div class="lp-step">
          <div class="lp-num">1</div>
          <h3>Install</h3>
          <p><code>npm install @stillkinetic/web-sdk</code></p>
        </div>
        <div class="lp-step">
          <div class="lp-num">2</div>
          <h3>Configure</h3>
          <p>Pick real SDK metrics, set thresholds, choose a plan</p>
        </div>
        <div class="lp-step">
          <div class="lp-num">3</div>
          <h3>Earn</h3>
          <p>SDK sends events; Stripe handles usage billing</p>
        </div>
      </div>
    </div>
  </section>

  <footer class="lp-footer">
    StillKinetic — Usage-based billing platform
  </footer>
</div>

<style>
  .lp { min-height: 100vh; background: var(--bg); }
  .lp-container { max-width: 960px; margin: 0 auto; padding: 0 1.5rem; }

  .lp-header {
    background: var(--bg-card); border-bottom: 1px solid var(--border); padding: 1rem 0;
  }
  .lp-header .lp-container { display: flex; justify-content: space-between; align-items: center; }
  .lp-logo { display: flex; align-items: center; gap: 0.5rem; }
  .lp-logo-img { height: 1.5rem; border-radius: 4px; }
  .lp-logo-txt { font-weight: 700; color: var(--brand); }

  .lp-nav { display: flex; gap: 0.5rem; align-items: center; }

  .lp-hero { padding: 5rem 0 4rem; text-align: center; }
  .lp-hero h1 { font-size: 2.5rem; font-weight: 800; color: var(--text); margin: 0 0 1rem; }
  .lp-hero h1 em { font-style: normal; color: var(--brand); }
  .lp-sub { color: var(--text-muted); max-width: 500px; margin: 0 auto 2rem; line-height: 1.6; }
  .lp-cta { display: flex; gap: 0.75rem; justify-content: center; }

  .lp-section { padding: 4rem 0; text-align: center; }
  .lp-alt { background: var(--bg-card); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .section-title { color: var(--brand); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.5rem; text-align: center; }

  .lp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; text-align: left; }
  .lp-metric-h { color: var(--brand); margin: 0 0 0.4rem; font-size: 1rem; }
  .lp-metric-p { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 0.3rem; }
  .lp-unit { font-size: 0.7rem; color: var(--brand); font-weight: 600; }

  .lp-price-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; max-width: 550px; margin: 0 auto; }
  .lp-price-card { text-align: center; }
  .lp-price { font-size: 2.5rem; font-weight: 800; color: var(--text); margin: 0.5rem 0 1rem; }
  .lp-price span { font-size: 1rem; font-weight: 400; color: var(--text-muted); }
  .lp-price-card ul { list-style: none; padding: 0; margin: 0 0 1.5rem; text-align: left; }
  .lp-price-card li { padding: 0.3rem 0; font-size: 0.85rem; color: var(--text); }
  .lp-price-card li::before { content: '✓ '; color: var(--brand); }

  .lp-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; max-width: 600px; margin: 0 auto; }
  .lp-step { text-align: center; }
  .lp-num { width: 36px; height: 36px; border-radius: 50%; background: var(--brand); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; margin: 0 auto 0.75rem; }
  .lp-step h3 { margin: 0 0 0.3rem; font-size: 1rem; }
  .lp-step p { font-size: 0.8rem; color: var(--text-muted); margin: 0; }
  .lp-step code { background: var(--bg-input); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; color: var(--brand); }

  .lp-footer { border-top: 1px solid var(--border); padding: 2rem; text-align: center; font-size: 0.8rem; color: var(--text-muted); }

  .lp-links { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
  .lp-example-title { font-size: 1.5rem; margin: 0.5rem 0 1.25rem; }
  .lp-example-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; max-width: 760px; margin: 0 auto 1.25rem; text-align: left; }
  .lp-example-card { display: flex; flex-direction: column; gap: 0.6rem; }
  .lp-example-label { color: var(--brand); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; }
  .lp-example-card code { background: var(--bg-input); padding: 0.5rem; border-radius: 5px; color: var(--text); font-size: 0.8rem; }
  .lp-example-card p { color: var(--text-muted); line-height: 1.55; font-size: 0.85rem; }
  .lp-example-link { display: inline-block; }

  @media (max-width: 640px) {
    .lp-hero h1 { font-size: 1.6rem; }
    .lp-steps { grid-template-columns: 1fr; }
    .lp-example-grid { grid-template-columns: 1fr; }
  }
</style>
