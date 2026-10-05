<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    DISCONNECT_GRACE_MS,
    formatMove,
    other,
    replay,
    TIME_CONTROLS,
    type GameState,
    type Player,
  } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import { analysisLink, clocksAt, resultText, timeControlName } from '#lib/game.ts';
  import { t } from '#lib/i18n.svelte.ts';
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
  /** The move the board shows, counted from 1, when looking back; null follows the game. */
  let viewing = $state<number | null>(null);
  const ply = $derived(viewing ?? moves.length);
  const shown = $derived(moves.slice(0, ply));
  $effect(() => {
    void gameId;
    viewing = null;
  });
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

  /** Steps through the game; reaching the last move follows the game again. */
  function view(target: number) {
    viewing = target >= moves.length ? null : Math.max(0, target);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) return;
    const steps: Record<string, number> = {
      ArrowLeft: ply - 1,
      ArrowRight: ply + 1,
      Home: 0,
      End: moves.length,
    };
    if (!(event.key in steps)) return;
    event.preventDefault();
    view(steps[event.key]);
  }

  /** The clock beside a player: live while following the game, else as it stood at the move shown. */
  function barClock(side: Player): number {
    const then = viewing === null || !game ? null : clocksAt(game, ply);
    return then ? then[side] : clock(side);
  }

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
    if (!game || !position) return t('common.loading');
    if (game.termination) return resultText(game);
    if (you === null) return t('game.toMove', { side: position.turn.toUpperCase() });
    return t(position.turn === you ? 'game.yourMove' : 'game.opponentsMove');
  }
</script>

<svelte:window {onkeydown} />

{#if game && position}
  <div class="board-layout">
    <div class="play">
      <PlayerBar
        side={other(bottom)}
        player={game.players[other(bottom)]}
        clock={barClock(other(bottom))}
        running={viewing === null && !unconfirmed && game.running === other(bottom)}
      />
      <Board
        position={viewing === null ? position : replay(shown)}
        lastMove={shown.at(-1) ?? null}
        disabled={!active || position.turn !== you || viewing !== null}
        over={!active}
        onmove={play}
      />
      <PlayerBar
        side={bottom}
        player={game.players[bottom]}
        clock={barClock(bottom)}
        running={viewing === null && !unconfirmed && game.running === bottom}
      />
    </div>

    <div class="panel">
      <section class="card">
        <h2>
          {timeControlName(game.timeControl)} · {t(game.rated ? 'game.rated' : 'game.casual')}
        </h2>
        <p class="status" aria-live="polite">{status()}</p>
        {#if active && you === null}
          <p class="muted">{t('game.watching')} <a href="/watch">{t('game.moreLive')}</a></p>
        {/if}
        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}

        {#if active && you}
          <div class="actions">
            {#if game.moves.length < 2}
              <button class="button" onclick={() => act('abort')}>{t('game.abort')}</button>
            {:else if confirmingResign}
              <span class="confirm">{t('game.resignConfirm')}</span>
              <button class="button primary" onclick={() => act('resign')}
                >{t('game.resignYes')}</button
              >
              <button class="button" onclick={() => (confirmingResign = false)}
                >{t('common.cancel')}</button
              >
            {:else}
              <button class="button" onclick={() => (confirmingResign = true)}
                >{t('game.resign')}</button
              >
              {#if game.drawOffer === other(you)}
                <button class="button primary" onclick={() => act('draw')}
                  >{t('game.acceptDraw')}</button
                >
              {:else}
                <button
                  class="button"
                  disabled={game.drawOffer === you}
                  onclick={() => act('draw')}
                >
                  {t(game.drawOffer === you ? 'game.drawOffered' : 'game.offerDraw')}
                </button>
              {/if}
            {/if}
          </div>
          {#if game.drawOffer === other(you)}
            <p class="muted">{t('game.drawOffer')}</p>
          {/if}
          {#if claimIn !== null}
            <div class="left" role="status">
              <p>{t('game.opponentLeft')}</p>
              {#if claimIn > 0}
                <p class="muted">{t('game.claimIn', { s: Math.ceil(claimIn / 1000) })}</p>
              {:else}
                <div class="actions">
                  <button class="button primary" onclick={() => claim('win')}
                    >{t('game.claimWin')}</button
                  >
                  <button class="button" onclick={() => claim('draw')}>{t('game.claimDraw')}</button
                  >
                </div>
              {/if}
            </div>
          {/if}
        {:else if !active}
          {#if you && game.tournamentId}
            {#if !stayHere}
              <p class="offer">{t('game.backSoon')}</p>
            {/if}
            <div class="actions">
              <a class="button primary" href="/tournaments/{game.tournamentId}"
                >{t('game.backToTournament')}</a
              >
              {#if !stayHere}
                <button class="button" onclick={() => (stayHere = true)}>{t('game.stay')}</button>
              {/if}
            </div>
          {:else if you}
            {#if rematchBy === other(you)}
              <p class="offer">{t('game.rematchOffer')}</p>
            {/if}
            <div class="actions">
              {#if rematchBy === other(you)}
                <button class="button primary" onclick={() => act('rematch')}
                  >{t('game.acceptRematch')}</button
                >
                <button class="button" onclick={() => act('cancelRematch')}
                  >{t('common.decline')}</button
                >
              {:else if rematchBy === you}
                <button class="button" onclick={() => act('cancelRematch')}
                  >{t('game.cancelRematch')}</button
                >
              {:else}
                <button class="button primary" onclick={() => act('rematch')}
                  >{t('game.rematch')}</button
                >
              {/if}
              <a class="button" href={newOpponentLink ?? '/'}>
                {t(newOpponentLink ? 'game.newOpponent' : 'game.newGame')}
              </a>
            </div>
            {#if rematchBy === you}
              <p class="muted waiting">{t('game.waitingOpponent')}</p>
            {/if}
          {/if}
          <div class="actions">
            <a
              class="button"
              class:primary={!you}
              href={analysisLink(game.moves, { review: true, game: game.id })}
            >
              {t('game.review')}
            </a>
          </div>
        {/if}
      </section>

      <section class="card">
        <h2>{t('game.moves')}</h2>
        <div class="moves">
          {#each moves as move, i (i)}
            {#if i % 2 === 0}<span class="muted">{i / 2 + 1}.</span>{/if}
            <button class="move" class:current={i + 1 === ply} onclick={() => view(i + 1)}
              >{formatMove(move)}</button
            >
          {/each}
        </div>
        <div class="steps">
          <button class="button" aria-label={t('analysis.first')} onclick={() => view(0)}>⏮</button>
          <button class="button" aria-label={t('analysis.previous')} onclick={() => view(ply - 1)}
            >◀</button
          >
          <button class="button" aria-label={t('analysis.next')} onclick={() => view(ply + 1)}
            >▶</button
          >
          <button class="button" aria-label={t('analysis.last')} onclick={() => view(moves.length)}
            >⏭</button
          >
        </div>
        {#if viewing !== null && active}
          <p class="muted">
            <button class="link" onclick={() => (viewing = null)}>{t('game.backToLive')}</button>
          </p>
        {/if}
      </section>
    </div>
  </div>
{:else}
  <p class="muted">{error || t('game.loading')}</p>
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

  .move {
    justify-self: start;
    padding: 0.05rem 0.3rem;
    border: 0;
    border-radius: 4px;
    background: none;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .move:hover {
    background: var(--border);
  }

  .move.current {
    background: var(--accent);
    color: white;
  }

  .steps {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.75rem;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
