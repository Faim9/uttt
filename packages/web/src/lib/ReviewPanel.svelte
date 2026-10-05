<script lang="ts">
  import { formatMove, type Judgement, type Player } from '@uttt/core';
  import { JUDGEMENT_SYMBOLS, percent } from './game.ts';
  import { around, t, tn } from './i18n.svelte.ts';
  import Piece from './Piece.svelte';
  import type { GameReview } from './review.ts';
  import type { GameTree } from './tree.svelte.ts';

  let { review, tree }: { review: GameReview; tree: GameTree } = $props();

  const COUNTED: Judgement[] = ['inaccuracy', 'mistake', 'blunder'];

  const verdict = $derived.by(() => {
    const node = tree.current;
    const result = review.of(node);
    const before = node.parent && review.evals.get(node.parent);
    const after = review.evals.get(node);
    if (!result || !node.parent || !before || !after || node.move === null) return null;
    const mover = node.parent.position.turn;
    const chance = (winChance: number) => (mover === 'x' ? winChance : 1 - winChance);
    return {
      ...result,
      mover,
      move: formatMove(node.move),
      from: chance(before.winChance),
      to: chance(after.winChance),
    };
  });

  /** Jumps to `player`'s next move with `judgement` after the current one, wrapping around. */
  function next(player: Player, judgement: Judgement) {
    const moments = review.moments(player).filter(({ review }) => review.judgement === judgement);
    const after = moments.find(({ node }) => node.ply > tree.current.ply) ?? moments[0];
    if (after) tree.goTo(after.node);
  }

  function showBest() {
    const { parent } = tree.current;
    const best = verdict?.bestMove;
    if (!parent || best == null) return;
    tree.goTo(parent);
    tree.play(best);
  }
</script>

<section class="card">
  <h2>{t('review.title')}</h2>

  {#if !review.done}
    <p class="muted">
      {t('review.analyzing', { done: review.evals.size, total: review.nodes.length })}
    </p>
    <progress max={review.nodes.length} value={review.evals.size}></progress>
  {/if}

  <div class="players">
    {#each ['x', 'o'] as const as player (player)}
      {@const accuracy = review.accuracy(player)}
      {@const moments = review.moments(player)}
      <div class="player">
        <span class="piece"><Piece {player} /></span>
        <strong>{accuracy === null ? '–' : `${Math.round(accuracy)}%`}</strong>
        <span class="muted">{t('review.accuracy')}</span>
        <div class="counts">
          {#each COUNTED as judgement (judgement)}
            {@const count = moments.filter(({ review }) => review.judgement === judgement).length}
            <button
              class="count {judgement}"
              disabled={count === 0}
              title={t('review.next', {
                side: player.toUpperCase(),
                judgement: t(`judgement.${judgement}`),
              })}
              onclick={() => next(player, judgement)}
            >
              {tn(`judgements.${judgement}`, count)}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#if verdict}
    {@const [before, after] = around(`review.is.${verdict.judgement}`, 'move')}
    <div class="verdict {verdict.judgement}" aria-live="polite">
      <p>
        {before}<strong>{verdict.move}{JUDGEMENT_SYMBOLS[verdict.judgement]}</strong>{after}
        {#if verdict.judgement !== 'best'}
          {t('review.chance', {
            side: verdict.mover.toUpperCase(),
            from: percent(verdict.from),
            to: percent(verdict.to),
          })}
        {/if}
      </p>
      {#if verdict.judgement !== 'best' && verdict.bestMove !== null}
        {@const [bestBefore, bestAfter] = around('review.bestWas', 'move')}
        <p>
          {bestBefore}<strong>{formatMove(verdict.bestMove)}</strong>{bestAfter}
          <button class="button" onclick={showBest}>{t('review.showBest')}</button>
        </p>
      {/if}
    </div>
  {:else if review.done}
    <p class="muted">{t('review.pick')}</p>
  {/if}
</section>

<style>
  progress {
    width: 100%;
  }

  .players {
    display: grid;
    gap: 0.75rem;
  }

  .player {
    display: grid;
    grid-template-columns: 1.25rem auto 1fr;
    gap: 0.25rem 0.5rem;
    align-items: center;
  }

  .piece {
    width: 1.25rem;
    height: 1.25rem;
  }

  .player strong {
    font-size: 1.3rem;
  }

  .counts {
    grid-column: 2 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }

  .count {
    padding: 0;
    border: 0;
    background: none;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .count:disabled {
    color: var(--muted);
    cursor: default;
  }

  .count:enabled:hover {
    text-decoration: underline;
  }

  .verdict {
    margin-top: 1rem;
    padding: 0.5rem 0.75rem;
    border-left: 4px solid var(--hint);
    border-radius: 4px;
    background: var(--bg);
  }

  .verdict p {
    margin: 0.25rem 0;
  }

  .inaccuracy {
    color: var(--inaccuracy);
    border-color: var(--inaccuracy);
  }

  .mistake {
    color: var(--mistake);
    border-color: var(--mistake);
  }

  .blunder {
    color: var(--blunder);
    border-color: var(--blunder);
  }

  .verdict.inaccuracy,
  .verdict.mistake,
  .verdict.blunder {
    color: inherit;
  }
</style>
