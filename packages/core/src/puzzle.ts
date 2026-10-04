/**
 * Puzzles: positions where the side to move can force a game win in a few of their moves, and exactly one
 * move does it at every step against the best defense. Wins are checked exhaustively, never estimated, so a
 * puzzle never rejects a move that wins as fast.
 */

import { formatMove, formatPosition, parseMove, parsePosition } from './notation.ts';
import { legalMoves, play, type Position } from './rules.ts';

export interface Puzzle {
  /** The start, as a UTN position string; the side to move is the solver. */
  position: string;
  /** The solution in UTN: the solver's moves, with the opponent's best defense in between. */
  line: string[];
  /** How many moves the solver needs to win. */
  winIn: number;
}

const MAX_WIN_IN = 4;
/**
 * The exhaustive check grows exponentially with depth and with open positions. Past this many positions, a
 * candidate is skipped: puzzles are only ever accepted after a complete check.
 */
const NODE_BUDGET = 300_000;

class TooDeep extends Error {}

/** Counts positions searched, giving up past the budget. */
class Budget {
  private left: number;

  constructor(nodes: number) {
    this.left = nodes;
  }

  spend(): void {
    if (--this.left < 0) throw new TooDeep();
  }
}

/** Whether `move` lets the side to move win within `n` of their own moves, against any defense. */
export function forcesWin(
  position: Position,
  move: number,
  n: number,
  budget = new Budget(Infinity),
): boolean {
  budget.spend();
  const after = play(position, move);
  if (after.outcome !== null) return after.outcome === position.turn;
  if (n === 1) return false;
  return legalMoves(after).every((reply) => {
    const next = play(after, reply);
    if (next.outcome !== null) return next.outcome === position.turn;
    return legalMoves(next).some((again) => forcesWin(next, again, n - 1, budget));
  });
}

/** The moves that force a win in the fewest moves (up to `most`), and how many moves that takes. */
function fastestWins(position: Position, most: number, budget: Budget) {
  for (let n = 1; n <= most; n++) {
    const moves = legalMoves(position).filter((move) => forcesWin(position, move, n, budget));
    if (moves.length > 0) return { moves, winIn: n };
  }
  return null;
}

/**
 * The solution from `position` if the fastest win takes exactly `winIn` moves and is unique: its first
 * move, then a defense that keeps the rest of the win just as long and just as unique, and so on.
 */
function solution(position: Position, winIn: number, budget: Budget): number[] | null {
  const wins = fastestWins(position, winIn, budget);
  if (wins?.winIn !== winIn || wins.moves.length !== 1) return null;
  const [move] = wins.moves;
  const after = play(position, move);
  if (after.outcome !== null) return [move];
  for (const reply of legalMoves(after)) {
    const next = play(after, reply);
    if (next.outcome !== null) continue;
    const rest = solution(next, winIn - 1, budget);
    if (rest) return [move, reply, ...rest];
  }
  return null;
}

/** The puzzle starting at `position`, or null if it has no unique forced win within reach. */
export function puzzleAt(position: Position, nodes = NODE_BUDGET): Puzzle | null {
  const budget = new Budget(nodes);
  try {
    const fastest = fastestWins(position, MAX_WIN_IN, budget);
    const line = fastest && solution(position, fastest.winIn, budget);
    if (!fastest || !line) return null;
    return { position: formatPosition(position), line: line.map(formatMove), winIn: fastest.winIn };
  } catch (error) {
    if (error instanceof TooDeep) return null;
    throw error;
  }
}

/** Plays a puzzle's line from its start, for checking and for showing it. */
export function puzzleStart(puzzle: Puzzle): { position: Position; line: number[] } {
  return { position: parsePosition(puzzle.position), line: puzzle.line.map(parseMove) };
}
