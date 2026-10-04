<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    DISCONNECT_GRACE_MS,
    formatMove,
    other,
    replay,
    resultText,
    TIME_CONTROLS,
    type GameState,
    type Player,
  } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import { analysisLink } from '#lib/game.ts';
  import PlayerBar from '#lib/PlayerBar.svelte';
  import { socket } from '#lib/session.svelte.ts';
  import { playSound } from '#lib/sound.svelte.ts';

  const gameId = $derived(page.params.id ?? '');

  let game = $state.raw<GameState | null>(null);
  let you = $state<Player | null>(null);
  let receivedAt = $state(0);
  let now = $state(Date.now());
  let error = $state('');
  /** Your last move, shown at once while the server confirms it (`ply` is its 1-based number). */
  let sent = $state<{ move: number; ply: number; at: number } | null>(null);
  let confirmingResign = $state(false);
  /** Who has offered a rematch since the game ended. */
  let rematchBy = $state<Player | null>(null);
  /** After a tournament game, players head back to the tournament for their next pairing. */
  const RETURN_MS = 4000;
  /** Your clock warns once when it drops below this. */
  const LOW_TIME_MS = 10_000;
  let stayHere = $state(false);

  const unconfirmed = $derived(
    game?.termination === null && sent && game.moves.length < sent.ply ? sent : null,
  );
  const moves = $derived(
    game ? (unconfirmed ? [...game.moves, unconfirmed.move] : game.moves) : [],
  );
  const position = $derived(game ? replay(moves) : null);
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
      } else if (message.type === 'rematch' && message.gameId === gameId) {
        rematchBy = message.by;
      } else if (message.type === 'error') {
        error = message.message;
        sent = null;
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

  $effect(() => {
    const tournament = game?.tournamentId;
    if (!tournament || active || !you || stayHere) return;
    const timer = setTimeout(() => goto(`/tournaments/${tournament}`), RETURN_MS);
    return () => clearTimeout(timer);
  });

  // A sound when a game you're watching ends (not when you open one that's already over).
  let wasActive = false;
  $effect(() => {
    if (wasActive && !active) playSound('end');
    wasActive = active;
  });

  let warned = false;
  $effect(() => {
    if (!you || !active) return;
    const left = clock(you);
    if (left >= LOW_TIME_MS) warned = false;
    else if (!warned && game?.running === you) {
      warned = true;
      playSound('lowTime');
    }
  });

  /** Your clock stops when you move, not when the server's confirmation arrives. */
  function clock(side: Player): number {
    if (!game) return 0;
    const until = unconfirmed?.at ?? now;
    const elapsed = game.running === side ? until - receivedAt : 0;
    return Math.max(0, game.clocks[side] - elapsed);
  }

  function claim(result: 'win' | 'draw') {
    error = '';
    socket.send({ type: 'claim', gameId, result });
  }

  function play(move: number) {
    error = '';
    sent = { move, ply: moves.length + 1, at: Date.now() };
    socket.send({ type: 'move', gameId, move });
  }

  /** "New opponent" joins the same quick-pairing pool from the home page; custom time controls have none. */
  const newOpponentLink = $derived(
    game && (TIME_CONTROLS as readonly string[]).includes(game.timeControl)
      ? `/?seek=${encodeURIComponent(game.timeControl)}${game.rated ? '&rated' : ''}`
      : null,
  );

  function act(type: 'draw' | 'resign' | 'abort' | 'rematch' | 'cancelRematch') {
    error = '';
    confirmingResign = false;
    socket.send({ type, gameId });
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
        running={!unconfirmed && game.running === other(bottom)}
      />
      <Board
        {position}
        lastMove={moves.at(-1) ?? null}
        disabled={!active || position.turn !== you}
        over={!active}
        onmove={play}
      />
      <PlayerBar
        side={bottom}
        player={game.players[bottom]}
        clock={clock(bottom)}
        running={!unconfirmed && game.running === bottom}
      />
    </div>

    <div class="panel">
      <section class="card">
        <h2>{game.timeControl} · {game.rated ? 'Rated' : 'Casual'}</h2>
        <p class="status" aria-live="polite">{status()}</p>
        {#if active && you === null}
          <p class="muted">You're watching. <a href="/watch">More live games</a></p>
        {/if}
        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}

        {#if active && you}
          <div class="actions">
            {#if game.moves.length < 2}
              <button class="button" onclick={() => act('abort')}>Abort</button>
            {:else if confirmingResign}
              <span class="confirm">Resign this game?</span>
              <button class="button primary" onclick={() => act('resign')}>Yes, resign</button>
              <button class="button" onclick={() => (confirmingResign = false)}>Cancel</button>
            {:else}
              <button class="button" onclick={() => (confirmingResign = true)}>Resign</button>
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
          {#if you && game.tournamentId}
            {#if !stayHere}
              <p class="offer">Back to the tournament in a few seconds…</p>
            {/if}
            <div class="actions">
              <a class="button primary" href="/tournaments/{game.tournamentId}"
                >Back to tournament</a
              >
              {#if !stayHere}
                <button class="button" onclick={() => (stayHere = true)}>Stay here</button>
              {/if}
            </div>
          {:else if you}
            {#if rematchBy === other(you)}
              <p class="offer">Your opponent wants a rematch.</p>
            {/if}
            <div class="actions">
              {#if rematchBy === other(you)}
                <button class="button primary" onclick={() => act('rematch')}>Accept rematch</button
                >
                <button class="button" onclick={() => act('cancelRematch')}>Decline</button>
              {:else if rematchBy === you}
                <button class="button" onclick={() => act('cancelRematch')}>Cancel rematch</button>
              {:else}
                <button class="button primary" onclick={() => act('rematch')}>Rematch</button>
              {/if}
              <a class="button" href={newOpponentLink ?? '/'}>
                {newOpponentLink ? 'New opponent' : 'New game'}
              </a>
            </div>
            {#if rematchBy === you}
              <p class="muted waiting">Waiting for your opponent…</p>
            {/if}
          {/if}
          <div class="actions">
            <a
              class="button"
              class:primary={!you}
              href={analysisLink(game.moves, { review: true })}
            >
              Review game
            </a>
          </div>
        {/if}
      </section>

      <section class="card">
        <h2>Moves</h2>
        <div class="moves">
          {#each moves as move, i (i)}
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

  .offer {
    margin: 0.75rem 0 0;
    font-weight: 600;
  }

  .waiting {
    margin: 0.5rem 0 0;
  }

  .confirm {
    align-self: center;
    font-weight: 600;
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
