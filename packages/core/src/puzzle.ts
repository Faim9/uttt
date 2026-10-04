/**
 * Puzzles: positions where the side to move can force a game win in one or two of their moves, and exactly
 * one move does it, at every step. Wins are checked exhaustively, never estimated, so a puzzle never
 * rejects a move that also wins.
 */

import { formatMove, formatPosition, parseMove, parsePosition } from './notation.ts';
import { legalMoves, play, type Position } from './rules.ts';

export interface Puzzle {
  /** The start, as a UTN position string; the side to move is the solver. */
  position: string;
  /** The solution in UTN: the solver's moves, with the opponent's best defense in between. */
  line: string[];
  /** How many moves the solver needs to win: 1 or 2. */
  winIn: number;
}

const MAX_WIN_IN = 2;

/** Whether `move` lets the side to move win within `n` of their own moves, against any defense. */
export function forcesWin(position: Position, move: number, n: number): boolean {
  const after = play(position, move);
  if (after.outcome !== null) return after.outcome === position.turn;
  if (n === 1) return false;
  return legalMoves(after).every((reply) => {
    const next = play(after, reply);
    if (next.outcome !== null) return next.outcome === position.turn;
    return legalMoves(next).some((again) => forcesWin(next, again, n - 1));
  });
}

/** The moves that force a win in the fewest moves, and how many moves that takes. */
function fastestWins(position: Position): { moves: number[]; winIn: number } | null {
  for (let n = 1; n <= MAX_WIN_IN; n++) {
    const moves = legalMoves(position).filter((move) => forcesWin(position, move, n));
    if (moves.length > 0) return { moves, winIn: n };
  }
  return null;
}

/** The puzzle starting at `position`, or null if it has no forced win or more than one winning move. */
export function puzzleAt(position: Position): Puzzle | null {
  const start = fastestWins(position);
  if (start?.moves.length !== 1) return null;
  const [move] = start.moves;
  const line = [move];
  let after = play(position, move);
  if (start.winIn === 2 && after.outcome === null) {
    // The defense that keeps the second winning move unique, as long as it takes a whole move to lose.
    const reply = legalMoves(after).find((r) => {
      const next = play(after, r);
      return next.outcome === null && fastestWins(next)?.moves.length === 1;
    });
    if (reply === undefined) return null;
    after = play(after, reply);
    const finish = fastestWins(after);
    if (!finish || finish.winIn !== 1) return null;
    line.push(reply, finish.moves[0]);
  }
  return { position: formatPosition(position), line: line.map(formatMove), winIn: start.winIn };
}

/** Plays a puzzle's line from its start, for checking and for showing it. */
export function puzzleStart(puzzle: Puzzle): { position: Position; line: number[] } {
  return { position: parsePosition(puzzle.position), line: puzzle.line.map(parseMove) };
}
