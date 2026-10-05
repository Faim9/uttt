<script lang="ts">
  import type { GamePlayer, Player } from '@uttt/core';
  import { formatClock, playerName, ratingText } from './game.ts';
  import Piece from './Piece.svelte';

  interface Props {
    side: Player;
    player: GamePlayer;
    /** Milliseconds left, already counted down by the caller. */
    clock: number;
    running: boolean;
  }

  let { side, player, clock, running }: Props = $props();
</script>

<div class="bar" class:running>
  <span class="piece"><Piece player={side} /></span>
  <span class="name">
    {#if player.username}
      <a href="/@{player.username}">{player.username}</a>
    {:else}
      {playerName(player)}
    {/if}
    {#if player.bot}<span class="bot-tag">BOT</span>{/if}
    <span class="muted">{ratingText(player)}</span>
    {#if player.ratingDiff !== null}
      <span class:up={player.ratingDiff > 0} class:down={player.ratingDiff < 0}>
        {player.ratingDiff > 0 ? '+' : ''}{player.ratingDiff}
      </span>
    {/if}
  </span>
  <span class="clock" class:low={clock < 10_000}>{formatClock(clock)}</span>
</div>

<style>
  .bar {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .piece {
    width: 1.25rem;
    height: 1.25rem;
  }

  .name {
    flex: 1;
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    min-width: 0;
  }

  .name a {
    color: inherit;
    font-weight: 600;
  }

  .up {
    color: var(--hint);
  }

  .down {
    color: var(--o);
  }

  .clock {
    padding: 0.15rem 0.6rem;
    border-radius: 6px;
    font-size: 1.4rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: var(--bg);
  }

  .running .clock {
    background: var(--accent);
    color: white;
  }

  .running .clock.low {
    background: var(--o);
  }
</style>
