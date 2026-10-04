<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { play, puzzleStart, type Position, type Puzzle } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import { dailyPuzzle } from '#lib/game.ts';
  import { onMount } from 'svelte';

  /** The opponent's reply waits this long, so you see your move land first. */
  const REPLY_MS = 450;
  const SOLVED_KEY = 'solvedPuzzles';

  let puzzles = $state.raw<Puzzle[]>([]);
  let index = $state(0);
  let position = $state.raw<Position | null>(null);
  let step = $state(0);
  let lastMove = $state<number | null>(null);
  let status = $state<'solving' | 'wrong' | 'solved' | 'shown'>('solving');
  /** Solved puzzles, by position, remembered in this browser only. */
  let solved = $state<string[]>([]);

  const puzzle = $derived(puzzles[index] as Puzzle | undefined);
  const line = $derived(puzzle ? puzzleStart(puzzle).line : []);
  const solver = $derived(puzzle ? puzzleStart(puzzle).position.turn : 'x');
  const isDaily = $derived(puzzles.length > 0 && index === dailyPuzzle(puzzles));
  const MOVES = ['', 'in one move', 'in two moves', 'in three moves', 'in four moves'];
  const analysis = $derived(
    puzzle
      ? `/analysis?${new URLSearchParams({ position: puzzle.position, moves: puzzle.line.join(' ') })}`
      : '/analysis',
  );

  onMount(async () => {
    try {
      solved = JSON.parse(localStorage.getItem(SOLVED_KEY) ?? '[]');
    } catch {
      // Blocked or corrupt storage: start counting afresh.
    }
    puzzles = (await import('#lib/puzzles.json')).default;
  });

  // `/puzzles?n=42` opens puzzle 42; plain `/puzzles` opens today's.
  $effect(() => {
    if (puzzles.length === 0) return;
    const n = Number(page.url.searchParams.get('n'));
    const chosen = Number.isInteger(n) && n >= 1 && n <= puzzles.length ? n - 1 : null;
    index = chosen ?? dailyPuzzle(puzzles);
    restart(puzzles[index]);
  });

  function restart(from: Puzzle) {
    position = puzzleStart(from).position;
    step = 0;
    lastMove = null;
    status = 'solving';
  }

  function advance(move: number) {
    if (!position) return;
    position = play(position, move);
    lastMove = move;
    step++;
  }

  function onmove(move: number) {
    if (move !== line[step]) {
      status = 'wrong';
      return;
    }
    advance(move);
    status = 'solving';
    if (step < line.length) setTimeout(() => advance(line[step]), REPLY_MS);
    else finish('solved');
  }

  function finish(how: 'solved' | 'shown') {
    status = how;
    if (how !== 'solved' || !puzzle || solved.includes(puzzle.position)) return;
    solved = [...solved, puzzle.position];
    try {
      localStorage.setItem(SOLVED_KEY, JSON.stringify(solved));
    } catch {
      // The count just won't survive a reload.
    }
  }

  function showSolution() {
    if (!puzzle) return;
    restart(puzzle);
    status = 'shown';
    line.forEach((move, i) => setTimeout(() => advance(move), (i + 1) * REPLY_MS));
  }

  /** A random puzzle you haven't solved yet (or any, once you've solved them all). */
  function next() {
    const fresh = puzzles
      .map((p, i) => i)
      .filter((i) => i !== index && !solved.includes(puzzles[i].position));
    const pool = fresh.length > 0 ? fresh : puzzles.map((p, i) => i);
    goto(`/puzzles?n=${pool[Math.floor(Math.random() * pool.length)] + 1}`);
  }
</script>

{#if puzzle && position}
  <div class="board-layout">
    <Board
      {position}
      {lastMove}
      disabled={position.turn !== solver || status === 'solved' || status === 'shown'}
      {onmove}
    />

    <div class="panel">
      <section class="card">
        <h2>{isDaily ? 'Daily puzzle' : `Puzzle ${index + 1} of ${puzzles.length}`}</h2>
        <p class="task">
          <span class="side {solver}">{solver.toUpperCase()}</span> to play and win
          {MOVES[puzzle.winIn]}
        </p>
        {#if status === 'wrong'}
          <p class="wrong" role="alert">Not that one. Try again!</p>
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
          {#if status === 'solved' || status === 'shown'}
            <button class="button primary" onclick={next}>Next puzzle</button>
            <a class="button" href={analysis}>Analyze</a>
          {:else}
            <button class="button" onclick={showSolution}>Show solution</button>
            <button class="button" onclick={next}>Skip</button>
          {/if}
        </div>
      </section>
      <p class="muted">
        You've solved {solved.length} of {puzzles.length} puzzles. A new daily puzzle every day.
      </p>
    </div>
  </div>
{:else}
  <p class="muted">Loading puzzles…</p>
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
</style>
