/**
 * Generates the site's puzzles from games the engine plays against itself, at varied strengths so there are
 * mistakes to punish. Run with `pnpm puzzles`; it writes packages/web/src/lib/puzzles.json in a few minutes.
 */

import { writeFileSync } from 'node:fs';
import {
  bestMove,
  initialPosition,
  legalMoves,
  play,
  puzzleAt,
  Search,
  type Puzzle,
} from '@uttt/core';

const TARGET = 400;
const OUTPUT = new URL('../../web/src/lib/puzzles.json', import.meta.url);
/** Random first moves, so games (and puzzles) differ. */
const RANDOM_OPENING = 4;
/** Forced wins rarely exist earlier; skipping these plies saves most of the work. */
const FIRST_PLY = 10;
/** The solver usually proves a short forced win within this budget; only then run the exact check. */
const PRESCREEN = 4000;

const puzzles = new Map<string, Puzzle>();
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

for (let games = 1; puzzles.size < TARGET; games++) {
  const strength = { x: pick([200, 600, 2000]), o: pick([200, 600, 2000]) };
  let position = initialPosition;
  for (let ply = 0; position.outcome === null; ply++) {
    if (ply >= FIRST_PLY) {
      const search = new Search(position);
      search.run(PRESCREEN);
      const { proven, winChance } = search.analysis;
      if (proven && winChance === (position.turn === 'x' ? 1 : 0)) {
        const puzzle = puzzleAt(position);
        if (puzzle) puzzles.set(puzzle.position, puzzle);
      }
    }
    const move =
      ply < RANDOM_OPENING
        ? pick(legalMoves(position))
        : bestMove(position, strength[position.turn]);
    position = play(position, move);
  }
  if (games % 20 === 0) console.log(`${games} games, ${puzzles.size} puzzles`);
}

// Shuffled, so neighbouring puzzles (and days) don't come from the same game.
const list = [...puzzles.values()].sort(() => Math.random() - 0.5);
writeFileSync(OUTPUT, JSON.stringify(list, null, 1) + '\n');
const wins = (n: number) => list.filter((puzzle) => puzzle.winIn === n).length;
console.log(`Wrote ${list.length} puzzles: ${wins(1)} win in 1, ${wins(2)} win in 2.`);
