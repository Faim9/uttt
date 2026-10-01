<script lang="ts">
  import { cellAt, formatMove, legalMoves, type Position } from '@uttt/core';
  import Piece from './Piece.svelte';

  interface Props {
    position: Position;
    lastMove?: number | null;
    /** A move to highlight, e.g. the engine's suggestion. */
    hint?: number | null;
    disabled?: boolean;
    onmove?: (move: number) => void;
  }

  let { position, lastMove = null, hint = null, disabled = false, onmove }: Props = $props();

  const NINE = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const legal = $derived(new Set(disabled ? [] : legalMoves(position)));
</script>

<div class="board">
  {#each NINE as board (board)}
    {@const outcome = position.boards[board]}
    <div
      class="local"
      class:active={NINE.some((cell) => legal.has(board * 9 + cell))}
      class:decided={outcome !== null}
    >
      {#each NINE as cell (cell)}
        {@const move = board * 9 + cell}
        {@const piece = cellAt(position, move)}
        <button
          class="cell"
          class:last={move === lastMove}
          class:hint={move === hint}
          disabled={!legal.has(move)}
          aria-label={`${formatMove(move)}${piece ? `, ${piece.toUpperCase()}` : ''}`}
          onclick={() => onmove?.(move)}
        >
          {#if piece}
            <Piece player={piece} />
          {:else if legal.has(move)}
            <span class="ghost"><Piece player={position.turn} /></span>
          {/if}
        </button>
      {/each}
      {#if outcome === 'x' || outcome === 'o'}
        <div class="winner"><Piece player={outcome} /></div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.2%;
    padding: 1.2%;
    aspect-ratio: 1;
    border-radius: var(--radius);
    background: var(--line-strong);
    user-select: none;
  }

  .local {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--line);
  }

  .cell {
    display: grid;
    padding: 14%;
    border: 0;
    background: var(--cell);
    cursor: pointer;
    aspect-ratio: 1;
  }

  .cell:disabled {
    cursor: default;
  }

  .active .cell {
    background: var(--active);
  }

  .cell.last {
    background: var(--last);
  }

  .cell.hint {
    box-shadow: inset 0 0 0 3px var(--hint);
  }

  .ghost {
    opacity: 0;
  }

  .cell:hover .ghost,
  .cell:focus-visible .ghost {
    opacity: 0.35;
  }

  .decided .cell :global(svg) {
    opacity: 0.3;
  }

  .winner {
    position: absolute;
    inset: 6%;
    pointer-events: none;
  }

  .winner :global(svg) {
    stroke-width: 8;
  }
</style>
