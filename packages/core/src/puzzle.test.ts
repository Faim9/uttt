import { expect, test } from 'vitest';
import { formatMove, parseMove } from './notation.ts';
import {
  bestDefense,
  forcesWin,
  PUZZLE_SLACK,
  puzzleAt,
  puzzleStart,
  stillWins,
} from './puzzle.ts';
import { legalMoves, play, replay, type Position } from './rules.ts';
import { randomGame, seededRandom } from './testing.ts';
import { parsePosition } from './notation.ts';

const EMPTY = '.........';

test('a single winning move makes a win-in-1 puzzle', () => {
  const position = parsePosition(
    `xxx....../xxx....../xx......./oo.o.o.../o.oo.o.../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`,
  );
  expect(puzzleAt(position)).toMatchObject({ line: ['3-3'], winIn: 1 });
});

/** Puzzles found near the end of random games (forced wins show up there; checking only there is fast). */
const randomPuzzles = (() => {
  const random = seededRandom(11);
  const found = [];
  for (let game = 0; game < 60 && found.length < 6; game++) {
    const moves = randomGame(random);
    for (let ply = Math.max(0, moves.length - 6); ply < moves.length; ply++) {
      const puzzle = puzzleAt(replay(moves.slice(0, ply)));
      if (puzzle) found.push(puzzle);
    }
  }
  return found;
})();

test('puzzles from random games win, and each solving move is the only one that does', () => {
  expect(randomPuzzles.length).toBeGreaterThan(0);
  for (const puzzle of randomPuzzles) {
    const { position: start, line } = puzzleStart(puzzle);
    let position = start;
    line.forEach((move, i) => {
      if (i % 2 === 0) {
        const left = puzzle.winIn - i / 2;
        const winners = legalMoves(position).filter((m) => forcesWin(position, m, left));
        expect(winners.map(formatMove)).toEqual([formatMove(move)]);
      }
      position = play(position, move);
    });
    expect(position.outcome).toBe(start.turn);
  }
});

test('solving accepts any move that still forces a win; the defense then holds out longest', () => {
  const position = parsePosition(
    `xxx....../xxx....../xx......./oo.o.o.../o.oo.o.../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`,
  );
  expect(stillWins(position, parseMove('3-3'), 1)).toBe(true);
  expect(stillWins(position, parseMove('3-4'), 3)).toBe(false);

  // A first move that wins, but slower than the puzzle's own line.
  const slower = randomPuzzles.flatMap((puzzle) => {
    const { position: start, line } = puzzleStart(puzzle);
    const n = puzzle.winIn + PUZZLE_SLACK;
    const moves = legalMoves(start).filter((m) => m !== line[0] && stillWins(start, m, n));
    return moves.map((move) => ({ after: play(start, move), n: n - 1 }));
  })[0];
  expect(slower).toBeDefined();
  const { after, n } = slower;
  const winsIn = (p: Position) =>
    Array.from({ length: n }, (_, i) => i + 1).find((k) =>
      legalMoves(p).some((m) => forcesWin(p, m, k)),
    ) ?? Infinity;
  const longest = Math.max(...legalMoves(after).map((reply) => winsIn(play(after, reply))));
  expect(winsIn(play(after, bestDefense(after, n)))).toBe(longest);
});
