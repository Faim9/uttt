/**
 * Post-game review: judges each move by how much it lowered the mover's chance of winning, comparing the
 * engine's evaluation of the position before the move with the position after it.
 */

import type { Analysis } from './engine.ts';
import type { Player } from './rules.ts';

export type Judgement = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveReview {
  judgement: Judgement;
  /** How much the move lowered the mover's win chance, 0–1. */
  loss: number;
  /** The engine's choice in the position before the move. */
  bestMove: number | null;
  /** 0–100, from the win chance lost (lichess's formula). */
  accuracy: number;
}

/** Lowest win-chance loss for each judgement. MCTS evals vary by ~1% between runs, far below these. */
const THRESHOLDS: [Judgement, number][] = [
  ['blunder', 0.3],
  ['mistake', 0.2],
  ['inaccuracy', 0.1],
];

const winChanceFor = (player: Player, analysis: Analysis) =>
  player === 'x' ? analysis.winChance : 1 - analysis.winChance;

/** Reviews `move`, played by `mover`, given evaluations of the positions before and after it. */
export function reviewMove(
  move: number,
  mover: Player,
  before: Analysis,
  after: Analysis,
): MoveReview {
  const best = move === before.bestMove;
  // The engine's own move can't be a mistake by its standards; any measured loss is search noise.
  const loss = best ? 0 : Math.max(0, winChanceFor(mover, before) - winChanceFor(mover, after));
  const judgement = best ? 'best' : (THRESHOLDS.find(([, min]) => loss >= min)?.[0] ?? 'good');
  const accuracy = Math.min(100, Math.max(0, 103.1668 * Math.exp(-4.354 * loss) - 3.1669));
  return { judgement, loss, bestMove: before.bestMove, accuracy };
}

/** A player's accuracy over a game: the mean of their moves' accuracies. */
export function gameAccuracy(reviews: MoveReview[]): number | null {
  if (reviews.length === 0) return null;
  return reviews.reduce((sum, review) => sum + review.accuracy, 0) / reviews.length;
}
