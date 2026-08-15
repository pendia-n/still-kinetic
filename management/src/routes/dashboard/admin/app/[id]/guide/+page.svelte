<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let appData = $state<any>(null);
  let loading = $state(true);
  let origin = $state('https://your-management-worker.workers.dev');

  function id() { return $page.url.pathname.split('/')[4]; }
  function allowedMetrics() {
    try { return JSON.parse(appData?.allowed_metrics || '[]'); } catch { return []; }
  }
  function copy(text: string) { navigator.clipboard?.writeText(text); }

  onMount(async () => {
    origin = window.location.origin;
    const res = await fetch(`/api/apps/${id()}`);
    if (res.ok) appData = await res.json();
    loading = false;
  });
</script>

{#if loading}
  <p>Loading guide...</p>
{:else if appData}
  <div class="guide-head">
    <div><p class="section-title">Integration Guide</p><h1>{appData.name}</h1><p class="muted">Use these credentials and examples to connect this app.</p></div>
    <a href="/dashboard/admin/app/{appData.id}" class="btn-ghost">← Back to app</a>
  </div>

  <div class="card guide-card">
    <div class="section-title">Your SDK Credentials</div>
    <div class="credential"><span>App ID</span><code>{appData.id}</code><button class="btn-ghost" onclick={() => copy(appData.id)}>Copy</button></div>
    <div class="credential"><span>Public API key</span><code>{appData.api_key}</code><button class="btn-ghost" onclick={() => copy(appData.api_key)}>Copy</button></div>
    <div class="credential"><span>API base URL</span><code>{origin}</code><button class="btn-ghost" onclick={() => copy(origin)}>Copy</button></div>
  </div>

  <div class="card guide-card">
    <div class="section-title">Configured Metrics</div>
    <p class="muted">These are the metric IDs enabled for this app.</p>
    <div class="chips">{#each allowedMetrics() as metric}<span class="badge badge-brand">{metric}</span>{/each}</div>
  </div>

  <div class="card guide-card">
    <div class="section-title">Starter Example</div>
    <pre><code>{`const sk = new StillKinetic({
  appId: '${appData.id}',
  apiKey: '${appData.api_key}',
  apiBaseUrl: '${origin}',
  stripePublishableKey: 'pk_live_...',
  endUserId: currentUser.id,
  pageId: '/articles/' + articleId,
  trackedMetrics: ['stay_duration', 'scroll_length'],
});

await sk.init();
sk.start();
// Call sk.stop() when the user leaves the page.`}</code></pre>
  </div>

  <div class="card guide-card">
    <div class="section-title">End-User Billing Consent</div>
    <pre><code>{`await sk.setupBilling('#card-element', {
  amountCents: 300,
  period: 'weekly',
});`}</code></pre>
    <p class="muted">This saves the end user’s Stripe payment method and individual spending cap. It does not create a recurring end-user subscription.</p>
  </div>
{:else}
  <p class="muted">App not found.</p>
{/if}

<style>
  .guide-head { display:flex; justify-content:space-between; align-items:start; gap:1rem; margin-bottom:1.25rem; }
  h1 { color:var(--brand); font-size:1.4rem; margin-bottom:0.25rem; }
  .muted { color:var(--text-muted); font-size:0.85rem; line-height:1.5; }
  .guide-card { margin-bottom:1rem; }
  .credential { display:grid; grid-template-columns:130px 1fr auto; align-items:center; gap:0.7rem; margin-top:0.6rem; }
  .credential span { color:var(--text-muted); font-size:0.8rem; }
  .credential code { background:var(--bg-input); padding:0.55rem; border-radius:5px; overflow:auto; white-space:nowrap; }
  .credential button { padding:0.35rem 0.6rem; font-size:0.75rem; }
  .chips { display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.8rem; }
  pre { overflow-x:auto; background:#1F2937; color:#F9FAFB; padding:1rem; border-radius:6px; margin:0.8rem 0; font-size:0.78rem; line-height:1.55; }
  @media (max-width:640px) { .guide-head { flex-direction:column; } .credential { grid-template-columns:1fr auto; } .credential code { grid-column:1 / -1; grid-row:2; } }
</style>
