<script lang="ts">
  import { CATEGORIES, type Category } from '@uttt/core';
  import { api } from '#lib/session.svelte.ts';

  interface Entry {
    username: string;
    rating: number;
    games: number;
  }

  let category = $state<Category>('blitz');
  let entries = $state<Entry[] | null>(null);

  $effect(() => {
    entries = null;
    api<Entry[]>('GET', `/api/leaderboard/${category}`).then((loaded) => (entries = loaded));
  });
</script>

<h1>Leaderboard</h1>

<div class="tabs" role="tablist">
  {#each CATEGORIES as tab (tab)}
    <button
      class="button"
      class:primary={tab === category}
      role="tab"
      aria-selected={tab === category}
      onclick={() => (category = tab)}>{tab}</button
    >
  {/each}
</div>

<section class="card">
  {#if entries === null}
    <p class="muted">Loading…</p>
  {:else if entries.length === 0}
    <p class="muted">
      No ranked players yet. Players appear once their rating is established and they've played in
      the last 30 days.
    </p>
  {:else}
    <table>
      <thead>
        <tr><th>#</th><th>Player</th><th>Rating</th><th>Games</th></tr>
      </thead>
      <tbody>
        {#each entries as entry, i (entry.username)}
          <tr>
            <td>{i + 1}</td>
            <td><a href="/@{entry.username}">{entry.username}</a></td>
            <td>{entry.rating}</td>
            <td class="muted">{entry.games}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  h1 {
    margin-top: 0;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    text-transform: capitalize;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 0.5rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  th {
    color: var(--muted);
    font-weight: 600;
  }
</style>
