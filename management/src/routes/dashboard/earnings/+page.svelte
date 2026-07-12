<script lang="ts">
  let data = $state<any>(null);
  let loading = $state(true);

  async function load() {
    const token = '';  // Cookie auth
    const res = await fetch('/api/apps');
    const apps = await res.json();

    let totalFees = 0;
    let totalCharges = 0;
    let totalFailed = 0;
    let activeApps = 0;

    for (const app of apps) {
      if (app.subscription_status === 'active') activeApps++;
      if (app.earnings) {
        totalFees += app.earnings.total_fees || 0;
      }
    }

    data = { apps: apps.length, activeApps, totalFees, totalCharges, totalFailed };
    loading = false;
  }
  load();
</script>

<div style="margin-bottom:1.5rem">
  <h1 style="color:var(--brand);font-size:1.4rem">Earnings</h1>
  <p style="color:var(--text-muted);font-size:0.85rem">Platform revenue overview (Manager only)</p>
</div>

{#if loading}
  <p>Loading...</p>
{:else}
  <div class="grid-3" style="margin-bottom:1.5rem">
    <div class="stat-card">
      <div class="label">Platform Fees (Your 25%)</div>
      <div class="value">${((data?.totalFees || 0) / 100).toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Devs Earned (75%)</div>
      <div class="value" style="color:var(--silver)">${(((data?.totalFees || 0) / 25) * 75 / 100).toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Gross Volume</div>
      <div class="value">${((data?.totalFees || 0) / 0.25 / 100).toFixed(2)}</div>
    </div>
  </div>

  <div class="card">
    <div class="section-title">Tax Records</div>
    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem">
      All charges are logged in the <code>trigger_logs</code> table with <code>application_fee_cents</code> and <code>stripe_payment_intent_id</code> for cross-referencing.
    </p>
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Count</th>
          <th>Total Fees</th>
        </tr>
        <tr>
          <td><span class="badge badge-silver">press_count</span></td>
          <td>—</td>
          <td>—</td>
        </tr>
      </thead>
    </table>
    <p style="color:var(--text-muted);font-size:0.8rem;margin-top:1rem">
      Run in D1: <code style="background:var(--bg-input);padding:0.15rem 0.3rem;border-radius:4px">SELECT SUM(application_fee_cents) FROM trigger_logs WHERE status = 'succeeded'</code>
    </p>
  </div>
{/if}
