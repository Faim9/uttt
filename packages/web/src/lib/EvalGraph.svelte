<script lang="ts">
  import { t } from './i18n.svelte.ts';
  import type { GameReview } from './review.ts';
  import type { TreeNode } from './tree.svelte.ts';

  interface Props {
    review: GameReview;
    current: TreeNode;
    ongoto: (node: TreeNode) => void;
  }

  let { review, current, ongoto }: Props = $props();

  /** Horizontal position of each reviewed position, as a percentage. */
  const xOf = (i: number) => (i / Math.max(1, review.nodes.length - 1)) * 100;

  const points = $derived(
    review.nodes.flatMap((node, i) => {
      const analysis = review.evals.get(node);
      return analysis ? [{ x: xOf(i), y: (1 - analysis.winChance) * 100 }] : [];
    }),
  );
  const area = $derived(
    points.length < 2
      ? ''
      : `M${points[0].x},100 ${points.map((p) => `L${p.x},${p.y}`).join(' ')} L${points.at(-1)?.x},100Z`,
  );
  const markers = $derived(
    review.nodes.flatMap((node, i) => {
      const judgement = review.of(node)?.judgement;
      const analysis = review.evals.get(node);
      return analysis && (judgement === 'mistake' || judgement === 'blunder')
        ? [{ node, judgement, x: xOf(i), y: (1 - analysis.winChance) * 100 }]
        : [];
    }),
  );
  const currentIndex = $derived(review.nodes.indexOf(current));

  function onclick(event: MouseEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    const node = review.nodes[Math.round(fraction * (review.nodes.length - 1))];
    if (node) ongoto(node);
  }
</script>

<!-- Mouse shortcut only: every position is also reachable from the move list and the keyboard. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div class="graph" role="img" aria-label={t('graph.eval')} {onclick}>
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path d={area} />
    <line x1="0" y1="50" x2="100" y2="50" />
  </svg>
  {#if currentIndex >= 0}
    <div class="cursor" style:left="{xOf(currentIndex)}%"></div>
  {/if}
  {#each markers as { node, judgement, x, y } (node)}
    <span class="marker {judgement}" style:left="{x}%" style:top="{y}%"></span>
  {/each}
</div>

<style>
  .graph {
    position: relative;
    height: 90px;
    cursor: pointer;
  }

  /* Rounded and clipped here rather than on .graph, so markers at the edges stay fully visible. */
  svg {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    background: color-mix(in srgb, var(--o) 30%, var(--surface));
  }

  path {
    fill: color-mix(in srgb, var(--x) 55%, var(--surface));
  }

  line {
    stroke: var(--line-strong);
    stroke-dasharray: 2 2;
    vector-effect: non-scaling-stroke;
  }

  .cursor {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--text);
  }

  .marker {
    position: absolute;
    width: 9px;
    height: 9px;
    margin: -4.5px 0 0 -4.5px;
    border: 2px solid var(--surface);
    border-radius: 50%;
  }

  .mistake {
    background: var(--mistake);
  }

  .blunder {
    background: var(--blunder);
  }
</style>
