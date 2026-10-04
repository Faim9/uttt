import { gameAccuracy, reviewMove, type Analysis, type MoveReview, type Player } from '@uttt/core';
import { SvelteMap } from 'svelte/reactivity';
import { Engine } from './engine.ts';
import type { TreeNode } from './tree.svelte.ts';

/** Per position. At this budget evals vary ~1% between runs (2.5% at worst), far below the 10% inaccuracy threshold. */
const PLAYOUTS = 40_000;
const WORKERS = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 2) - 1));

/** Engine review of a line of play: evaluates every position in parallel workers, in order. */
export class GameReview {
  /** The reviewed positions: the start, then each move's resulting position. */
  readonly nodes: TreeNode[];
  readonly evals = new SvelteMap<TreeNode, Analysis>();
  private engines: Engine[] = [];

  constructor(start: TreeNode) {
    this.nodes = [start, ...start.mainLine];
    this.run();
  }

  get done(): boolean {
    return this.evals.size === this.nodes.length;
  }

  /** The review of the move that led to `node`, once both positions around it are evaluated. */
  of(node: TreeNode): MoveReview | null {
    const { parent, move } = node;
    if (!parent || move === null) return null;
    const before = this.evals.get(parent);
    const after = this.evals.get(node);
    return before && after ? reviewMove(move, parent.position.turn, before, after) : null;
  }

  accuracy(player: Player): number | null {
    return gameAccuracy(this.moments(player).map(({ review }) => review));
  }

  /** Reviewed moves by `player`, paired with the node each move led to. */
  moments(player: Player): { node: TreeNode; review: MoveReview }[] {
    return this.nodes.flatMap((node) => {
      const review = this.of(node);
      return review && node.parent?.position.turn === player ? [{ node, review }] : [];
    });
  }

  cancel(): void {
    for (const engine of this.engines) engine.destroy();
    this.engines = [];
  }

  private async run(): Promise<void> {
    let next = 0;
    this.engines = Array.from({ length: Math.min(WORKERS, this.nodes.length) }, () => new Engine());
    await Promise.all(
      this.engines.map(async (engine) => {
        while (next < this.nodes.length) {
          const node = this.nodes[next++];
          const analysis = await engine.analyze(node.position, PLAYOUTS);
          if (!analysis) return;
          this.evals.set(node, analysis);
        }
      }),
    );
    this.cancel();
  }
}
