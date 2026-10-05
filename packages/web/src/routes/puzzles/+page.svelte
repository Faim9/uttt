<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    bestDefense,
    formatMove,
    other,
    play,
    PUZZLE_SLACK,
    puzzleStart,
    stillWins,
    type Puzzle,
  } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import { Engine } from '#lib/engine.ts';
  import { api } from '#lib/session.svelte.ts';
  import { playSound } from '#lib/sound.svelte.ts';
  import { onDestroy, untrack } from 'svelte';

  /** A puzzle as the server sends it; `you` is null for guests. */
  interface Shown extends Puzzle {
    id: number;
    rating: number;
    plays: number;
    daily: boolean;
    you: { rating: number; provisional: boolean; rated: boolean } | null;
  }

  /** The opponent's reply waits this long, so you see your move land first. */
  const REPLY_MS = 450;
  /** Enough for the engine to find the reply that punishes a wrong move in these endgames. */
  const REFUTATION_PLAYOUTS = 30_000;

  const engine = new Engine();
  onDestroy(() => engine.destroy());
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  let puzzle = $state.raw<Shown | null>(null);
  let error = $state('');
  /** The moves on the board since the puzzle's start, both sides; the server judges these. */
  let history = $state.raw<number[]>([]);
  let status = $state<'solving' | 'wrong' | 'solved' | 'shown'>('solving');
  /** Whether this try moves your rating: only your first try at a puzzle does. */
  let rated = $state(false);
  /** Your rating change once the try is judged. */
  let change = $state<number | null>(null);
  let reported = false;
  /** After a wrong move, its place in `history`: "Try again" goes back to just before it. */
  let mistake = $state<number | null>(null);

  const begin = $derived(puzzle ? puzzleStart(puzzle) : null);
  const line = $derived(begin?.line ?? []);
  const solver = $derived(begin?.position.turn ?? 'x');
  const position = $derived(begin ? history.reduce(play, begin.position) : null);
  /** Whether the moves so far are the puzzle's own line, whose replies are then used. */
  const onLine = $derived(history.every((move, i) => move === line[i]));
  /** The opponent's answer to a wrong move, once it's played. */
  const refutation = $derived(mistake === null ? null : (history[mistake + 1] ?? null));
  const finished = $derived(status === 'solved' || status === 'shown');
  const yourMoves = $derived(history.filter((move, i) => i % 2 === 0).map(formatMove));
  const analysis = $derived(
    puzzle
      ? `/analysis?${new URLSearchParams({ position: puzzle.position, moves: history.map(formatMove).join(' ') })}`
      : '/analysis',
  );

  // `/puzzles?id=42` opens puzzle 42, `?id=daily` today's; plain `/puzzles` picks one at your level.
  $effect(() => {
    const which = page.url.searchParams.get('id') ?? 'next';
    untrack(() => {
      if (String(puzzle?.id) !== which) load(which);
    });
  });

  async function load(which: string) {
    try {
      start(await api<Shown>('GET', `/api/puzzles/${which}`));
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function start(shown: Shown) {
    puzzle = shown;
    history = [];
    mistake = null;
    status = 'solving';
    rated = shown.you?.rated ?? false;
    change = null;
    reported = false;
  }

  /** Sends your first try to be judged: on your first mistake, on solving, or on giving up. */
  async function report() {
    if (!puzzle || !rated || reported) return;
    reported = true;
    const result = await api<{ change: number | null; puzzle: Shown }>(
      'POST',
      `/api/puzzles/${puzzle.id}/attempt`,
      { moves: history.map(formatMove) },
    );
    // You may have moved on to another puzzle meanwhile.
    if (puzzle?.id !== result.puzzle.id) return;
    puzzle = result.puzzle;
    change = result.change;
  }

  /**
   * Any move that still forces a win counts, not only the puzzle's own line (up to a little slower):
   * it's checked exhaustively, like the puzzle itself. Then the opponent defends as long as possible.
   */
  function onmove(move: number) {
    if (!puzzle || !position) return;
    const before = position;
    const allowed = puzzle.winIn + PUZZLE_SLACK - Math.ceil(history.length / 2);
    const followsLine = onLine && move === line[history.length];
    history = [...history, move];
    const played = history;
    status = 'solving';
    // Checking another move can take a moment, so the move shows first.
    setTimeout(() => {
      if (history !== played) return; // you've moved on
      if (!followsLine && stillWins(before, move, allowed) !== true) return punish();
      if (position?.outcome === solver) {
        status = 'solved';
        playSound('solved');
        report();
        return;
      }
      setTimeout(() => {
        if (history !== played || !position) return;
        const reply = onLine ? line[history.length] : bestDefense(position, allowed - 1);
        history = [...history, reply];
      }, REPLY_MS);
    });
  }

  /** Leaves your wrong move on the board and plays the opponent's best answer, so you see why it fails. */
  async function punish() {
    status = 'wrong';
    playSound('wrong');
    report();
    mistake = history.length - 1;
    const played = history;
    if (!position || position.outcome !== null) return;
    const [found] = await Promise.all([
      engine.analyze(position, REFUTATION_PLAYOUTS),
      wait(REPLY_MS),
    ]);
    if (history !== played || found?.bestMove == null) return;
    history = [...history, found.bestMove];
  }

  function tryAgain() {
    if (mistake === null) return;
    history = history.slice(0, mistake);
    mistake = null;
    status = 'solving';
  }

  function showSolution() {
    if (!puzzle) return;
    report();
    const shown = puzzle;
    history = [];
    mistake = null;
    status = 'shown';
    line.forEach((move, i) =>
      setTimeout(
        () => {
          if (puzzle === shown && status === 'shown') history = [...history, move];
        },
        (i + 1) * REPLY_MS,
      ),
    );
  }

  /** The next puzzle at your level. Skipping one you've started counts as giving up. */
  async function next() {
    if (history.length > 0) report();
    try {
      const shown = await api<Shown>('GET', '/api/puzzles/next');
      start(shown);
      goto(`/puzzles?id=${shown.id}`);
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

{#if puzzle && position}
  <div class="board-layout">
    <Board
      {position}
      lastMove={history.at(-1) ?? null}
      disabled={position.turn !== solver || finished || status === 'wrong'}
      {onmove}
    />

    <div class="panel">
      <section class="card">
        <h2>{puzzle.daily ? 'Daily puzzle' : `Puzzle #${puzzle.id}`}</h2>
        <p class="task">
          <span class="side {solver}">{solver.toUpperCase()}</span> to play and win
        </p>
        {#if status === 'wrong'}
          <p class="wrong" role="alert">
            That's not it!
            {#if refutation !== null}
              {other(solver).toUpperCase()} answers {formatMove(refutation)}.
            {/if}
          </p>
        {:else if status === 'solved'}
          <p class="right" role="status">
            Solved! {yourMoves.join(', then ')} wins.
            {#if !onLine}
              That's another way to win; the puzzle's own line is
              {line
                .filter((m, i) => i % 2 === 0)
                .map(formatMove)
                .join(', then ')}.
            {/if}
          </p>
        {:else if status === 'shown'}
          <p role="status">The solution: {puzzle.line.join(' ')}</p>
        {:else if history.length === 0}
          <p class="muted">Your opponent will reply with their best defense.</p>
        {:else if position.turn === solver}
          <p class="right" role="status">Good move! Keep going.</p>
        {/if}
        <div class="actions">
          {#if finished}
            <button class="button primary" onclick={next}>Next puzzle</button>
            <a class="button" href={analysis}>Analyze</a>
          {:else}
            {#if status === 'wrong'}
              <button class="button primary" onclick={tryAgain}>Try again</button>
            {/if}
            <button class="button" onclick={showSolution}>Show solution</button>
            <button class="button" onclick={next}>Skip</button>
          {/if}
        </div>
      </section>

      <section class="card rating">
        {#if puzzle.you}
          <p>
            Your puzzle rating
            <strong>{puzzle.you.rating}{puzzle.you.provisional ? '?' : ''}</strong>
            {#if change !== null}
              <span class={change >= 0 ? 'right' : 'wrong'}>
                {change >= 0 ? '+' : '−'}{Math.abs(change)}
              </span>
            {/if}
          </p>
          {#if !rated}
            <p class="muted">You've tried this one before, so it isn't rated.</p>
          {/if}
        {:else}
          <p>
            <a href="/signup">Sign up</a> or <a href="/login">sign in</a> to get a puzzle rating: solve
            puzzles to climb, and get puzzles at your level.
          </p>
        {/if}
        {#if finished}
          <p class="muted">
            This puzzle is rated {puzzle.rating} · tried {puzzle.plays}
            {puzzle.plays === 1 ? 'time' : 'times'}
          </p>
        {/if}
      </section>
      <p class="muted">
        {#if puzzle.daily}
          A new daily puzzle every day.
        {:else}
          <a href="/puzzles?id=daily">Today's daily puzzle</a>
        {/if}
      </p>
    </div>
  </div>
{:else}
  <p class="muted">{error || 'Loading the puzzle…'}</p>
{/if}

<style>
  .task {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .side {
    padding: 0 0.3rem;
    border-radius: 4px;
    color: white;
  }

  .side.x {
    background: var(--x);
  }

  .side.o {
    background: var(--o);
  }

  .wrong {
    color: var(--blunder);
    font-weight: 600;
  }

  .right {
    color: var(--hint);
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .rating p {
    margin: 0.25rem 0;
  }

  .rating strong {
    font-size: 1.3rem;
  }
</style>
