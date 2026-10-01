<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  let { children } = $props();

  const links = [
    { href: '/computer', label: 'Play computer' },
    { href: '/analysis', label: 'Analysis' },
  ];
</script>

<header>
  <nav>
    <a class="brand" href="/">UTTT</a>
    {#each links as { href, label } (href)}
      <a {href} aria-current={page.url.pathname === href ? 'page' : undefined}>{label}</a>
    {/each}
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
    gap: 1.5rem;
    align-items: center;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0.75rem 1rem;
  }

  nav a {
    color: var(--muted);
    text-decoration: none;
  }

  nav a:hover,
  nav a[aria-current='page'] {
    color: var(--text);
  }

  .brand {
    font-weight: 800;
    letter-spacing: 0.04em;
    color: var(--text);
  }

  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }
</style>
