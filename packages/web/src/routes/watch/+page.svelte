<script lang="ts">
  import { replay, type GameState, type Player } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import PlayerBar from '#lib/PlayerBar.svelte';
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

  function clock(game: GameState, side: Player): number {
    const elapsed = game.running === side ? now - receivedAt : 0;
    return Math.max(0, game.clocks[side] - elapsed);
  }

  const names = (game: GameState) =>
    `${game.players.x.username ?? 'Anonymous'} vs ${game.players.o.username ?? 'Anonymous'}`;
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
      <article class="card game">
        <PlayerBar
          side="o"
          player={game.players.o}
          clock={clock(game, 'o')}
          running={game.running === 'o'}
        />
        <div class="board">
          <Board position={replay(game.moves)} lastMove={game.moves.at(-1) ?? null} disabled />
          <a class="cover" href="/game/{game.id}" aria-label="Watch {names(game)}"></a>
        </div>
        <PlayerBar
          side="x"
          player={game.players.x}
          clock={clock(game, 'x')}
          running={game.running === 'x'}
        />
        <p class="details">
          <span class="muted">{game.timeControl} · {game.rated ? 'Rated' : 'Casual'}</span>
          <a href="/game/{game.id}">Watch</a>
        </p>
      </article>
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

  .game {
    display: grid;
    gap: 0.5rem;
  }

  .board {
    position: relative;
  }

  /* The whole board opens the game; a link can't wrap the board's cells, so it lies on top. */
  .cover {
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
  }

  .cover:hover {
    box-shadow: inset 0 0 0 3px var(--accent);
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
