<script lang="ts">
  let data = $state<any>(null);
  let loading = $state(true);

  async function load() {
    const token = localStorage.getItem('sk_token');
    const res = await fetch('/api/apps', { headers: { 'Authorization': `Bearer ${token}` } });
    data = await res.json();
    loading = false;
  }
  load();
</script>

<div style="margin-bottom:1.5rem">
  <h1 style="color:var(--brand);font-size:1.4rem">Manager Overview</h1>
  <p style="color:var(--text-muted);font-size:0.85rem">All apps and platform revenue</p>
</div>

{#if loading}
  <p>Loading...</p>
{:else if data?.length === 0}
  <div class="card" style="text-align:center;padding:3rem">
    <p style="color:var(--text-muted)">No apps registered yet.</p>
  </div>
{:else}
  <div class="grid-3" style="margin-bottom:1.5rem">
    <div class="stat-card">
      <div class="label">Total Apps</div>
      <div class="value">{data?.length || 0}</div>
    </div>
    <div class="stat-card">
      <div class="label">Active Apps</div>
      <div class="value">{data?.filter((a:any) => a.subscription_status === 'active').length || 0}</div>
    </div>
    <div class="stat-card">
      <div class="label">Developers</div>
      <div class="value">{new Set(data?.map((a:any) => a.owner_id)).size || 0}</div>
    </div>
  </div>

  <div class="section-title">All Apps</div>
  <table>
    <thead>
      <tr>
        <th>App</th>
        <th>Developer</th>
        <th>Tier</th>
        <th>Stripe</th>
        <th>Status</th>
        <th>Created</th>
      </tr>
    </thead>
    <tbody>
      {#each data as app}
        <tr>
          <td style="font-weight:600">{app.name}</td>
          <td style="color:var(--text-muted)">{app.owner_email || app.owner_id?.slice(0,8)}</td>
          <td><span class="badge badge-brand">{app.tier}</span></td>
          <td>{app.connect_onboarded ? '✅' : '❌'}</td>
          <td><span class="badge {app.subscription_status === 'active' ? 'badge-brand' : 'badge-silver'}">{app.subscription_status}</span></td>
          <td style="color:var(--text-muted);font-size:0.8rem">{new Date(app.created_at).toLocaleDateString()}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
