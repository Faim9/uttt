/**
 * Monte Carlo Tree Search (see PILLARS.md, Pillar 4): UCT with an MCTS-solver, so lines that are proven
 * wins or losses are known exactly rather than estimated. The search plays on a compact board that it
 * changes in place, so its inner loop allocates nothing. Playouts are random, except that they take a
 * game-winning move when there is one. A `Search` can be run in chunks, so a Web Worker can stream
 * analysis updates.
 */

import { FULL, HAS_LINE, type Position } from './rules.ts';

export interface Analysis {
  bestMove: number | null;
  /** X's chance of winning, 0–1, with draws counted as half. */
  winChance: number;
  /** Principal variation: the most-visited line, starting with `bestMove`. */
  pv: number[];
  playouts: number;
}

/** Tuned in engine-vs-engine matches: 0.6 beat √2 by over 100 Elo at both 50 and 300 ms per move. */
const EXPLORATION = 0.6;
/** Deeper PV moves with fewer visits than this are noise, not a line worth showing. */
const PV_MIN_VISITS = 10;
/** Past this many nodes (about 100 MB) the tree stops growing; playouts still refine it. */
const MAX_NODES = 500_000;

const X = 0;
// Outcomes in the inner loop.
const NONE = 0;
const X_WINS = 1;
const O_WINS = 2;
const DRAW = 3;

/** For a 9-bit mask of a player's cells (or boards), the cells (or boards) that would complete a line. */
const COMPLETING = Array.from({ length: 512 }, (_, mask) => {
  let completing = 0;
  for (let i = 0; i < 9; i++) {
    if (!(mask & (1 << i)) && HAS_LINE[mask | (1 << i)]) completing |= 1 << i;
  }
  return completing;
});
const BIT_COUNT = Array.from({ length: 512 }, (_, mask) => {
  let count = 0;
  for (let bits = mask; bits; bits &= bits - 1) count++;
  return count;
});
const lowestBit = (mask: number) => 31 - Math.clz32(mask & -mask);

/** A position as plain numbers, changed in place: the search plays millions of moves on it. */
class State {
  /** Cell masks per local board: `cells[0]` for X, `cells[1]` for O. */
  readonly cells = [new Uint16Array(9), new Uint16Array(9)];
  /** Per player, a 9-bit mask of the local boards they've won. */
  readonly won = [0, 0];
  /** Local boards that are won or full. */
  decided = 0;
  /** 0 for X, 1 for O. */
  turn = X;
  /** The board the player to move must play in, or -1 for any. */
  forced = -1;
  outcome = NONE;

  static from(position: Position): State {
    const state = new State();
    state.cells[0].set(position.x);
    state.cells[1].set(position.o);
    position.boards.forEach((owner, board) => {
      if (owner === 'x') state.won[0] |= 1 << board;
      if (owner === 'o') state.won[1] |= 1 << board;
      if (owner !== null) state.decided |= 1 << board;
    });
    state.turn = position.turn === 'x' ? X : 1;
    state.forced = position.forced ?? -1;
    const outcomes = { x: X_WINS, o: O_WINS, draw: DRAW };
    state.outcome = position.outcome === null ? NONE : outcomes[position.outcome];
    return state;
  }

  copy(from: State): void {
    this.cells[0].set(from.cells[0]);
    this.cells[1].set(from.cells[1]);
    this.won[0] = from.won[0];
    this.won[1] = from.won[1];
    this.decided = from.decided;
    this.turn = from.turn;
    this.forced = from.forced;
    this.outcome = from.outcome;
  }

  play(move: number): void {
    const board = (move / 9) | 0;
    const cell = move - board * 9;
    const mine = this.cells[this.turn];
    mine[board] |= 1 << cell;
    if (HAS_LINE[mine[board]]) {
      this.won[this.turn] |= 1 << board;
      this.decided |= 1 << board;
      if (HAS_LINE[this.won[this.turn]]) this.outcome = this.turn === X ? X_WINS : O_WINS;
    } else if ((mine[board] | this.cells[this.turn ^ 1][board]) === FULL) {
      this.decided |= 1 << board;
    }
    if (this.outcome === NONE && this.decided === FULL) this.outcome = DRAW;
    this.forced = this.decided & (1 << cell) ? -1 : cell;
    this.turn ^= 1;
  }

  /** Score of the outcome for `player`: 1 for a win, ½ for a draw. */
  scoreFor(player: number): number {
    if (this.outcome === DRAW) return 0.5;
    return (this.outcome === X_WINS) === (player === X) ? 1 : 0;
  }

  private empty(board: number): number {
    return FULL & ~(this.cells[0][board] | this.cells[1][board]);
  }

  /** The local boards the player to move may play in, as a 9-bit mask. */
  private open(): number {
    return this.forced >= 0 ? 1 << this.forced : FULL & ~this.decided;
  }

  legalMoves(): number[] {
    const moves = [];
    for (let boards = this.open(); boards; boards &= boards - 1) {
      const board = lowestBit(boards);
      for (let cells = this.empty(board); cells; cells &= cells - 1) {
        moves.push(board * 9 + lowestBit(cells));
      }
    }
    return moves;
  }

  randomMove(random: () => number): number {
    let total = 0;
    for (let boards = this.open(); boards; boards &= boards - 1) {
      total += BIT_COUNT[this.empty(lowestBit(boards))];
    }
    let index = Math.floor(random() * total);
    for (let boards = this.open(); ; boards &= boards - 1) {
      const board = lowestBit(boards);
      let cells = this.empty(board);
      if (index < BIT_COUNT[cells]) {
        for (; index > 0; index--) cells &= cells - 1;
        return board * 9 + lowestBit(cells);
      }
      index -= BIT_COUNT[cells];
    }
  }

