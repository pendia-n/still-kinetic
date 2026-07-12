<script lang="ts">
  let data = $state<any>(null);
  let loading = $state(true);
  let showCreate = $state(false);
  let newName = $state('');
  let newTier = $state('basic');
  let selectedTypes = $state<string[]>(['press_count', 'scroll_length']);
  let newAppResult = $state<any>(null);

  const ALL_METRICS = [
    'press_count', 'scroll_length', 'scroll_speed', 'stay_duration', 'type_speed',
    'swipe_count', 'pinch_zoom_count', 'long_press_count', 'form_submit_count',
    'tab_switch_count', 'search_count', 'video_play_count', 'video_watch_duration',
    'file_download_count', 'share_count', 'mouse_distance',
  ];

  const BASIC_LIMIT = 2;

  function toggleType(m: string) {
    if (selectedTypes.includes(m)) {
      selectedTypes = selectedTypes.filter(t => t !== m);
    } else {
      if (selectedTypes.length >= BASIC_LIMIT) return; // can't exceed limit
      selectedTypes = [...selectedTypes, m];
    }
  }

  async function load() {
    const token = localStorage.getItem('sk_token');
    const res = await fetch('/api/apps', { headers: { 'Authorization': `Bearer ${token}` } });
    data = await res.json();
    loading = false;
  }
  load();

  async function createApp() {
    const token = localStorage.getItem('sk_token');
    const body: any = { name: newName, tier: newTier };
    if (newTier === 'basic' && selectedTypes.length > 0) {
      body.enabled_types = selectedTypes;
    }
    const res = await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (res.ok) {
      newAppResult = result;
      showCreate = false;
      newName = '';
      selectedTypes = ['press_count', 'scroll_length'];
      load();
    }
  }
</script>

<div style="margin-bottom:1.5rem">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <div>
      <h1 style="color:var(--brand);font-size:1.4rem">My Apps</h1>
      <p style="color:var(--text-muted);font-size:0.85rem">Manage your registered applications</p>
    </div>
    <button class="btn-brand" onclick={() => showCreate = !showCreate}>
      {showCreate ? 'Cancel' : '+ New App'}
    </button>
  </div>
</div>

{#if showCreate}
  <div class="card" style="margin-bottom:1.5rem">
    <div class="section-title">Create New App</div>
    <form onsubmit={(e) => { e.preventDefault(); createApp(); }}>
      <div style="display:flex;gap:1rem;align-items:end;margin-bottom:1rem">
        <div class="form-group" style="flex:1">
          <label>App Name</label>
          <input type="text" bind:value={newName} placeholder="My Awesome App" required />
        </div>
        <div class="form-group" style="width:200px">
          <label>Tier</label>
          <select bind:value={newTier} onchange={() => { selectedTypes = ['press_count', 'scroll_length']; }}>
            <option value="basic">Basic - $2/week (2 actions)</option>
            <option value="full">Full - $10/week (all 16 actions)</option>
          </select>
        </div>
      </div>

      {#if newTier === 'basic'}
        <div style="margin-bottom:1rem">
          <div class="section-title" style="font-size:0.9rem">Choose {BASIC_LIMIT} Actions ({selectedTypes.length}/{BASIC_LIMIT} selected)</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.5rem">
            {#each ALL_METRICS as m}
              <button
                type="button"
                class="badge {selectedTypes.includes(m) ? 'badge-gold' : 'badge-silver'}"
                style="cursor:pointer;border:none;padding:0.3rem 0.6rem;font-size:0.75rem"
                onclick={() => toggleType(m)}
                disabled={!selectedTypes.includes(m) && selectedTypes.length >= BASIC_LIMIT}
              >
                {m} {selectedTypes.includes(m) ? '×' : '+'}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <button type="submit" class="btn-brand">Create App</button>
    </form>
  </div>
{/if}

{#if newAppResult}
  <div class="card" style="margin-bottom:1.5rem;border-color:var(--brand)">
    <div class="section-title">✅ App Created — Save These Credentials</div>
    <div style="background:var(--bg-input);padding:1rem;border-radius:6px;font-family:monospace;font-size:0.8rem">
      <div><span style="color:var(--text-muted)">App ID:</span> {newAppResult.id}</div>
      <div><span style="color:var(--text-muted)">API Key:</span> <span style="color:var(--red)">{newAppResult.apiKey}</span></div>
      <div><span style="color:var(--text-muted)">Tier:</span> {newAppResult.tier}</div>
      <div><span style="color:var(--text-muted)">Allowed Actions:</span> {newAppResult.allowedMetrics.join(', ')}</div>
    </div>
    <button class="btn-ghost" style="margin-top:0.5rem" onclick={() => { navigator.clipboard.writeText(newAppResult.apiKey); }}>Copy API Key</button>
  </div>
{/if}

{#if loading}
  <p>Loading...</p>
{:else if data?.length === 0}
  <div class="card" style="text-align:center;padding:3rem">
    <p style="color:var(--text-muted)">No apps yet. Create your first one above.</p>
  </div>
{:else}
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Tier</th>
        <th>API Key</th>
        <th>Stripe</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody>
      {#each data as app}
        <tr>
          <td style="font-weight:600">{app.name}</td>
          <td><span class="badge badge-brand">{app.tier}</span></td>
          <td style="font-family:monospace;font-size:0.75rem;color:var(--text-muted)">{app.api_key?.slice(0,16)}...</td>
          <td>{app.connect_onboarded ? '✅' : '<a href="/dashboard/admin/app/' + app.id + '" style="color:var(--red);font-size:0.8rem">Connect →</a>'}</td>
          <td><span class="badge {app.subscription_status === 'active' ? 'badge-brand' : 'badge-silver'}">{app.subscription_status}</span></td>
          <td><a href="/dashboard/admin/app/{app.id}" class="btn-ghost" style="padding:0.3rem 0.8rem;display:inline-block">Manage</a></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
