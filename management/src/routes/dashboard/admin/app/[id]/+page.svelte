<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let appData = $state<any>(null);
  let loading = $state(true);
  let connectUrl = $state('');

  let newMetric = $state('');
  let newThreshold = $state(100);
  let newCharge = $state(100);

  // Editable enabled_types
  let selectedTypes = $state<string[]>([]);
  let savingTypes = $state(false);
  let saveMessage = $state('');

  // Subscribe
  let subscribing = $state(false);
  let subscribeError = $state('');

  const ALL_METRICS = [
    'press_count', 'scroll_length', 'scroll_speed', 'stay_duration', 'type_speed',
    'swipe_count', 'pinch_zoom_count', 'long_press_count', 'form_submit_count',
    'tab_switch_count', 'search_count', 'video_play_count', 'video_watch_duration',
    'file_download_count', 'share_count', 'mouse_distance',
  ];

  const MAX_TYPES = { basic: 2, full: 16 };

  onMount(async () => {
    const token = localStorage.getItem('sk_token');
    const id = $page.url.pathname.split('/').pop();
    const res = await fetch(`/api/apps/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    appData = await res.json();
    // Parse saved allowed metrics
    try {
      const parsed = JSON.parse(appData.allowed_metrics || '[]');
      selectedTypes = Array.isArray(parsed) ? parsed : [];
    } catch {
      selectedTypes = [];
    }
    loading = false;
  });

  function toggleType(m: string) {
    const max = MAX_TYPES[appData.tier as 'basic' | 'full'] || 16;
    if (selectedTypes.includes(m)) {
      selectedTypes = selectedTypes.filter(t => t !== m);
    } else {
      if (selectedTypes.length >= max) return;
      selectedTypes = [...selectedTypes, m];
    }
  }

  async function saveTypes() {
    savingTypes = true;
    saveMessage = '';
    const token = localStorage.getItem('sk_token');
    const id = $page.url.pathname.split('/').pop();
    const res = await fetch(`/api/apps/${id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_types: selectedTypes }),
    });
    if (res.ok) {
      saveMessage = '✅ Saved';
      // Reload
      const reload = await fetch(`/api/apps/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      appData = await reload.json();
    } else {
      const err = await res.json();
      saveMessage = `❌ ${err.error || 'Failed'}`;
    }
    savingTypes = false;
  }

  async function subscribe() {
    subscribing = true;
    subscribeError = '';
    const token = localStorage.getItem('sk_token');
    const id = $page.url.pathname.split('/').pop();
    const res = await fetch('/api/stripe/subscription', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: id }),
    });
    const data = await res.json();
    if (data.url) {
      window.open(data.url, '_blank');
    } else {
      subscribeError = data.error || 'Failed to create subscription';
    }
    subscribing = false;
  }

  async function connectStripe() {
    const token = localStorage.getItem('sk_token');
    const id = $page.url.pathname.split('/').pop();
    const res = await fetch('/api/stripe/connect', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: id }),
    });
    const data = await res.json();
    if (data.url) window.open(data.url, '_blank');
  }

  async function addThreshold() {
    const token = localStorage.getItem('sk_token');
    const id = $page.url.pathname.split('/').pop();
    await fetch(`/api/apps/${id}/thresholds`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: newMetric, thresholdValue: newThreshold, chargeAmountCents: newCharge }),
    });
    const res = await fetch(`/api/apps/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    appData = await res.json();
  }
</script>

{#if loading}
  <p>Loading...</p>
{:else if appData}
  <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem">
    <div>
      <h1 style="color:var(--gold);font-size:1.4rem">{appData.name}</h1>
      <p style="color:var(--text-muted);font-size:0.85rem">ID: {appData.id}</p>
    </div>
    <div style="text-align:right">
      <span class="badge badge-gold">{appData.tier}</span>
      <span class="badge" class:badge-gold={appData.subscription_status === 'active'} class:badge-silver={appData.subscription_status !== 'active'} style="margin-left:0.3rem">{appData.subscription_status}</span>
    </div>
  </div>

  <!-- Subscription inactive banner -->
  {#if appData.subscription_status !== 'active'}
    <div class="card" style="margin-bottom:1rem;border-color:var(--red);background:rgba(255,80,80,0.08)">
      <div class="section-title" style="color:var(--red)">⚠️ Subscription Inactive</div>
      <p style="margin-bottom:0.5rem">Your app's subscription is <strong>{appData.subscription_status}</strong>. Tracking is paused — end users will not experience any errors, but no data will be collected.</p>
      <button class="btn-gold" onclick={subscribe} disabled={subscribing}>
        {subscribing ? 'Processing...' : 'Subscribe Now — ' + (appData.tier === 'full' ? '$10/week' : '$2/week')}
      </button>
      {#if subscribeError}
        <p style="color:var(--red);margin-top:0.5rem">{subscribeError}</p>
      {/if}
    </div>
  {:else}
    <div class="card" style="margin-bottom:1rem;border-color:var(--gold);background:rgba(255,215,0,0.05)">
      <div class="section-title" style="color:var(--gold)">✅ Subscription Active</div>
      <button class="btn-ghost" onclick={subscribe}>Manage Subscription</button>
    </div>
  {/if}

  <!-- Allowed Actions (editable) -->
  <div class="card" style="margin-bottom:1rem">
    <div class="section-title">Allowed Actions (max {MAX_TYPES[appData.tier as 'basic' | 'full'] || 16})</div>
    <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin:0.5rem 0">
      {#each ALL_METRICS as m}
        <button
          type="button"
          class="badge {selectedTypes.includes(m) ? 'badge-gold' : 'badge-silver'}"
          style="cursor:pointer;border:none;padding:0.3rem 0.6rem;font-size:0.75rem"
          onclick={() => toggleType(m)}
          disabled={!selectedTypes.includes(m) && selectedTypes.length >= (MAX_TYPES[appData.tier as 'basic' | 'full'] || 16)}
        >
          {m} {selectedTypes.includes(m) ? '×' : '+'}
        </button>
      {/each}
    </div>
    <div style="display:flex;align-items:center;gap:1rem">
      <button class="btn-gold" onclick={saveTypes} disabled={savingTypes}>
        {savingTypes ? 'Saving...' : 'Save Actions'}
      </button>
      {#if saveMessage}
        <span style="font-size:0.85rem">{saveMessage}</span>
      {/if}
    </div>
  </div>

  <!-- Stripe Connect -->
  <div class="card" style="margin-bottom:1rem">
    <div class="section-title">Stripe Connect (Receiving Payouts)</div>
    {#if appData.connect_onboarded}
      <p style="color:var(--gold)">✅ Connected — payouts will be sent to your Stripe account</p>
      <button class="btn-ghost" style="margin-top:0.5rem" onclick={connectStripe}>Manage Stripe Account</button>
    {:else}
      <p style="color:var(--text-muted);margin-bottom:0.5rem">Connect your Stripe account to receive payouts (75% of charges).</p>
      <button class="btn-gold" onclick={connectStripe}>Connect Stripe</button>
    {/if}
  </div>

  <!-- SDK Credentials -->
  <div class="card" style="margin-bottom:1rem">
    <div class="section-title">SDK Credentials</div>
    <div style="background:var(--bg-input);padding:0.8rem;border-radius:6px;font-family:monospace;font-size:0.8rem">
      <div><span style="color:var(--text-muted)">App ID:</span> {appData.id}</div>
      <div><span style="color:var(--text-muted)">API Key:</span> <span style="color:var(--red)">{appData.api_key}</span></div>
      <div><span style="color:var(--text-muted)">Allowed Actions:</span> {(appData.allowed_metrics ? (() => { try { return JSON.parse(appData.allowed_metrics).join(', '); } catch { return appData.allowed_metrics; } })() : 'none')}</div>
    </div>
  </div>

  <!-- Thresholds -->
  <div class="card" style="margin-bottom:1rem">
    <div class="section-title">Billing Thresholds</div>

    {#if appData.thresholds?.length > 0}
      <table style="margin-bottom:1rem">
        <thead>
          <tr>
            <th>Action</th>
            <th>Threshold</th>
            <th>Charge</th>
          </tr>
        </thead>
        <tbody>
          {#each appData.thresholds as t}
            <tr>
              <td><span class="badge badge-silver">{t.metric}</span></td>
              <td>{t.threshold_value}</td>
              <td>${(t.charge_amount_cents / 100).toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p style="color:var(--text-muted);margin-bottom:1rem">No thresholds set. Add one below.</p>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); addThreshold(); }} style="display:flex;gap:0.5rem;align-items:end">
      <div class="form-group" style="flex:1">
        <label>Action</label>
        <select bind:value={newMetric}>
          {#each ALL_METRICS as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>
      <div class="form-group" style="width:100px">
        <label>Threshold</label>
        <input type="number" bind:value={newThreshold} min={1} />
      </div>
      <div class="form-group" style="width:120px">
        <label>Charge (cents)</label>
        <input type="number" bind:value={newCharge} min={1} />
      </div>
      <button type="submit" class="btn-gold">Add</button>
    </form>
  </div>

  <!-- Stats -->
  <div class="grid-3">
    <div class="stat-card">
      <div class="label">End Users</div>
      <div class="value">{appData.stats?.total_end_users || 0}</div>
    </div>
    <div class="stat-card">
      <div class="label">Platform Fees</div>
      <div class="value">${((appData.earnings?.total_fees || 0) / 100).toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Your Earnings (75%)</div>
      <div class="value" style="color:var(--silver)">${((((appData.earnings?.total_fees || 0) / 0.25) * 0.75) / 100).toFixed(2)}</div>
    </div>
  </div>
{/if}
