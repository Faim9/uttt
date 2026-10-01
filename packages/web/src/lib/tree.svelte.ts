import { initialPosition, moveCount, play, type Position } from '@uttt/core';

/** A position in the analysis tree. `children[0]` continues the main line; the rest are variations. */
export class TreeNode {
  readonly position: Position;
  readonly move: number | null;
  readonly parent: TreeNode | null;
  readonly ply: number;
  children: TreeNode[] = $state.raw([]);

  constructor(position: Position, move: number | null, parent: TreeNode | null) {
    this.position = position;
    this.move = move;
    this.parent = parent;
    this.ply = parent ? parent.ply + 1 : moveCount(position);
  }

  /** The line continuing from this node by always following the first child. */
  get mainLine(): TreeNode[] {
    const line = [];
    for (let node = this.children[0]; node; node = node.children[0]) line.push(node);
    return line;
  }
}

export class GameTree {
  readonly root: TreeNode;
  current: TreeNode;

  constructor(start: Position = initialPosition, moves: number[] = []) {
    this.root = new TreeNode(start, null, null);
    this.current = $state.raw(this.root);
    for (const move of moves) this.play(move);
  }

  /** Moves from the root to the current node. */
  get moves(): number[] {
    const moves = [];
    for (let node: TreeNode | null = this.current; node; node = node.parent) {
      if (node.move !== null) moves.unshift(node.move);
    }
    return moves;
  }

  play(move: number): void {
    let child = this.current.children.find((node) => node.move === move);
    if (!child) {
      child = new TreeNode(play(this.current.position, move), move, this.current);
      this.current.children = [...this.current.children, child];
    }
    this.current = child;
  }

  back(): void {
    this.current = this.current.parent ?? this.current;
  }

  forward(): void {
    this.current = this.current.children[0] ?? this.current;
  }

  toStart(): void {
    this.current = this.root;
  }

  toEnd(): void {
    this.current = this.current.mainLine.at(-1) ?? this.current;
  }

  goTo(node: TreeNode): void {
    this.current = node;
  }

  /** Makes the variation containing `node` the main line at its branch point. */
  promote(node: TreeNode): void {
    for (let child = node; child.parent; child = child.parent) {
      const siblings = child.parent.children;
      if (siblings[0] !== child) {
        child.parent.children = [child, ...siblings.filter((sibling) => sibling !== child)];
        return;
      }
    }
  }

  /** Removes `node` and everything after it. */
  delete(node: TreeNode): void {
    const { parent } = node;
    if (!parent) return;
    for (let n: TreeNode | null = this.current; n; n = n.parent) {
      if (n === node) this.current = parent;
    }
    parent.children = parent.children.filter((child) => child !== node);
  }
}
