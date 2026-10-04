<script lang="ts">
  import { api } from '#lib/session.svelte.ts';
  import { timing, type Tournament } from '#lib/tournament.ts';
  import { onMount } from 'svelte';

  let list = $state<{ current: Tournament[]; finished: Tournament[] } | null>(null);
  let now = $state(Date.now());

  onMount(() => {
    api<NonNullable<typeof list>>('GET', '/api/tournaments').then((loaded) => (list = loaded));
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
</script>

<h1>Tournaments</h1>
<p class="muted">
  Arena tournaments: for a fixed time, you're paired again and again as soon as your game ends. A
  win scores 2 points, a draw 1. Join any time while it runs.
</p>

{#snippet card(tournament: Tournament)}
  <a class="card tournament" href="/tournaments/{tournament.id}">
    <strong>{tournament.name}</strong>
    <span>{tournament.timeControl} · {tournament.rated ? 'Rated' : 'Casual'}</span>
    <span class="muted">
      {timing(tournament, now)} · {tournament.players}
      {tournament.players === 1 ? 'player' : 'players'}
    </span>
  </a>
{/snippet}

{#if list}
  <h2>Coming up and running</h2>
  {#if list.current.length === 0}
    <p class="muted">No tournaments scheduled right now. Check back soon!</p>
  {/if}
  <div class="list">
    {#each list.current as tournament (tournament.id)}{@render card(tournament)}{/each}
  </div>

  {#if list.finished.length > 0}
    <h2>Recently finished</h2>
    <div class="list">
      {#each list.finished as tournament (tournament.id)}{@render card(tournament)}{/each}
    </div>
  {/if}
{:else}
  <p class="muted">Loading…</p>
{/if}

<style>
  h1 {
    margin-top: 0;
  }

  h2 {
    margin-top: 1.5rem;
    font-size: 1.1rem;
  }

  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.75rem;
  }

  .tournament {
    display: grid;
    gap: 0.2rem;
    color: inherit;
    text-decoration: none;
  }

  .tournament:hover {
    border-color: var(--accent);
  }

  .tournament strong {
    font-size: 1.1rem;
  }
</style>
