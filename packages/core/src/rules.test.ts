import { expect, test } from 'vitest';
import { parseMove, parsePosition } from './notation.ts';
import { boardOf, initialPosition, isLegal, legalMoves, moveCount, play, replay } from './rules.ts';
import { randomGame, seededRandom } from './testing.ts';

const EMPTY = '.........';

test('the first move can go anywhere', () => {
  expect(legalMoves(initialPosition)).toHaveLength(81);
  expect(initialPosition.turn).toBe('x');
});

test('the cell played sends the opponent to the matching board', () => {
  const position = play(initialPosition, parseMove('5-3'));
  expect(position.turn).toBe('o');
  expect(position.forced).toBe(2);
  expect(legalMoves(position).every((move) => boardOf(move) === 2)).toBe(true);
  expect(legalMoves(position)).toHaveLength(9);
});

test('rejects moves outside the forced board, on taken cells, or out of range', () => {
  const position = play(initialPosition, parseMove('5-5'));
  expect(isLegal(position, parseMove('1-1'))).toBe(false);
  expect(isLegal(position, parseMove('5-5'))).toBe(false);
  expect(isLegal(position, 81)).toBe(false);
  expect(isLegal(position, 1.5)).toBe(false);
  expect(() => play(position, parseMove('1-1'))).toThrow('Illegal move');
});

test('being sent to a won board gives a free move on any open board', () => {
  const position = parsePosition(
    `xxx....../.o.o...../o......../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 2`,
  );
  const next = play(position, parseMove('2-1'));
  expect(next.forced).toBeNull();
  expect(legalMoves(next)).toHaveLength(6 + 8 + 6 * 9);
  expect(legalMoves(next).some((move) => boardOf(move) === 0)).toBe(false);
});

test('three local boards in a row win the game', () => {
  const position = parsePosition(
    `xxx....../xxx....../xx......./oo.o.o.../o.oo.o.../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`,
  );
  const next = play(position, parseMove('3-3'));
  expect(next.boards[2]).toBe('x');
  expect(next.outcome).toBe('x');
  expect(legalMoves(next)).toEqual([]);
});

test('drawn local boards count for neither player', () => {
  const position = parsePosition(
    `xxx....../xxx....../xoxxoxoxo/oo.o.o.../oo.o...../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x -`,
  );
  expect(position.boards.slice(0, 3)).toEqual(['x', 'x', 'draw']);
  expect(position.outcome).toBeNull();
});

test('random games always end, and a position has legal moves exactly while undecided', () => {
  const random = seededRandom(1);
  const outcomes = new Set();
  for (let game = 0; game < 300; game++) {
    const moves = randomGame(random);
    expect(moves.length).toBeLessThanOrEqual(81);
    for (let ply = 0; ply <= moves.length; ply++) {
      const position = replay(moves.slice(0, ply));
      expect(legalMoves(position).length > 0).toBe(position.outcome === null);
    }
    outcomes.add(replay(moves).outcome);
  }
  expect(outcomes).toEqual(new Set(['x', 'o', 'draw']));
});

test('moveCount counts the pieces on the board', () => {
  expect(moveCount(initialPosition)).toBe(0);
  const moves = randomGame(seededRandom(7));
  expect(moveCount(replay(moves))).toBe(moves.length);
});
