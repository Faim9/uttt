import { expect, test } from 'vitest';
import { formatMove } from './notation.ts';
import { forcesWin, puzzleAt, puzzleStart } from './puzzle.ts';
import { legalMoves, play, replay } from './rules.ts';
import { randomGame, seededRandom } from './testing.ts';
import { parsePosition } from './notation.ts';

const EMPTY = '.........';

test('a single winning move makes a win-in-1 puzzle', () => {
  const position = parsePosition(
    `xxx....../xxx....../xx......./oo.o.o.../o.oo.o.../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`,
  );
  expect(puzzleAt(position)).toMatchObject({ line: ['3-3'], winIn: 1 });
});

test('puzzles from random games win, and each solving move is the only one that does', () => {
  const random = seededRandom(11);
  const puzzles = [];
  for (let game = 0; game < 60 && puzzles.length < 6; game++) {
    const moves = randomGame(random);
    // Forced wins show up near the end; checking only there keeps the test fast.
    for (let ply = Math.max(0, moves.length - 6); ply < moves.length; ply++) {
      const puzzle = puzzleAt(replay(moves.slice(0, ply)));
      if (puzzle) puzzles.push(puzzle);
    }
  }
  expect(puzzles.length).toBeGreaterThan(0);

  for (const puzzle of puzzles) {
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
