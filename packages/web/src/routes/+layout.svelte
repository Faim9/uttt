<script lang="ts">
  import '../app.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { authenticate, session, socket, startSession } from '#lib/session.svelte.ts';
  import { onMount } from 'svelte';

  let { children } = $props();

  /**
   * The public repository. The AGPL requires offering the source to everyone who uses the site, so set this
   * before deploying; the footer links to it once set.
   */
  const SOURCE_URL = '';

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
        <a href="/account">Settings</a>
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

<!-- The author credit is an attribution the license requires forks to keep (see README, "License"). -->
<footer>
  <p>Created by Faim9, with AI assistance (Claude).</p>
  <p>
    Free software under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="license">GNU AGPL v3</a
    >{#if SOURCE_URL}
      · <a href={SOURCE_URL}>Source code</a>{/if}.
  </p>
</footer>

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

  footer {
    max-width: 1100px;
    margin: 2rem auto 0;
    padding: 1rem;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.85rem;
    text-align: center;
  }

  footer p {
    margin: 0.25rem 0;
  }

  footer a {
    color: inherit;
  }
</style>
