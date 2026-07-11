<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let token: string | null = null;
  let role: string | null = null;
  let ready = $state(false);

  onMount(() => {
    token = localStorage.getItem('sk_token');
    role = localStorage.getItem('sk_role');
    ready = true;
  });

  function logout() {
    localStorage.removeItem('sk_token');
    localStorage.removeItem('sk_role');
    window.location.href = '/';
  }
</script>

{#if ready}
  {#if $page.url.pathname === '/' || $page.url.pathname === '/register'}
    <slot />
  {:else if !token}
    <div class="auth-page">
      <div class="auth-card">
        <h1>Not logged in</h1>
        <p>Please log in to access the dashboard.</p>
        <a href="/" class="btn-gold" style="display:block;text-align:center;margin-top:1rem">Go to Login</a>
      </div>
    </div>
  {:else}
    <div class="app-layout">
      <aside class="sidebar">
        <h2>✦ StillKinetic</h2>
        <nav>
          {#if role === 'manager'}
            <a href="/dashboard" class:active={$page.url.pathname === '/dashboard'}>📊 Overview</a>
            <a href="/dashboard/earnings" class:active={$page.url.pathname === '/dashboard/earnings'}>💰 Earnings</a>
          {:else}
            <a href="/dashboard/admin" class:active={$page.url.pathname.startsWith('/dashboard/admin')}>📱 My Apps</a>
          {/if}
          <button class="btn-ghost" style="margin-top:2rem;width:100%" onclick={logout}>Logout</button>
        </nav>
      </aside>
      <main class="main-content">
        <slot />
      </main>
    </div>
  {/if}
{/if}
