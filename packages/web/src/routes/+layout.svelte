<script lang="ts">
  import '../app.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { authenticate, session, socket, startSession } from '#lib/session.svelte.ts';
  import { onMount } from 'svelte';

  let { children } = $props();

  const links = [
    { href: '/play', label: 'Play' },
    { href: '/computer', label: 'Computer' },
    { href: '/analysis', label: 'Analysis' },
    { href: '/leaderboard', label: 'Leaderboard' },
  ];

  onMount(() => {
    startSession();
    // Seeks and challenges can be answered while browsing elsewhere; go to the game when it starts.
    return socket.listen((message) => {
      if (message.type === 'gameStarted') goto(`/game/${message.gameId}`);
    });
  });

  async function signOut() {
    await authenticate('logout');
    goto('/');
  }
</script>

<header>
  <nav>
    <a class="brand" href="/">UTTT</a>
    {#each links as { href, label } (href)}
      <a {href} aria-current={page.url.pathname === href ? 'page' : undefined}>{label}</a>
    {/each}
    <span class="account">
      {#if session.user}
        <a href="/@{session.user.username}">{session.user.username}</a>
        <button class="link" onclick={signOut}>Sign out</button>
      {:else if session.ready}
        <a href="/login">Sign in</a>
        <a class="button primary" href="/signup">Sign up</a>
      {/if}
    </span>
  </nav>
</header>

<main>
  {@render children()}
</main>

<style>
  header {
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
    align-items: center;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0.75rem 1rem;
  }

  nav a,
  .link {
    color: var(--muted);
    text-decoration: none;
  }

  nav a:hover,
  nav a[aria-current='page'],
  .link:hover {
    color: var(--text);
  }

  .brand {
    font-weight: 800;
    letter-spacing: 0.04em;
    color: var(--text);
  }

  .account {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-left: auto;
  }

  .account .button.primary {
    color: white;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }

  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }
</style>
