<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { formatMove, other, play, puzzleStart, type Position, type Puzzle } from '@uttt/core';
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
  const MOVES = ['', 'in one move', 'in two moves', 'in three moves', 'in four moves'];
  /** Enough for the engine to find the reply that punishes a wrong move in these endgames. */
  const REFUTATION_PLAYOUTS = 30_000;

  const engine = new Engine();
  onDestroy(() => engine.destroy());
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  let puzzle = $state.raw<Shown | null>(null);
  let error = $state('');
  let position = $state.raw<Position | null>(null);
  let step = $state(0);
  let lastMove = $state<number | null>(null);
  let status = $state<'solving' | 'wrong' | 'solved' | 'shown'>('solving');
  /** Whether this try moves your rating: only your first try at a puzzle does. */
  let rated = $state(false);
  /** Your rating change once the try is judged. */
  let change = $state<number | null>(null);
  /** Your moves so far, which the server judges. */
  let played: string[] = [];
  let reported = false;
  /** After a wrong move: where "Try again" goes back to, and the opponent's answer once it's played. */
  let retry: { position: Position; lastMove: number | null } | null = null;
  let refutation = $state<number | null>(null);

  const line = $derived(puzzle ? puzzleStart(puzzle).line : []);
  const solver = $derived(puzzle ? puzzleStart(puzzle).position.turn : 'x');
  const finished = $derived(status === 'solved' || status === 'shown');
  const analysis = $derived(
    puzzle
      ? `/analysis?${new URLSearchParams({ position: puzzle.position, moves: puzzle.line.join(' ') })}`
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
    resetBoard(shown);
    status = 'solving';
    rated = shown.you?.rated ?? false;
    change = null;
    played = [];
    reported = false;
  }

  function resetBoard(from: Puzzle) {
    position = puzzleStart(from).position;
    step = 0;
    lastMove = null;
  }

  /** Sends your first try to be judged: on your first mistake, on solving, or on giving up. */
  async function report() {
    if (!puzzle || !rated || reported) return;
    reported = true;
    const result = await api<{ change: number | null; puzzle: Shown }>(
      'POST',
      `/api/puzzles/${puzzle.id}/attempt`,
      { moves: played },
    );
    // You may have moved on to another puzzle meanwhile.
    if (puzzle?.id !== result.puzzle.id) return;
    puzzle = result.puzzle;
    change = result.change;
  }

  function advance(move: number) {
    if (!position) return;
    position = play(position, move);
    lastMove = move;
    step++;
  }

  function onmove(move: number) {
    played.push(formatMove(move));
    if (move !== line[step]) {
      punish(move);
      return;
    }
    advance(move);
    status = 'solving';
    if (step < line.length) {
      setTimeout(() => advance(line[step]), REPLY_MS);
    } else {
      status = 'solved';
      playSound('solved');
      report();
    }
  }

  /** Plays your wrong move and the opponent's best answer to it, so you see why it fails. */
  async function punish(move: number) {
    if (!position) return;
    status = 'wrong';
    playSound('wrong');
    report();
    retry = { position, lastMove };
    refutation = null;
    const after = play(position, move);
    position = after;
    lastMove = move;
    if (after.outcome !== null) return;
    const [analysis] = await Promise.all([
      engine.analyze(after, REFUTATION_PLAYOUTS),
      wait(REPLY_MS),
    ]);
    // You may have tried again or moved on meanwhile.
    if (position !== after || analysis?.bestMove == null) return;
    position = play(after, analysis.bestMove);
    lastMove = refutation = analysis.bestMove;
  }

  function tryAgain() {
    if (!retry) return;
    ({ position, lastMove } = retry);
    status = 'solving';
  }

  function showSolution() {
    if (!puzzle) return;
    report();
    resetBoard(puzzle);
    status = 'shown';
    line.forEach((move, i) => setTimeout(() => advance(move), (i + 1) * REPLY_MS));
  }

  /** The next puzzle at your level. Skipping one you've started counts as giving up. */
  async function next() {
    if (played.length > 0) report();
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
      {lastMove}
      disabled={position.turn !== solver || finished || status === 'wrong'}
      {onmove}
    />

    <div class="panel">
      <section class="card">
        <h2>{puzzle.daily ? 'Daily puzzle' : `Puzzle #${puzzle.id}`}</h2>
        <p class="task">
          <span class="side {solver}">{solver.toUpperCase()}</span> to play and win
          {MOVES[puzzle.winIn]}
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
            Solved! {puzzle.line.filter((m, i) => i % 2 === 0).join(', then ')} wins.
          </p>
        {:else if status === 'shown'}
          <p role="status">The solution: {puzzle.line.join(' ')}</p>
        {:else if step > 0}
          <p class="right" role="status">Good move! Keep going.</p>
        {:else if puzzle.winIn > 1}
          <p class="muted">Your opponent will reply with their best defense.</p>
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
