<script lang="ts">
  import { other, replay, type Player } from '@uttt/core';
  import Board from '#lib/Board.svelte';
  import { Engine } from '#lib/engine.ts';
  import { analysisLink } from '#lib/game.ts';
  import { t } from '#lib/i18n.svelte.ts';
  import { onDestroy } from 'svelte';

  /** Engine playouts per move at each level. */
  const LEVELS = [50, 200, 1000, 5000, 30_000, 200_000];

  let level = $state(3);
  let side = $state<Player | 'random'>('x');
  let player = $state<Player | null>(null);
  let moves = $state.raw<number[]>([]);

  const position = $derived(replay(moves));
  const engineTurn = $derived(player !== null && position.turn !== player);
  const thinking = $derived(engineTurn && position.outcome === null);

  const engine = new Engine();
  onDestroy(() => engine.destroy());

  $effect(() => {
    if (!thinking) return;
    engine.analyze(position, LEVELS[level - 1]).then((analysis) => {
      if (analysis?.bestMove != null) moves = [...moves, analysis.bestMove];
    });
    return () => engine.stop();
  });

  function start(): void {
    player = side === 'random' ? (Math.random() < 0.5 ? 'x' : 'o') : side;
    moves = [];
  }

  function rematch(): void {
    if (player) player = other(player);
    moves = [];
  }

  /** Takes back the player's last move (and the engine's reply to it). */
  function undo(): void {
    let length = moves.length - 1;
    if ((length % 2 === 0 ? 'x' : 'o') !== player) length--;
    moves = moves.slice(0, Math.max(length, 0));
  }

  function result(): string {
    if (position.outcome === 'draw') return t('computer.draw');
    return t(position.outcome === player ? 'computer.youWon' : 'computer.itWon');
  }
</script>

{#if player === null}
  <section class="card setup">
    <h1>{t('learn.playComputer')}</h1>

    <h2>{t('computer.strength')}</h2>
    <div class="options">
      {#each LEVELS as playouts, i (i)}
        <button
          class="button"
          class:primary={level === i + 1}
          title={t('computer.playouts', { n: playouts })}
          onclick={() => (level = i + 1)}
        >
          {i + 1}
        </button>
      {/each}
    </div>

    <h2>{t('computer.playAs')}</h2>
    <div class="options">
      {#each [['x', 'computer.x'], ['o', 'computer.o'], ['random', 'challenge.random']] as const as [value, label] (value)}
        <button class="button" class:primary={side === value} onclick={() => (side = value)}>
          {t(label)}
        </button>
      {/each}
    </div>

    <button class="button primary start" onclick={start}>{t('computer.start')}</button>
  </section>
{:else}
  <div class="board-layout">
    <Board
      {position}
      lastMove={moves.at(-1) ?? null}
      disabled={engineTurn}
      onmove={(move) => (moves = [...moves, move])}
    />

    <div class="panel">
      <section class="card">
        <h2>{t('computer.header', { level, side: player.toUpperCase() })}</h2>
        <p class="status" aria-live="polite">
          {#if position.outcome}
            {result()}
          {:else if thinking}
            {t('computer.thinking')}
          {:else}
            {t(position.forced === null ? 'computer.yourMoveFree' : 'computer.yourMove')}
          {/if}
        </p>
        <div class="options">
          <button class="button" disabled={moves.length < (player === 'x' ? 1 : 2)} onclick={undo}>
            {t('computer.takeBack')}
          </button>
          {#if position.outcome}
            <a class="button primary" href={analysisLink(moves, { review: true })}
              >{t('game.review')}</a
            >
          {:else}
            <a class="button" href={analysisLink(moves)}>{t('puzzle.analyze')}</a>
          {/if}
          <button class="button" onclick={() => (player = null)}>{t('game.newGame')}</button>
          {#if position.outcome}
            <button class="button" onclick={rematch}>{t('computer.rematch')}</button>
          {/if}
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
  .setup {
    max-width: 28rem;
    margin: 0 auto;
  }

  .setup h1 {
    margin-top: 0;
  }

  .setup h2 {
    margin-top: 1.25rem;
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .start {
    width: 100%;
    margin-top: 1.5rem;
  }

  .status {
    font-weight: 600;
  }
</style>
