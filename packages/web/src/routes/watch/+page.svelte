<script lang="ts">
  import type { GameState } from '@uttt/core';
  import GameCard from '#lib/GameCard.svelte';
  import { timeControlName } from '#lib/game.ts';
  import { api } from '#lib/session.svelte.ts';
  import { onMount } from 'svelte';

  /** The list is refreshed this often; open a game to follow it move by move. */
  const REFRESH_MS = 2000;

  let games = $state.raw<GameState[] | null>(null);
  let receivedAt = $state(0);
  let now = $state(Date.now());
  let error = $state('');

  onMount(() => {
    async function refresh() {
      try {
        games = await api<GameState[]>('GET', '/api/games/live');
        receivedAt = now = Date.now();
        error = '';
      } catch (e) {
        error = (e as Error).message;
      }
    }
    refresh();
    const timers = [setInterval(refresh, REFRESH_MS), setInterval(() => (now = Date.now()), 250)];
    return () => timers.forEach(clearInterval);
  });
</script>

<h1>Live games</h1>

{#if error}
  <p class="error" role="alert">{error}</p>
{/if}

{#if games === null}
  <p class="muted">Loading…</p>
{:else if games.length === 0}
  <div class="card empty">
    <p>No one is playing right now. Be the first!</p>
    <a class="button primary" href="/">Start a game</a>
  </div>
{:else}
  <p class="muted">
    {games.length === 1 ? '1 game' : `${games.length} games`} in progress, strongest players first.
  </p>
  <div class="games">
    {#each games as game (game.id)}
      <GameCard {game} {now} {receivedAt}>
        <p class="details">
          <span class="muted"
            >{timeControlName(game.timeControl)} · {game.rated ? 'Rated' : 'Casual'}</span
          >
          <a href="/game/{game.id}">Watch</a>
        </p>
      </GameCard>
    {/each}
  </div>
{/if}

<style>
  h1 {
    margin-top: 0;
  }

  .games {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    gap: 1rem;
  }

  .details {
    display: flex;
    justify-content: space-between;
    margin: 0;
  }

  .empty {
    display: grid;
    gap: 1rem;
    justify-items: start;
    max-width: 28rem;
  }

  .empty p {
    margin: 0;
  }

  .error {
    color: var(--blunder);
  }
</style>
