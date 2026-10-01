/**
 * Monte Carlo Tree Search: UCT with uniformly random playouts (see PILLARS.md, Pillar 4).
 * A `Search` can be run in chunks, so a Web Worker can stream analysis updates.
 */

import { legalMoves, other, play, type Outcome, type Player, type Position } from './rules.ts';

export interface Analysis {
  bestMove: number | null;
  /** X's chance of winning, 0–1, with draws counted as half. */
  winChance: number;
  /** Principal variation: the most-visited line, starting with `bestMove`. */
  pv: number[];
  playouts: number;
}

interface Node {
  readonly position: Position;
  readonly move: number | null;
  readonly parent: Node | null;
  readonly children: Node[];
  readonly untried: number[];
  visits: number;
  /** Total score for the player who made `move`: 1 per win, ½ per draw. */
  score: number;
}

const EXPLORATION = Math.SQRT2;
/** Deeper PV moves with fewer visits than this are noise, not a line worth showing. */
const PV_MIN_VISITS = 10;

const scoreFor = (outcome: Outcome, player: Player) =>
  outcome === player ? 1 : outcome === 'draw' ? 0.5 : 0;

const mostVisited = (node: Node) =>
  node.children.reduce((best, child) => (child.visits > best.visits ? child : best));

function createNode(position: Position, move: number | null, parent: Node | null): Node {
  return {
    position,
    move,
    parent,
    children: [],
    untried: legalMoves(position),
    visits: 0,
    score: 0,
  };
}

function selectChild(node: Node): Node {
  const logVisits = Math.log(node.visits);
  const uct = (child: Node) =>
    child.score / child.visits + EXPLORATION * Math.sqrt(logVisits / child.visits);
  return node.children.reduce((best, child) => (uct(child) > uct(best) ? child : best));
}

export class Search {
  private readonly root: Node;
  private readonly random: () => number;

  constructor(position: Position, random: () => number = Math.random) {
    this.root = createNode(position, null, null);
    this.random = random;
  }

  run(playouts: number): void {
    for (let i = 0; i < playouts; i++) this.iterate();
  }

  get analysis(): Analysis {
    const { root } = this;
    const pv = [];
    for (let node = root; node.children.length > 0;) {
      node = mostVisited(node);
      if (node.move === null || (pv.length > 0 && node.visits < PV_MIN_VISITS)) break;
      pv.push(node.move);
    }

    let winChance = 0.5;
    if (root.position.outcome !== null) {
      winChance = scoreFor(root.position.outcome, 'x');
    } else if (root.children.length > 0) {
      const best = mostVisited(root);
      const moverScore = best.score / best.visits;
      winChance = root.position.turn === 'x' ? moverScore : 1 - moverScore;
    }
    return { bestMove: pv[0] ?? null, winChance, pv, playouts: root.visits };
  }

  private iterate(): void {
    let node = this.root;
    while (node.untried.length === 0 && node.children.length > 0) node = selectChild(node);

    if (node.untried.length > 0) {
      const [move] = node.untried.splice(this.pick(node.untried.length), 1);
      const child = createNode(play(node.position, move), move, node);
      node.children.push(child);
      node = child;
    }

    const outcome = this.playout(node.position);
    for (let n: Node | null = node; n !== null; n = n.parent) {
      n.visits++;
      n.score += scoreFor(outcome, other(n.position.turn));
    }
  }

  private playout(start: Position): Outcome {
    let position = start;
    while (position.outcome === null) {
      const moves = legalMoves(position);
      position = play(position, moves[this.pick(moves.length)]);
    }
    return position.outcome;
  }

  private pick(length: number): number {
    return Math.floor(this.random() * length);
  }
}

export function bestMove(position: Position, playouts: number, random?: () => number): number {
  const search = new Search(position, random);
  search.run(playouts);
  const { bestMove } = search.analysis;
  if (bestMove === null) throw new Error('No legal moves: the game is over');
  return bestMove;
}
