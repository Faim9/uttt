<script lang="ts">
  import { page } from '$app/state';
  import { cellAt, createPosition, parsePosition, type Player } from '@uttt/core';
  import Board from '#lib/Board.svelte';

  const NINE = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const TOOLS = { x: 'X', o: 'O', erase: 'Erase' } as const;

  /** Every cell by move index (`board * 9 + cell`). */
  let cells = $state<(Player | null)[]>(Array(81).fill(null));
  /** The board the next move must be played in, or null for a free move. */
  let forced = $state<number | null>(null);
  let tool = $state<keyof typeof TOOLS>('x');

  // `/editor?position=…` starts from that position, e.g. the analysis board's.
  try {
    const start = parsePosition(page.url.searchParams.get('position') ?? '');
    cells = Array.from({ length: 81 }, (_, move) => cellAt(start, move));
    forced = start.forced;
  } catch {
    // No position given (or a broken one): start from an empty board.
  }

  const count = (player: Player) => cells.filter((cell) => cell === player).length;
  const masks = (player: Player) =>
    NINE.map((board) =>
      NINE.reduce(
        (mask, cell) => (cells[board * 9 + cell] === player ? mask | (1 << cell) : mask),
        0,
      ),
    );
  /** X moves first, so the piece counts say whose turn it is. */
  const turn = $derived<Player>(count('x') > count('o') ? 'o' : 'x');
  const text = $derived(
    `${NINE.map((b) => NINE.map((c) => cells[b * 9 + c] ?? '.').join('')).join('/')} ${turn} ${forced === null ? '-' : forced + 1}`,
  );
  /** Why the position can't come from a game, or '' when it passes the checks. */
  const problem = $derived.by(() => {
    try {
      parsePosition(text);
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  });
  const position = $derived(createPosition(masks('x'), masks('o'), turn, forced));

  /** Places the tool's piece, or clears the cell if it's already there. */
  function onmove(move: number) {
    const piece = tool === 'erase' ? null : tool;
    cells[move] = cells[move] === piece ? null : piece;
  }

  function clear() {
    cells = Array(81).fill(null);
    forced = null;
  }
</script>

<div class="board-layout">
  <Board {position} editing={tool} silent {onmove} />

  <div class="panel">
    <section class="card">
      <h2>Board editor</h2>
      <p class="muted">
        Copying a screenshot? Place the pieces in any order, then pick the board the next move must
        be played in (the highlighted one).
      </p>
      <div class="tools" role="group" aria-label="Place">
        {#each Object.entries(TOOLS) as [value, label] (value)}
          <button
            class="button"
            aria-pressed={tool === value}
            onclick={() => (tool = value as keyof typeof TOOLS)}>{label}</button
          >
        {/each}
      </div>
      <label>
        Next move in
        <select bind:value={forced}>
          <option value={null}>any board (free move)</option>
          {#each NINE as board (board)}
            <option value={board}>board {board + 1}</option>
          {/each}
        </select>
      </label>
      {#if problem}
        <p class="problem" role="alert">{problem}</p>
      {:else}
        <p class="ok" role="status">
          {position.outcome
            ? 'The game is over.'
            : `${turn.toUpperCase()} to move, in ${forced === null ? 'any board' : `board ${forced + 1}`}.`}
        </p>
      {/if}
      <div class="actions">
        {#if problem}
          <button class="button primary" disabled>Analyze</button>
        {:else}
          <a class="button primary" href="/analysis?{new URLSearchParams({ position: text })}"
            >Analyze</a
          >
        {/if}
        <button class="button" onclick={clear}>Clear board</button>
      </div>
    </section>
  </div>
</div>

<style>
  h2 {
    margin-top: 0;
  }

  .tools,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }

  .tools .button {
    min-width: 4rem;
  }

  .tools [aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: white;
  }

  select {
    margin-left: 0.25rem;
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
  }

  .problem {
    color: var(--blunder);
    font-weight: 600;
  }

  .ok {
    color: var(--hint);
    font-weight: 600;
  }
</style>
