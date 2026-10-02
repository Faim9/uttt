<script lang="ts">
  import { page } from '$app/state';
  import {
    DISCONNECT_GRACE_MS,
    formatMove,
    other,
    replay,
    type GameState,
    type Player,
  } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import { analysisLink, resultText } from '#lib/game.ts';
  import PlayerBar from '#lib/PlayerBar.svelte';
  import { socket } from '#lib/session.svelte.ts';

  const gameId = $derived(page.params.id ?? '');

  let game = $state.raw<GameState | null>(null);
  let you = $state<Player | null>(null);
  let receivedAt = $state(0);
  let now = $state(Date.now());
  let error = $state('');

  const position = $derived(game ? replay(game.moves) : null);
  /** How long your opponent had been gone when the last update came; null while they're here. */
  const opponentAbsence = $derived(
    game && you && game.termination === null ? game.absence[other(you)] : null,
  );
  /** Ms until you may claim the game. */
  const claimIn = $derived(
    opponentAbsence === null
      ? null
      : Math.max(0, DISCONNECT_GRACE_MS - opponentAbsence - (now - receivedAt)),
  );
  const active = $derived(game !== null && game.termination === null);
  /** Board orientation follows the viewer: your side is shown at the bottom. */
  const bottom = $derived<Player>(you ?? 'x');

  $effect(() =>
    socket.listen((message) => {
      if (message.type === 'game' && message.game.id === gameId) {
        game = message.game;
        you = message.you;
        receivedAt = now = Date.now();
        error = '';
      } else if (message.type === 'error') {
        error = message.message;
      }
    }),
  );

  // (Re)subscribe whenever the connection is (re)established.
  $effect(() => {
    if (socket.connected) socket.send({ type: 'watch', gameId });
  });

  $effect(() => {
    if (!game?.running && opponentAbsence === null) return;
    const timer = setInterval(() => (now = Date.now()), 100);
    return () => clearInterval(timer);
  });

  function clock(side: Player): number {
    if (!game) return 0;
    const elapsed = game.running === side ? now - receivedAt : 0;
    return Math.max(0, game.clocks[side] - elapsed);
  }

  function claim(result: 'win' | 'draw') {
    error = '';
    socket.send({ type: 'claim', gameId, result });
  }

  function act(type: 'move' | 'draw' | 'resign' | 'abort', move = 0) {
    error = '';
    if (type === 'move') socket.send({ type, gameId, move });
    else socket.send({ type, gameId });
  }

  function status(): string {
    if (!game || !position) return 'Loading…';
    if (game.termination) return resultText(game);
    if (you === null) return `${position.turn.toUpperCase()} to move`;
    if (position.turn === you) return 'Your move';
    return "Opponent's move";
  }
</script>

{#if game && position}
  <div class="board-layout">
    <div class="play">
      <PlayerBar
        side={other(bottom)}
        player={game.players[other(bottom)]}
        clock={clock(other(bottom))}
        running={game.running === other(bottom)}
      />
      <Board
        {position}
        lastMove={game.moves.at(-1) ?? null}
        disabled={!active || position.turn !== you}
        onmove={(move) => act('move', move)}
      />
      <PlayerBar
        side={bottom}
        player={game.players[bottom]}
        clock={clock(bottom)}
        running={game.running === bottom}
      />
    </div>

    <div class="panel">
      <section class="card">
        <h2>{game.timeControl} · {game.rated ? 'Rated' : 'Casual'}</h2>
        <p class="status" aria-live="polite">{status()}</p>
        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}

        {#if active && you}
          <div class="actions">
            {#if game.moves.length < 2}
              <button class="button" onclick={() => act('abort')}>Abort</button>
            {:else}
              <button class="button" onclick={() => act('resign')}>Resign</button>
              {#if game.drawOffer === other(you)}
                <button class="button primary" onclick={() => act('draw')}>Accept draw</button>
              {:else}
                <button
                  class="button"
                  disabled={game.drawOffer === you}
                  onclick={() => act('draw')}
                >
                  {game.drawOffer === you ? 'Draw offered' : 'Offer draw'}
                </button>
              {/if}
            {/if}
          </div>
          {#if game.drawOffer === other(you)}
            <p class="muted">Your opponent offers a draw.</p>
          {/if}
          {#if claimIn !== null}
            <div class="left" role="status">
              <p>Your opponent left the game.</p>
              {#if claimIn > 0}
                <p class="muted">
                  If they don't come back, you can claim the game in {Math.ceil(claimIn / 1000)}s.
                </p>
              {:else}
                <div class="actions">
                  <button class="button primary" onclick={() => claim('win')}>Claim victory</button>
                  <button class="button" onclick={() => claim('draw')}>Call it a draw</button>
                </div>
              {/if}
            </div>
          {/if}
        {:else if !active}
          <div class="actions">
            <a class="button primary" href={analysisLink(game.moves, { review: true })}>
              Review game
            </a>
            <a class="button" href="/play">New game</a>
          </div>
        {/if}
      </section>

      <section class="card">
        <h2>Moves</h2>
        <div class="moves">
          {#each game.moves as move, i (i)}
            {#if i % 2 === 0}<span class="muted">{i / 2 + 1}.</span>{/if}
            <span>{formatMove(move)}</span>
          {/each}
        </div>
      </section>
    </div>
  </div>
{:else}
  <p class="muted">{error || 'Loading game…'}</p>
{/if}

<style>
  .play {
    display: grid;
    gap: 0.75rem;
  }

  .status {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .error {
    color: var(--o);
  }

  .left {
    margin-top: 1rem;
    padding: 0.5rem 0.75rem;
    border-left: 4px solid var(--mistake);
    border-radius: 4px;
    background: var(--bg);
  }

  .left p {
    margin: 0.25rem 0;
  }

  /* One row per move pair: number, X's move, O's move. */
  .moves {
    display: grid;
    grid-template-columns: repeat(3, auto);
    justify-content: start;
    gap: 0.1rem 1rem;
    max-height: 14rem;
    overflow-y: auto;
    font-variant-numeric: tabular-nums;
  }
</style>
