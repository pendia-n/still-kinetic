<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let role: string | null = null;
  let ready = $state(false);

  onMount(() => {
    role = localStorage.getItem('sk_role');
    ready = true;
  });

  function logout() {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('sk_logged_in');
    localStorage.removeItem('sk_role');
    window.location.href = '/auth';
  }
</script>

{#if ready}
  {#if $page.url.pathname === '/' || $page.url.pathname === '/auth' || $page.url.pathname === '/register'}
    <slot />
  {:else if !role}
    <div class="auth-page">
      <div class="auth-card">
        <h1>Not logged in</h1>
        <p>Please log in to access the dashboard.</p>
        <a href="/auth" class="btn-brand" style="display:block;text-align:center;margin-top:1rem">Go to Login</a>
      </div>
    </div>
  {:else}
    <div class="app-layout">
      <aside class="sidebar">
        <h2><img src="/sk-logo.svg" alt="SK" style="height:1.4rem;width:1.4rem;vertical-align:middle;border-radius:3px" /> StillKinetic</h2>
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