  /** A move that wins the game on the spot, or -1 if there is none. */
  winningMove(): number {
    const boards = this.open() & COMPLETING[this.won[this.turn]];
    for (let left = boards; left; left &= left - 1) {
      const board = lowestBit(left);
      const cells = COMPLETING[this.cells[this.turn][board]] & this.empty(board);
      if (cells) return board * 9 + lowestBit(cells);
    }
    return -1;
  }
}

interface Node {
  /** The move that led here; -1 at the root. */
  readonly move: number;
  readonly parent: Node | null;
  readonly children: Node[];
  /** Legal moves not yet expanded into children; listed when the node is first expanded. */
  untried: number[] | null;
  visits: number;
  /** Total score for the player who made `move`: 1 per win, ½ per draw. */
  score: number;
  /** The exact result for the player who made `move`, once the solver has proven it. */
  proven: number | null;
}

const createNode = (move: number, parent: Node | null): Node => ({
  move,
  parent,
  children: [],
  untried: null,
  visits: 0,
  score: 0,
  proven: null,
});

/** A child's value for the player choosing it: exact if proven, else its average score. */
const valueOf = (child: Node) => child.proven ?? child.score / child.visits;

/** The move to play: a proven win, else the most visited move that isn't a proven loss. */
function bestChild(node: Node): Node {
  const rank = (child: Node) =>
    child.proven === 1 ? Infinity : child.proven === 0 ? -1 / child.visits : child.visits;
  return node.children.reduce((best, child) => (rank(child) > rank(best) ? child : best));
}

function selectChild(node: Node): Node {
  const logVisits = Math.log(node.visits);
  const uct = (child: Node) => valueOf(child) + EXPLORATION * Math.sqrt(logVisits / child.visits);
  return node.children.reduce((best, child) => (uct(child) > uct(best) ? child : best));
}

/**
 * The node's exact result for the player who moved into it, if its children decide it: any child that
 * wins for the player to move makes it a loss; when every move is proven, the best of them decides.
 */
function solve(node: Node): number | null {
  if (node.children.some((child) => child.proven === 1)) return 0;
  if (node.untried === null || node.untried.length > 0) return null;
  let best = 0;
  for (const child of node.children) {
    if (child.proven === null) return null;
    best = Math.max(best, child.proven);
  }
  return 1 - best;
}

export class Search {
  private readonly position: Position;
  private readonly start: State;
  private readonly state = new State();
  private readonly root: Node = createNode(-1, null);
  private readonly random: () => number;
  private nodes = 1;

  constructor(position: Position, random: () => number = Math.random) {
    this.position = position;
    this.start = State.from(position);
    this.random = random;
    if (this.start.outcome !== NONE) this.root.proven = this.start.scoreFor(this.start.turn ^ 1);
  }

  run(playouts: number): void {
    for (let i = 0; i < playouts; i++) this.iterate();
  }

  get analysis(): Analysis {
    const { root, position } = this;
    if (position.outcome !== null) {
      const winChance = position.outcome === 'x' ? 1 : position.outcome === 'draw' ? 0.5 : 0;
      return { bestMove: null, winChance, pv: [], playouts: root.visits };
    }
    const pv = [];
    for (let node = root; node.children.length > 0;) {
      node = bestChild(node);
      if (pv.length > 0 && node.visits < PV_MIN_VISITS && node.proven === null) break;
      pv.push(node.move);
    }
    let winChance = 0.5;
    if (root.children.length > 0) {
      const moverScore = valueOf(bestChild(root));
      winChance = position.turn === 'x' ? moverScore : 1 - moverScore;
    }
    return { bestMove: pv[0] ?? null, winChance, pv, playouts: root.visits };
  }

  private iterate(): void {
    const { state } = this;
    state.copy(this.start);
    let node = this.root;
    while (node.proven === null) {
      node.untried ??= state.legalMoves();
      if (node.untried.length > 0 && this.nodes < MAX_NODES) {
        node = this.expand(node);
        break;
      }
      if (node.children.length === 0) break;
      node = selectChild(node);
      state.play(node.move);
    }

    // Scores alternate up the tree: what's good for one player is bad for the other.
    let score = node.proven ?? this.playout();
    for (let n: Node | null = node; n !== null; n = n.parent) {
      n.visits++;
      n.score += score;
      score = 1 - score;
    }
    for (let n = node.parent; n !== null && n.proven === null; n = n.parent) {
      n.proven = solve(n);
      if (n.proven === null) break;
    }
  }

  /** Adds a random untried move as a child, plays it, and returns the child. */
  private expand(node: Node): Node {
    const untried = node.untried as number[];
    const index = Math.floor(this.random() * untried.length);
    const move = untried[index];
    untried[index] = untried[untried.length - 1];
    untried.pop();
    const child = createNode(move, node);
    node.children.push(child);
    this.nodes++;
    this.state.play(move);
    if (this.state.outcome !== NONE) child.proven = this.state.scoreFor(this.state.turn ^ 1);
    return child;
  }

  /** Plays the game out from `state`; returns the score for the player who made the last move. */
  private playout(): number {
    const { state } = this;
    const mover = state.turn ^ 1;
    while (state.outcome === NONE) {
      const win = state.winningMove();
      state.play(win >= 0 ? win : state.randomMove(this.random));
    }
    return state.scoreFor(mover);
  }
}

export function bestMove(position: Position, playouts: number, random?: () => number): number {
  const search = new Search(position, random);
  search.run(playouts);
  const { bestMove } = search.analysis;
  if (bestMove === null) throw new Error('No legal moves: the game is over');
  return bestMove;
}
