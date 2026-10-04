<script lang="ts">
  import '../app.css';
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { install, installApp, watchInstall } from '#lib/install.svelte.ts';
  import Logo from '#lib/Logo.svelte';
  import SearchBar from '#lib/SearchBar.svelte';
  import { authenticate, session, socket, startSession } from '#lib/session.svelte.ts';
  import { loadSoundSetting, playSound, setSound, sound } from '#lib/sound.svelte.ts';
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
    { href: '/puzzles', label: 'Puzzles' },
    { href: '/tournaments', label: 'Tournaments' },
    { href: '/computer', label: 'Computer' },
    { href: '/analysis', label: 'Analysis' },
    { href: '/leaderboard', label: 'Leaderboard' },
  ];

  /** Classic follows the system's light or dark mode; the others are fixed looks. See app.css. */
  const THEMES = { classic: 'Classic', playful: 'Playful', notebook: 'Notebook', arcade: 'Arcade' };
  let theme = $state('classic');
  /** The phone tab bar's destinations; icons are 24×24 stroked paths. */
  const TABS = [
    { href: '/', label: 'Play', icon: 'M8 5l11 7-11 7z' },
    {
      href: '/puzzles',
      label: 'Puzzles',
      icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    },
    {
      href: '/watch',
      label: 'Watch',
      icon: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    },
    {
      href: '/tournaments',
      label: 'Tournaments',
      icon: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8',
    },
  ];
  /** On phones, More opens a sheet with everything the tab bar doesn't hold; any navigation closes it. */
  let menuOpen = $state(false);
  afterNavigate(() => (menuOpen = false));

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
    watchInstall();
    loadSoundSetting();
    startSession();
    // Seeks and challenges can be answered while browsing elsewhere; go to the game when it starts.
    return socket.listen((message) => {
      if (message.type !== 'gameStarted') return;
      playSound('start');
      goto(`/game/${message.gameId}`);
    });
  });

  async function signOut() {
    await authenticate('logout');
    goto('/');
  }
</script>

