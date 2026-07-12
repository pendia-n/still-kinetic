<script lang="ts">
  import '../../app.css';
  import { onMount } from 'svelte';

  let identifier = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  // TOTP second step
  let totpRequired = $state(false);
  let loginToken = $state('');
  let totpCode = $state('');

  onMount(() => {
    if (localStorage.getItem('sk_token')) {
      window.location.href = localStorage.getItem('sk_role') === 'manager' ? '/dashboard' : '/dashboard/admin';
    }
  });

  async function login() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error; return; }

      // TOTP two-step
      if (data.totpRequired) {
        totpRequired = true;
        loginToken = data.loginToken;
        loading = false;
        return;
      }

      localStorage.setItem('sk_token', data.token);
      localStorage.setItem('sk_role', data.role);
      window.location.href = data.role === 'manager' ? '/dashboard' : '/dashboard/admin';
    } catch { error = 'Connection error'; }
    finally { loading = false; }
  }

  async function verifyTotp() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/auth/totp/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginToken, code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error; return; }
      localStorage.setItem('sk_token', data.token);
      localStorage.setItem('sk_role', data.role);
      window.location.href = data.role === 'manager' ? '/dashboard' : '/dashboard/admin';
    } catch { error = 'Verification error'; }
    finally { loading = false; }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <h1><img src="/sk-logo.svg" alt="SK" style="height:1.5rem;vertical-align:middle;margin-right:0.3rem;border-radius:4px" /> StillKinetic</h1>
    <p>Usage-based billing platform</p>

    {#if !totpRequired}
      <form onsubmit={(e) => { e.preventDefault(); login(); }}>
        <div class="form-group">
          <label>Username or Email</label>
          <input type="text" bind:value={identifier} placeholder="username or email" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" bind:value={password} placeholder="Enter password" required />
        </div>

        {#if error}
          <p style="color:var(--red);font-size:0.8rem;margin-bottom:0.8rem">{error}</p>
        {/if}

        <button type="submit" class="btn-brand" style="width:100%" disabled={loading}>
          {loading ? 'Loading...' : 'Login'}
        </button>
      </form>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); verifyTotp(); }}>
        <h2>Two-Factor Authentication</h2>
        <p style="font-size:0.85rem;margin-bottom:1rem">
          Enter the 6-digit code from your authenticator app.
        </p>
        <div class="form-group">
          <label>Authenticator Code</label>
          <input
            type="text"
            bind:value={totpCode}
            placeholder="000000"
            maxlength={6}
            inputmode="numeric"
            autocomplete="one-time-code"
            required
            style="font-size:1.5rem;text-align:center;letter-spacing:0.3rem;font-family:monospace"
          />
        </div>

        {#if error}
          <p style="color:var(--red);font-size:0.8rem;margin-bottom:0.8rem">{error}</p>
        {/if}

        <button type="submit" class="btn-brand" style="width:100%" disabled={loading}>
          {loading ? 'Verifying...' : 'Verify & Login'}
        </button>

        <p style="margin-top:0.8rem;font-size:0.75rem">
          <button type="button" class="btn-text" onclick={() => { totpRequired = false; loginToken = ''; totpCode = ''; error = ''; }}>
            ← Back to login
          </button>
        </p>
      </form>
    {/if}

    <p style="margin-top:1rem;font-size:0.8rem">
      No account? <a href="/register">Register</a>
    </p>
  </div>
</div>
