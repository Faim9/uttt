<script lang="ts">
  import { formatMove, type Judgement } from '@uttt/core';
  import { formatClock, JUDGEMENT_SYMBOLS } from './game.ts';
  import { t } from './i18n.svelte.ts';
  import type { GameTree, TreeNode } from './tree.svelte.ts';

  interface Props {
    tree: GameTree;
    /** The review's verdict on the move leading to a node, if any. */
    judge?: (node: TreeNode) => Judgement | null;
    /** The mover's time left after the move leading to a node, when it's from a played game. */
    clock?: (node: TreeNode) => number | null;
  }

  let { tree, judge = () => null, clock = () => null }: Props = $props();

  /** Move numbers count X+O pairs; an O move only gets one ("3…") where the line is interrupted. */
  function moveNumber(node: TreeNode, interrupted: boolean): string {
    const ply = node.ply - 1;
    const number = Math.floor(ply / 2) + 1;
    if (ply % 2 === 0) return `${number}.`;
    return interrupted ? `${number}…` : '';
  }

  /** Whether variations were printed right after `node`, i.e. it has siblings. */
  const hasVariations = (node: TreeNode | null) => (node?.parent?.children.length ?? 0) > 1;
</script>

{#snippet move(node: TreeNode, interrupted: boolean)}
  {@const judgement = judge(node)}
  {@const left = clock(node)}
  <button
    class="move {judgement ?? ''}"
    class:current={node === tree.current}
    onclick={() => tree.goTo(node)}
  >
    <span class="number">{moveNumber(node, interrupted)}</span>{node.move === null
      ? ''
      : formatMove(node.move)}{judgement ? JUDGEMENT_SYMBOLS[judgement] : ''}{#if left !== null}
      <span class="clock">{formatClock(left)}</span>{/if}
  </button>
{/snippet}

{#snippet line(from: TreeNode, interruptedStart: boolean)}
  {#each from.mainLine as node, i (node)}
    {@render move(node, i === 0 ? interruptedStart : hasVariations(node.parent))}
    {#each node.parent?.children.slice(1) ?? [] as variation (variation)}
      <span class="variation">
        ({@render move(variation, true)}{@render line(variation, false)})
      </span>
    {/each}
  {/each}
{/snippet}

<div class="moves">
  {#if tree.root.children.length === 0}
    <span class="muted">{t('moves.none')}</span>
  {:else}
    {@render line(tree.root, true)}
  {/if}
</div>

<style>
  .moves {
    max-height: 16rem;
    overflow-y: auto;
    line-height: 1.9;
  }

  .move {
    padding: 0.05rem 0.3rem;
    border: 0;
    border-radius: 4px;
    background: none;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .move:hover {
    background: var(--border);
  }

  .move.current {
    background: var(--accent);
    color: white;
  }

  .number {
    margin-right: 0.25rem;
    color: var(--muted);
  }

  .current .number,
  .current .clock {
    color: inherit;
  }

  .clock {
    margin-left: 0.2rem;
    color: var(--muted);
    font-size: 0.8em;
    font-weight: 400;
  }

  .variation {
    color: var(--muted);
  }

  .inaccuracy {
    color: var(--inaccuracy);
  }

  .mistake {
    color: var(--mistake);
  }

  .blunder {
    color: var(--blunder);
  }

  .inaccuracy,
  .mistake,
  .blunder {
    font-weight: 700;
  }
</style>
