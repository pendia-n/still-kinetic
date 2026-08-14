<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let appData = $state<any>(null);
  let loading = $state(true);
  let connectUrl = $state('');

  // Add threshold
  let newMetric = $state('');
  let newThreshold = $state(100);
  let newCharge = $state(100);
  let addError = $state('');

  // Edit threshold (inline)
  let editingId = $state<string | null>(null);
  let editValue = $state(1);
  let editCharge = $state(100);

  // Editable enabled_types
  let selectedTypes = $state<string[]>([]);
  let savingTypes = $state(false);
  let saveMessage = $state('');

  // Subscribe
  let subscribing = $state(false);
  let subscribeError = $state('');
  let subscription = $state<any>(null);
  let managingSubscription = $state(false);
  let subscriptionMessage = $state('');

  // Existing SDK metrics grouped for configuration display. These are only
  // presentation groups; metric IDs remain unchanged across SDK and backend.
  const metricGroups = [
    {
      name: 'Count',
      unit: 'count',
      metrics: ['press_count', 'swipe_count', 'pinch_zoom_count', 'long_press_count',
        'form_submit_count', 'tab_switch_count', 'search_count', 'video_play_count',
        'file_download_count', 'share_count'],
    },
    {
      name: 'Distance',
      unit: 'px',
      metrics: ['scroll_length', 'mouse_distance'],
    },
    {
      name: 'Duration',
      unit: 'ms',
      metrics: ['stay_duration', 'video_watch_duration'],
    },
    {
      name: 'Speed',
      unit: 'varies by metric',
      metrics: ['scroll_speed', 'type_speed'],
    },
  ];

  const ALL_METRICS = metricGroups.flatMap(group => group.metrics);
  const metricInfo = (metric: string) => metricGroups.find(group => group.metrics.includes(metric));
  const metricUnit = (metric: string) => metric === 'type_speed' ? 'CPM' : metric === 'scroll_speed' ? 'px/ms' : metricInfo(metric)?.unit || 'value';

  const MAX_TYPES = { basic: 2, full: 16 };

  onMount(async () => {
    await loadApp();
  });

  function id() { return $page.url.pathname.split('/').pop(); }
  function token() { return ''; }  // Cookie auth

  async function loadApp() {
    const [appRes, subscriptionRes] = await Promise.all([
      fetch(`/api/apps/${id()}`),
      fetch(`/api/stripe/subscription/manage?appId=${encodeURIComponent(id())}`),
    ]);
    appData = await appRes.json();
    const subscriptionData = await subscriptionRes.json();
    subscription = subscriptionRes.ok ? subscriptionData.subscription : null;
    try {
      const parsed = JSON.parse(appData.allowed_metrics || '[]');
      selectedTypes = Array.isArray(parsed) ? parsed : [];
    } catch {
      selectedTypes = [];
    }
    loading = false;
  }

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
    const res = await fetch(`/api/apps/${id()}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_types: selectedTypes }),
    });
    if (res.ok) {
      saveMessage = '✅ Saved';
      await loadApp();
    } else {
      const err = await res.json();
      saveMessage = `❌ ${err.error || 'Failed'}`;
    }
    savingTypes = false;
  }

  async function subscribe() {
    subscribing = true;
    subscribeError = '';
    const res = await fetch('/api/stripe/subscription', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: id() }),
    });
    const data = await res.json();
    if (data.url) {
      window.open(data.url, '_blank');
    } else {
      subscribeError = data.error || 'Failed to create subscription';
    }
    subscribing = false;
  }

  async function setCancelAtPeriodEnd(cancelAtPeriodEnd: boolean) {
    managingSubscription = true;
    subscriptionMessage = '';
    const res = await fetch('/api/stripe/subscription/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: id(), cancelAtPeriodEnd }),
    });
    const data = await res.json();
    if (res.ok) {
      subscription = {
        ...subscription,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        currentPeriodEnd: data.currentPeriodEnd,
      };
      subscriptionMessage = cancelAtPeriodEnd
        ? 'Cancellation scheduled. Your app remains active until the current paid period ends.'
        : 'Subscription cancellation undone.';
    } else {
      subscriptionMessage = `❌ ${data.error || 'Failed to update subscription'}`;
    }
    managingSubscription = false;
  }

  function periodEndLabel(): string {
    return subscription?.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).toLocaleString()
      : 'the end of the current billing period';
  }

  async function connectStripe() {
    const res = await fetch('/api/stripe/connect', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: id() }),
    });
    const data = await res.json();
    if (data.url) window.open(data.url, '_blank');
  }

  function validateAdd(): boolean {
    addError = '';
    if (!newMetric) { addError = 'Select an action'; return false; }
    if (newThreshold < 1) { addError = 'Threshold min is 1'; return false; }
    if (newCharge < 100) { addError = 'Charge min is 100 cents ($1.00)'; return false; }
    return true;
  }

  async function addThreshold() {
    if (!validateAdd()) return;
    const res = await fetch(`/api/apps/${id()}/thresholds`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: newMetric, thresholdValue: newThreshold, chargeAmountCents: newCharge }),
    });
    if (!res.ok) {
      const err = await res.json();
      addError = err.error || 'Failed';
      return;
    }
    addError = '';
    await loadApp();
  }

  function startEdit(t: any) {
    editingId = t.id;
    editValue = t.threshold_value;
    editCharge = t.charge_amount_cents;
  }

  function cancelEdit() {
    editingId = null;
  }

  function validateEdit(): boolean {
    addError = '';
    if (editValue < 1) { addError = 'Threshold min is 1'; return false; }
    if (editCharge < 100) { addError = 'Charge min is 100 cents ($1.00)'; return false; }
    return true;
  }

  async function saveEdit(t: any) {
    if (!validateEdit()) return;
    const res = await fetch(`/api/apps/${id()}/thresholds`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ thresholdId: t.id, thresholdValue: editValue, chargeAmountCents: editCharge }),
    });
    if (!res.ok) {
      const err = await res.json();
      addError = err.error || 'Failed';
      return;
    }
    addError = '';
    editingId = null;
    await loadApp();
  }

  async function deleteThreshold(thresholdId: string) {
    const res = await fetch(`/api/apps/${id()}/thresholds`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ thresholdId }),
    });
    if (!res.ok) {
      const err = await res.json();
      addError = err.error || 'Failed';
      return;
    }
    addError = '';
    await loadApp();
  }
</script>

{#if loading}
  <p>Loading...</p>
{:else if appData}
  <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.5rem">
    <div>
      <h1 style="color:var(--brand);font-size:1.4rem">{appData.name}</h1>
      <p style="color:var(--text-muted);font-size:0.85rem">ID: {appData.id}</p>
    </div>
    <div style="text-align:right">
      <span class="badge badge-brand">{appData.tier}</span>
      <span class="badge" class:badge-brand={appData.subscription_status === 'active'} class:badge-silver={appData.subscription_status !== 'active'} style="margin-left:0.3rem">{appData.subscription_status}</span>
    </div>
  </div>

  <!-- Subscription inactive banner -->
  {#if appData.subscription_status !== 'active'}
    <div class="card" style="margin-bottom:1rem;border-color:var(--red);background:rgba(248,88,34,0.06)">
      <div class="section-title" style="color:var(--red)">⚠️ Subscription Inactive</div>
      <p style="margin-bottom:0.5rem">Your app's subscription is <strong>{appData.subscription_status}</strong>. Tracking is paused — end users will not experience any errors, but no data will be collected.</p>
      <button class="btn-brand" onclick={subscribe} disabled={subscribing}>
        {subscribing ? 'Processing...' : 'Subscribe Now — ' + (appData.tier === 'full' ? '$10/week' : '$2/week')}
      </button>
      {#if subscribeError}
        <p style="color:var(--red);margin-top:0.5rem">{subscribeError}</p>
      {/if}
    </div>
  {:else}
    <div class="card" style="margin-bottom:1rem;border-color:var(--brand);background:rgba(248,88,34,0.04)">
      <div class="section-title" style="color:var(--brand)">✅ Subscription Active</div>
      {#if subscription?.cancelAtPeriodEnd}
        <p style="margin-bottom:0.7rem">Cancellation is scheduled for <strong>{periodEndLabel()}</strong>. No renewal charge will be made after that period.</p>
        <button class="btn-brand" onclick={() => setCancelAtPeriodEnd(false)} disabled={managingSubscription}>
          {managingSubscription ? 'Updating...' : 'Keep Subscription'}
        </button>
      {:else}
        <p style="margin-bottom:0.7rem">Your app remains active until you cancel. Cancellation takes effect at the end of the current paid period.</p>
        <button class="btn-danger" onclick={() => setCancelAtPeriodEnd(true)} disabled={managingSubscription}>
          {managingSubscription ? 'Updating...' : 'Cancel at Period End'}
        </button>
      {/if}
      {#if subscriptionMessage}
        <p style="margin-top:0.7rem;font-size:0.85rem">{subscriptionMessage}</p>
      {/if}
    </div>
  {/if}

  <!-- Allowed Actions (editable) -->
  <div class="card" style="margin-bottom:1rem">
    <div class="section-title">Allowed Actions (max {MAX_TYPES[appData.tier as 'basic' | 'full'] || 16})</div>
    <p style="color:var(--text-muted);font-size:0.82rem;margin:0.4rem 0 0.8rem">
      Select existing SDK metrics. Threshold values use the unit shown for each metric.
    </p>
    {#each metricGroups as group}
      <div style="margin:0.8rem 0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.35rem">
          <strong>{group.name}</strong>
          <span style="color:var(--text-muted);font-size:0.75rem">Unit: {group.unit}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem">
          {#each group.metrics as m}
            <button
              type="button"
              class="badge {selectedTypes.includes(m) ? 'badge-brand' : 'badge-silver'}"
              style="cursor:pointer;border:none;padding:0.3rem 0.6rem;font-size:0.75rem;border-radius:4px"
              onclick={() => toggleType(m)}
              disabled={!selectedTypes.includes(m) && selectedTypes.length >= (MAX_TYPES[appData.tier as 'basic' | 'full'] || 16)}
            >
              {m} · {metricUnit(m)} {selectedTypes.includes(m) ? '×' : '+'}
            </button>
          {/each}
        </div>
      </div>
    {/each}
    <div style="display:flex;align-items:center;gap:1rem">
      <button class="btn-brand" onclick={saveTypes} disabled={savingTypes}>
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
      <p style="color:var(--brand)">✅ Connected — payouts will be sent to your Stripe account</p>
      <button class="btn-ghost" style="margin-top:0.5rem" onclick={connectStripe}>Manage Stripe Account</button>
    {:else}
      <p style="color:var(--text-muted);margin-bottom:0.5rem">Connect your Stripe account to receive payouts (75% of charges).</p>
      <button class="btn-brand" onclick={connectStripe}>Connect Stripe</button>
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

    {#if appData.thresholds?.length > 0 && !appData.connect_onboarded}
      <div style="margin-bottom:1rem;padding:0.8rem;border:1px solid var(--brand);border-radius:6px;background:rgba(248,88,34,0.06)">
        <p style="color:var(--brand);font-weight:600;font-size:0.85rem">⚠️ Thresholds configured but Stripe Connect not linked</p>
        <p style="color:var(--text-muted);font-size:0.8rem;margin-top:0.3rem">
          End users will NOT be charged until you complete Stripe onboarding above. Your thresholds will start billing automatically once connected.
        </p>
      </div>
    {/if}

    {#if appData.thresholds?.length > 0}
      <div class="threshold-table-wrapper">
        <table style="margin-bottom:1rem">
          <thead>
            <tr>
              <th>Action</th>
              <th>Unit</th>
              <th>Threshold (min: 1)</th>
              <th>Charge (min: $1.00)</th>
              <th style="width:120px">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each appData.thresholds as t}
              <tr>
                {#if editingId === t.id}
                  <td><span class="badge badge-brand">{t.metric}</span></td>
                  <td>{metricUnit(t.metric)}</td>
                  <td>
                    <input type="number" class="edit-input-sm" bind:value={editValue} min={1} />
                  </td>
                  <td>
                    <input type="number" class="edit-input-sm" bind:value={editCharge} min={100} />
                  </td>
                  <td style="white-space:nowrap">
                    <button class="btn-brand" style="padding:0.25rem 0.6rem;font-size:0.75rem" onclick={() => saveEdit(t)}>Save</button>
                    <button class="btn-ghost" style="padding:0.25rem 0.6rem;font-size:0.75rem" onclick={cancelEdit}>Cancel</button>
                  </td>
                {:else}
                  <td><span class="badge badge-brand">{t.metric}</span></td>
                  <td>{metricUnit(t.metric)}</td>
                  <td>{t.threshold_value}</td>
                  <td>${(t.charge_amount_cents / 100).toFixed(2)}</td>
                  <td style="white-space:nowrap">
                    <button class="btn-ghost" style="padding:0.25rem 0.6rem;font-size:0.75rem" onclick={() => startEdit(t)}>✏️ Edit</button>
                    <button class="btn-danger" style="padding:0.25rem 0.6rem;font-size:0.75rem" onclick={() => deleteThreshold(t.id)}>🗑️ Delete</button>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p style="color:var(--text-muted);margin-bottom:1rem">No thresholds set. Add one below.</p>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); addThreshold(); }} class="threshold-add-form">
      <div class="form-group" style="flex:1;min-width:140px">
        <label>Action</label>
        <select bind:value={newMetric}>
          {#each ALL_METRICS as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>
      <div class="form-group" style="width:100px">
        <label>Threshold (≥1)</label>
        <input type="number" bind:value={newThreshold} min={1} />
      </div>
      <div class="form-group" style="width:120px">
        <label>Charge cents (≥100)</label>
        <input type="number" bind:value={newCharge} min={100} />
      </div>
      <button type="submit" class="btn-brand" style="align-self:end;margin-bottom:1rem">Add</button>
    </form>

    {#if addError}
      <p style="color:var(--red);font-size:0.85rem;margin-top:0.5rem">{addError}</p>
    {/if}
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
