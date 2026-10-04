<script lang="ts">
  import type { Player } from '@uttt/core';

  let { player }: { player: Player } = $props();
</script>

<svg viewBox="0 0 100 100" class={player} aria-hidden="true">
  {#if player === 'x'}
    <path d="M24 24 L76 76 M76 24 L24 76" />
  {:else}
    <circle cx="50" cy="50" r="28" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 13;
    stroke-linecap: round;
    filter: var(--piece-glow);
    transform: rotate(var(--piece-tilt));
  }

  .x {
    color: var(--x);
  }

  .o {
    color: var(--o);
  }
</style>
