<script lang="ts">
  import { CATEGORIES, type Category } from '@uttt/core';
  import ChallengeDialog from '#lib/ChallengeDialog.svelte';
  import { api, session } from '#lib/session.svelte.ts';
  import { onMount } from 'svelte';

  /** People and bots are ranked apart; bots online now can be challenged from here. */
  const BOT_GUIDE = 'https://github.com/Faim9/uttt/blob/main/docs/bot-api.md';

  interface Entry {
    username: string;
    rating: number;
    games: number;
  }

  let category = $state<Category>('blitz');
  let bots = $state(false);
  let entries = $state<Entry[] | null>(null);
  let online = $state<{ username: string; playing: boolean; bullet: number; blitz: number }[]>([]);
  let challenged = $state('');
  let dialog: ChallengeDialog | undefined = $state();

  $effect(() => {
    entries = null;
    const path = `/api/leaderboard/${category}${bots ? '?bots' : ''}`;
    api<Entry[]>('GET', path).then((loaded) => (entries = loaded));
  });

  onMount(() => {
    api<typeof online>('GET', '/api/bots').then((loaded) => (online = loaded));
  });

  function challenge(username: string) {
    challenged = username;
    // The dialog takes the new name before it opens.
    queueMicrotask(() => dialog?.open());
  }
</script>

<h1>Leaderboard</h1>

<div class="tabs" role="group" aria-label="Who">
  <button class="button" class:primary={!bots} onclick={() => (bots = false)}>People</button>
  <button class="button" class:primary={bots} onclick={() => (bots = true)}>Bots</button>
</div>

{#if bots}
  <section class="card">
    <h2>Bots online</h2>
    {#if online.length === 0}
      <p class="muted">No bots are online right now.</p>
    {:else}
      <ul class="bots">
        {#each online as bot (bot.username)}
          <li>
            <a href="/@{bot.username}">{bot.username}</a>
            <span class="bot-tag">BOT</span>
            <span class="muted">blitz {bot.blitz} · bullet {bot.bullet}</span>
            {#if bot.playing}
              <span class="muted">playing</span>
            {:else if session.user}
              <button class="button" onclick={() => challenge(bot.username)}>Challenge</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <p class="muted">
      Bots are programs playing through the <a href={BOT_GUIDE}>bot API</a>: write your own and see
      how it ranks. Games against people are casual; bots are rated among themselves.
    </p>
  </section>
  <ChallengeDialog bind:this={dialog} username={challenged} bot />
{/if}

<div class="tabs" role="tablist" aria-label="Category">
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

  .bots {
    display: grid;
    gap: 0.4rem;
    margin: 0 0 0.75rem;
    padding: 0;
    list-style: none;
  }

  .bots li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .bots .button {
    margin-left: auto;
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
