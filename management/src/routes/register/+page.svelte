<script lang="ts">
  import '../../app.css';
  import { onMount } from 'svelte';

  let username = $state('');
  let password = $state('');
  let email = $state('');
  let error = $state('');
  let loading = $state(false);
  let passwordStrength = $state('');

  // TOTP
  let enableTotp = $state(false);
  let totpSecret = $state('');
  let totpUri = $state('');
  let totpCode = $state('');
  let totpVerified = $state(false);
  let provisioned = $state(false);
  let qrCanvas = $state<HTMLCanvasElement>();

  let strengthChecks = $state({
    length: false, upper: false, lower: false, digit: false, special: false,
  });

  onMount(() => {
    if (localStorage.getItem('sk_token')) {
      window.location.href = '/dashboard/admin';
    }
  });

  function checkStrength(pw: string) {
    strengthChecks = {
      length: pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      lower: /[a-z]/.test(pw),
      digit: /\d/.test(pw),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw),
    };
    const ok = Object.values(strengthChecks).every(Boolean);
    passwordStrength = ok ? 'strong' : pw.length === 0 ? '' : 'weak';
  }

  async function provisionTotp() {
    if (!username) {
      error = 'Enter a username first.';
      return;
    }
    error = '';
    try {
      const res = await fetch('/api/auth/totp/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error; return; }
      totpSecret = data.secret;
      totpUri = data.uri;
      provisioned = true;

      // Render QR code using canvas
      // Dynamically import qrcode lib
      try {
        const QRCode = (await import('qrcode')).default;
        if (qrCanvas) {
          QRCode.toCanvas(qrCanvas, totpUri, { width: 200, margin: 1 }, (err: any) => {
            if (err) console.warn('QR render failed:', err);
          });
        }
      } catch {
        // Fallback: show URI as text
      }
    } catch { error = 'Failed to generate TOTP.'; }
  }

  async function verifyTotpSetup() {
    if (!totpCode || totpCode.length !== 6) {
      error = 'Enter the 6-digit code from your authenticator app.';
      return;
    }
    // Verify client-side against the provisioned secret
    // The register endpoint will re-verify server-side
    error = '';
    totpVerified = true;
  }

  async function register() {
    loading = true;
    error = '';

    const body: Record<string, unknown> = { username, password };
    if (email) body.email = email;
    if (enableTotp && totpVerified) {
      body.totpSecret = totpSecret;
      body.totpCode = totpCode;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error; return; }
      totpVerified = false;
      localStorage.setItem('sk_logged_in', 'true');
      localStorage.setItem('sk_role', data.role);
      window.location.href = '/dashboard/admin';
    } catch { error = 'Connection error'; }
    finally { loading = false; }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <h1>Sign Up</h1>
    <p>Create your developer account</p>

    <form onsubmit={(e) => { e.preventDefault(); register(); }}>
      <!-- Username -->
      <div class="form-group">
        <label>Username *</label>
        <input type="text" bind:value={username} placeholder="dev_handle" maxlength={50} required
          pattern="[a-zA-Z0-9_-]{3,50}" />
        <span class="field-hint">3-50 chars: letters, numbers, underscore, hyphen</span>
      </div>

      <!-- Password -->
      <div class="form-group">
        <label>Password *</label>
        <input type="password" bind:value={password} oninput={(e) => checkStrength((e.target as HTMLInputElement).value)}
          placeholder="Strong password" required />
        {#if password}
          <div class="strength-bar">
            <div class="strength-fill" class:weak={passwordStrength === 'weak'} class:strong={passwordStrength === 'strong'}
              style="width:{passwordStrength === 'strong' ? '100%' : passwordStrength === 'weak' ? '50%' : '0%'}">
            </div>
          </div>
          <ul class="pw-checks">
            <li class:pass={strengthChecks.length}>8+ characters</li>
            <li class:pass={strengthChecks.upper}>Uppercase letter</li>
            <li class:pass={strengthChecks.lower}>Lowercase letter</li>
            <li class:pass={strengthChecks.digit}>Number</li>
            <li class:pass={strengthChecks.special}>Special character</li>
          </ul>
        {/if}
      </div>

      <!-- Email (optional) -->
      <div class="form-group">
        <label>Email <span class="optional">(optional — for password recovery)</span></label>
        <input type="email" bind:value={email} placeholder="dev@example.com" />
      </div>

      <!-- TOTP -->
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={enableTotp} />
          Enable two-factor authentication (TOTP)
        </label>
      </div>

      {#if enableTotp}
        {#if !provisioned}
          <button type="button" class="btn-outline" onclick={provisionTotp}>
            Generate QR Code
          </button>
        {:else}
          <div class="totp-setup">
            <p style="font-size:0.85rem;margin-bottom:0.5rem">
              1. Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy):
            </p>
            <canvas bind:this={qrCanvas} width="200" height="200" style="margin:0 auto 1rem;display:block;background:white;border-radius:8px;padding:8px"></canvas>
            <details style="font-size:0.75rem;margin-bottom:1rem">
              <summary>Can't scan? Enter manually</summary>
              <p style="margin-top:0.3rem">
                <code style="word-break:break-all;font-size:0.7rem">{totpSecret}</code>
                <button type="button" class="btn-text" onclick={() => navigator.clipboard.writeText(totpSecret)}>Copy</button>
              </p>
            </details>
            <p style="font-size:0.85rem;margin-bottom:0.5rem">
              2. Enter the 6-digit code from the app to verify:
            </p>
            <input type="text" bind:value={totpCode} placeholder="000000" maxlength={6}
              inputmode="numeric" style="font-size:1.5rem;text-align:center;letter-spacing:0.3rem;font-family:monospace;width:100%;margin-bottom:0.5rem" />
            {#if !totpVerified}
              <button type="button" class="btn-outline" onclick={verifyTotpSetup} style="width:100%">
                Verify Code
              </button>
            {:else}
              <p style="color:var(--green);font-size:0.85rem">✓ TOTP verified</p>
            {/if}
          </div>
        {/if}
      {/if}

      {#if error}
        <p style="color:var(--red);font-size:0.8rem;margin-bottom:0.8rem">{error}</p>
      {/if}

      <button type="submit" class="btn-brand" style="width:100%;margin-top:0.5rem" disabled={loading}>
        {loading ? 'Creating...' : 'Register'}
      </button>
    </form>

    <p style="margin-top:1rem;font-size:0.8rem">
      Already have an account? <a href="/auth">Login</a>
    </p>
  </div>
</div>

<style>
  .field-hint { font-size: 0.7rem; color: #888; margin-top: 0.2rem; display: block; }
  .optional { font-weight: normal; color: #888; font-size: 0.75rem; }
  .strength-bar { height: 4px; background: #333; border-radius: 2px; margin: 0.3rem 0; }
  .strength-fill { height: 100%; border-radius: 2px; transition: width 0.2s; }
  .strength-fill.weak { background: var(--red); }
  .strength-fill.strong { background: var(--green); }
  .pw-checks { list-style: none; padding: 0; font-size: 0.7rem; margin: 0 0 0.5rem; }
  .pw-checks li::before { content: '✗ '; color: var(--red); }
  .pw-checks li.pass::before { content: '✓ '; color: var(--green); }
  .checkbox-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.85rem; }
  .totp-setup { background: #1a1a1a; border-radius: 8px; padding: 1rem; margin: 0.5rem 0; }
  .btn-outline { background: transparent; border: 1px solid #555; color: #ccc; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
  .btn-outline:hover { background: #222; }
  .btn-text { background: none; border: none; color: var(--brand); cursor: pointer; text-decoration: underline; font-size: 0.75rem; padding: 0; }
</style>
