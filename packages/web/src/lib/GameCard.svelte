<script lang="ts">
  import { replay, type GameState, type Player } from '@uttt/core';
  import type { Snippet } from 'svelte';
  import Board from './Board.svelte';
  import { playerName } from './game.ts';
  import { t } from './i18n.svelte.ts';
  import PlayerBar from './PlayerBar.svelte';

  /** A game as a small card: the players and their clocks around the board, which opens the game. */
  interface Props {
    game: GameState;
    /** Clocks count down from when the game's state arrived. */
    now: number;
    receivedAt: number;
    children?: Snippet;
  }

  let { game, now, receivedAt, children }: Props = $props();

  function clock(side: Player): number {
    const elapsed = game.running === side ? now - receivedAt : 0;
    return Math.max(0, game.clocks[side] - elapsed);
  }

  const names = $derived(`${playerName(game.players.x)} – ${playerName(game.players.o)}`);
</script>

<article class="card game">
  {@render children?.()}
  <PlayerBar side="o" player={game.players.o} clock={clock('o')} running={game.running === 'o'} />
  <div class="board">
    <Board
      position={replay(game.moves)}
      lastMove={game.moves.at(-1) ?? null}
      over={game.termination !== null}
      disabled
      silent
    />
    <a class="cover" href="/game/{game.id}" aria-label={t('watch.game', { names })}></a>
  </div>
  <PlayerBar side="x" player={game.players.x} clock={clock('x')} running={game.running === 'x'} />
</article>

<style>
  .game {
    display: grid;
    gap: 0.5rem;
    align-content: start;
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
</style>
