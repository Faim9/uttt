<script lang="ts">
  import { bestMove, replay } from '@uttt/core';
  import { onMount } from 'svelte';
  import Board from './Board.svelte';

  /**
   * A game the engine plays against itself on the home page, so visitors see how the game flows before
   * reading any rules. A weak search keeps it quick and different every time.
   */
  const PLAYOUTS = 200;
  const MOVE_MS = 1100;
  /** Ticks to rest on a finished game before starting a new one. */
  const REST_TICKS = 3;

  let moves = $state<number[]>([]);
  const position = $derived(replay(moves));

  onMount(() => {
    const next = () => (moves = [...moves, bestMove(position, PLAYOUTS)]);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < 24 && !position.outcome; i++) next();
      return;
    }
    let rest = 0;
    const timer = setInterval(() => {
      if (!position.outcome) return next();
      if (++rest < REST_TICKS) return;
      rest = 0;
      moves = [];
    }, MOVE_MS);
    return () => clearInterval(timer);
  });
</script>

<Board {position} lastMove={moves.at(-1) ?? null} disabled />
