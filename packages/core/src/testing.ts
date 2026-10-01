/** Test helpers: deterministic randomness, so randomized tests are reproducible. */

import { initialPosition, legalMoves, play } from './rules.ts';

/** Mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** Plays uniformly random moves until the game ends and returns them. */
export function randomGame(random: () => number): number[] {
  const moves = [];
  for (let position = initialPosition; position.outcome === null;) {
    const legal = legalMoves(position);
    const move = legal[Math.floor(random() * legal.length)];
    moves.push(move);
    position = play(position, move);
  }
  return moves;
}
