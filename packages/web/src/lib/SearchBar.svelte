<script lang="ts">
  import { page } from '$app/state';
  import { t } from './i18n.svelte.ts';
  import { search, stopSearch } from './search.svelte.ts';
  import { socket } from './session.svelte.ts';

  /** Keeps a quick-pairing search alive across pages, and shows it everywhere but the lobby. */
  let now = $state(Date.now());

  $effect(() =>
    socket.listen((message) => {
      if (message.type === 'gameStarted') search.pool = null;
      else if (message.type === 'error' && search.pool) {
        search.error = message.message;
        search.pool = null;
      }
    }),
  );

  // Joins the pool when a search starts, and again after a reconnect (the server forgets seeks then).
  $effect(() => {
    if (socket.connected && search.pool) {
      socket.send({ type: 'seek', timeControl: search.pool, rated: search.rated });
    }
  });

  $effect(() => {
    if (!search.pool) return;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  const waited = $derived(Math.max(0, Math.floor((now - search.since) / 1000)));
</script>

{#if search.pool && page.url.pathname !== '/'}
  <div class="bar" role="status">
    <span>
      {t(search.rated ? 'search.lookingRated' : 'search.looking', { pool: search.pool })} ·
      {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, '0')}
    </span>
    <span class="muted">{t('search.taken')}</span>
    <button class="button" onclick={stopSearch}>{t('common.cancel')}</button>
  </div>
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1rem;
    border-bottom: var(--border-width) solid var(--border);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
    font-weight: 500;
  }

  .muted {
    font-weight: 400;
  }

  .button {
    padding: 0.2rem 0.75rem;
  }
</style>