<!-- Shared links open with their own title (the server's link preview); in the app, it's the site's. -->
<svelte:head><title>UTTT · Ultimate Tic-Tac-Toe</title></svelte:head>

<header>
  <nav>
    <a class="brand" href="/" aria-label="UTTT home"><Logo /> UTTT</a>
    <span class="links wide">
      {#each links as { href, label } (href)}
        <a {href} aria-current={page.url.pathname === href ? 'page' : undefined}>{label}</a>
      {/each}
    </span>
    <span class="account">
      {#if session.user}
        <a href="/@{session.user.username}">{session.user.username}</a>
        <a class="wide" href="/account">Settings</a>
        <button class="link wide" onclick={signOut}>Sign out</button>
      {:else if session.ready}
        <a href="/login">Sign in</a>
        <a class="button primary wide" href="/signup">Sign up</a>
      {/if}
    </span>
  </nav>
</header>
<SearchBar />

<main>
  {@render children()}
</main>

<!-- The author credit is an attribution the license requires forks to keep (see README, "License"). -->
{#snippet colophon()}
  <p>
    Created by Faim9, with AI assistance (Claude). · <a href="/terms">Terms</a> ·
    <a href="/privacy">Privacy</a>
  </p>
  <p>
    Free software under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="license">GNU AGPL v3</a
    >{#if SOURCE_URL}
      · <a href={SOURCE_URL}>Source code</a>{/if}.
  </p>
{/snippet}

{#snippet themePicker()}
  <label>
    Theme
    <select value={theme} onchange={(event) => setTheme(event.currentTarget.value)}>
      {#each Object.entries(THEMES) as [value, label] (value)}
        <option {value}>{label}</option>
      {/each}
    </select>
  </label>
  <label>
    <input
      type="checkbox"
      checked={sound.on}
      onchange={(event) => setSound(event.currentTarget.checked)}
    />
    Sound
  </label>
{/snippet}

{#snippet installOffer()}
  {#if install.prompt}
    <button class="button primary" onclick={installApp}>Install the app</button>
  {:else if install.ios}
    <p class="muted">
      Get the app: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
    </p>
  {/if}
{/snippet}

<footer class="wide">
  {@render colophon()}
  <div class="footer-row">{@render themePicker()} {@render installOffer()}</div>
</footer>

<!-- Phones get an app-style tab bar; everything else lives in the More sheet. -->
<nav class="tabs" aria-label="Main">
  {#each TABS as { href, label, icon } (href)}
    <a {href} aria-current={page.url.pathname === href ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
      {label}
    </a>
  {/each}
  <button aria-expanded={menuOpen} aria-controls="more" onclick={() => (menuOpen = !menuOpen)}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    More
  </button>
</nav>

{#if menuOpen}
  <button class="backdrop" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
  <div class="sheet" id="more">
    <div class="sheet-links">
      {#each links.filter((link) => !TABS.some((tab) => tab.href === link.href)) as { href, label } (href)}
        <a {href}>{label}</a>
      {/each}
      {#if session.user}
        <a href="/account">Settings</a>
        <button class="link" onclick={signOut}>Sign out</button>
      {:else if session.ready}
        <a href="/signup">Create an account</a>
      {/if}
    </div>
    {@render installOffer()}
    {@render themePicker()}
    <div class="muted small">{@render colophon()}</div>
  </div>
{/if}

<style>
  header {
    padding-top: env(safe-area-inset-top);
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

  .links {
    display: flex;
    gap: 1.25rem;
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

  .footer-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: center;
    margin-top: 0.5rem;
  }

  footer select,
  .sheet select {
    margin-left: 0.25rem;
    padding: 0.1rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
  }

  /* Phone layout: the tab bar and More sheet replace the header links and the footer. */
  .tabs,
  .sheet,
  .backdrop {
    display: none;
  }

  @media (max-width: 760px) {
    .wide {
      display: none !important;
    }

    main {
      padding: 1rem 0.75rem calc(5rem + env(safe-area-inset-bottom));
    }

    .tabs {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 20;
      display: flex;
      padding-bottom: env(safe-area-inset-bottom);
      border-top: var(--border-width) solid var(--border);
      background: var(--surface);
    }

    .tabs a,
    .tabs button {
      display: grid;
      flex: 1;
      gap: 0.15rem;
      justify-items: center;
      padding: 0.5rem 0 0.45rem;
      border: 0;
      background: none;
      color: var(--muted);
      font-size: 0.72rem;
      text-decoration: none;
      cursor: pointer;
    }

    .tabs [aria-current='page'],
    .tabs [aria-expanded='true'] {
      color: var(--accent);
      font-weight: 600;
    }

    .tabs svg {
      width: 1.45rem;
      height: 1.45rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 18;
      display: block;
      border: 0;
      background: rgb(0 0 0 / 0.35);
    }

    .sheet {
      position: fixed;
      right: 0;
      bottom: calc(3.6rem + env(safe-area-inset-bottom));
      left: 0;
      z-index: 19;
      display: grid;
      gap: 1rem;
      max-height: 75vh;
      overflow-y: auto;
      padding: 1rem 1.25rem;
      border-radius: var(--radius) var(--radius) 0 0;
      background: var(--surface);
      box-shadow: var(--shadow);
    }

    .sheet-links {
      display: grid;
    }

    .sheet-links a,
    .sheet-links .link {
      padding: 0.7rem 0.25rem;
      border-bottom: 1px solid var(--border);
      color: var(--text);
      font-size: 1.05rem;
      text-align: left;
      text-decoration: none;
    }

    .small {
      font-size: 0.85rem;
    }

    .small :global(p) {
      margin: 0.25rem 0;
    }

    .small :global(a) {
      color: inherit;
    }
  }
</style>
