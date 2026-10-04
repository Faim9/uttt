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

/** How many puzzles of each length to keep: mostly two and three moves, which teach the game best. */
const TARGETS: Record<number, number> = { 1: 60, 2: 220, 3: 150, 4: 40 };
/** Long wins are rare; stop after this many games even if a target isn't met. */
const MAX_GAMES = 1200;
const OUTPUT = new URL('../../web/src/lib/puzzles.json', import.meta.url);
/** Random first moves, so games (and puzzles) differ. */
const RANDOM_OPENING = 4;
/** Forced wins rarely exist earlier; skipping these plies saves most of the work. */
const FIRST_PLY = 10;
/** The solver proves most short forced wins within this budget; only then run the exact check. */
const PRESCREEN = 20_000;

const puzzles = new Map<string, Puzzle>();
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const count = (n: number) => [...puzzles.values()].filter((puzzle) => puzzle.winIn === n).length;
const wanted = (n: number) => count(n) < (TARGETS[n] ?? 0);

for (let games = 1; games <= MAX_GAMES && Object.keys(TARGETS).some((n) => wanted(+n)); games++) {
  const strength = { x: pick([200, 600, 2000]), o: pick([200, 600, 2000]) };
  let position = initialPosition;
  for (let ply = 0; position.outcome === null; ply++) {
    if (ply >= FIRST_PLY) {
      const search = new Search(position);
      search.run(PRESCREEN);
      const { proven, winChance } = search.analysis;
      if (proven && winChance === (position.turn === 'x' ? 1 : 0)) {
        const puzzle = puzzleAt(position);
        if (puzzle && wanted(puzzle.winIn)) puzzles.set(puzzle.position, puzzle);
      }
    }
    const move =
      ply < RANDOM_OPENING
        ? pick(legalMoves(position))
        : bestMove(position, strength[position.turn]);
    position = play(position, move);
  }
  if (games % 20 === 0) {
    console.log(`${games} games: ${[1, 2, 3, 4].map((n) => `${count(n)} win in ${n}`).join(', ')}`);
  }
}

// Shuffled, so neighbouring puzzles (and days) don't come from the same game.
const list = [...puzzles.values()].sort(() => Math.random() - 0.5);
writeFileSync(OUTPUT, JSON.stringify(list, null, 1) + '\n');
console.log(`Wrote ${list.length} puzzles.`);
