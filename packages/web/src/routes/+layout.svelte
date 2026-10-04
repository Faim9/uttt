<script lang="ts">
  import '../app.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Logo from '#lib/Logo.svelte';
  import SearchBar from '#lib/SearchBar.svelte';
  import { authenticate, session, socket, startSession } from '#lib/session.svelte.ts';
  import { onMount } from 'svelte';

  let { children } = $props();

  /**
   * The public repository. The AGPL requires offering the source to everyone who uses the site, so set this
   * before deploying; the footer links to it once set.
   */
  const SOURCE_URL = '';

  const links = [
    { href: '/', label: 'Play' },
    { href: '/watch', label: 'Watch' },
    { href: '/computer', label: 'Computer' },
    { href: '/analysis', label: 'Analysis' },
    { href: '/leaderboard', label: 'Leaderboard' },
  ];

  /** Classic follows the system's light or dark mode; the others are fixed looks. See app.css. */
  const THEMES = { classic: 'Classic', playful: 'Playful', notebook: 'Notebook', arcade: 'Arcade' };
  let theme = $state('classic');

  /** Saved in this browser only; static/theme.js applies it on the next visit before the page draws. */
  function setTheme(value: string) {
    theme = value;
    const root = document.documentElement;
    if (value === 'classic') delete root.dataset.theme;
    else root.dataset.theme = value;
    try {
      if (value === 'classic') localStorage.removeItem('theme');
      else localStorage.setItem('theme', value);
    } catch {
      // Blocked storage: the theme still applies until the page is closed.
    }
  }

  onMount(() => {
    theme = document.documentElement.dataset.theme ?? 'classic';
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
    <a class="brand" href="/" aria-label="UTTT home"><Logo /> UTTT</a>
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
<SearchBar />

<main>
  {@render children()}
</main>

<!-- The author credit is an attribution the license requires forks to keep (see README, "License"). -->
<footer>
  <p>
    Created by Faim9, with AI assistance (Claude). · <a href="/terms">Terms</a> ·
    <a href="/privacy">Privacy</a> ·
    <label>
      Theme
      <select value={theme} onchange={(event) => setTheme(event.currentTarget.value)}>
        {#each Object.entries(THEMES) as [value, label] (value)}
          <option {value}>{label}</option>
        {/each}
      </select>
    </label>
  </p>
  <p>
    Free software under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="license">GNU AGPL v3</a
    >{#if SOURCE_URL}
      · <a href={SOURCE_URL}>Source code</a>{/if}.
  </p>
</footer>

<style>
  header {
    border-bottom: var(--border-width) solid var(--border);
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

  nav a[aria-current='page'] {
    font-weight: 600;
  }

  .brand {
    display: flex;
    gap: 0.45rem;
    align-items: center;
    margin-right: 0.5rem;
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  nav .brand {
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
    border-top: var(--border-width) solid var(--border);
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

  footer select {
    margin-left: 0.25rem;
    padding: 0.1rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
  }
</style>
