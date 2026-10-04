import { expect, test } from 'vitest';
import {
  formatGame,
  formatMove,
  formatPosition,
  parseGame,
  parseMove,
  parsePosition,
  startOf,
} from './notation.ts';
import { initialPosition, replay } from './rules.ts';
import { randomGame, seededRandom } from './testing.ts';

const EMPTY = '.........';

test('moves are written big board, then small board', () => {
  expect(parseMove('5-3')).toBe(4 * 9 + 2);
  expect(formatMove(0)).toBe('1-1');
  expect(formatMove(80)).toBe('9-9');
  for (let move = 0; move < 81; move++) expect(parseMove(formatMove(move))).toBe(move);
});

test.each(['0-1', '1-0', '10-1', '5 3', '53', 'a-b', ' 5-3'])(
  'rejects invalid move "%s"',
  (text) => {
    expect(() => parseMove(text)).toThrow('Invalid move');
  },
);

test('formats the initial position', () => {
  expect(formatPosition(initialPosition)).toBe(Array(9).fill(EMPTY).join('/') + ' x -');
});

test('position strings round-trip through random games', () => {
  const random = seededRandom(2);
  for (let game = 0; game < 50; game++) {
    const moves = randomGame(random);
    for (let ply = 0; ply <= moves.length; ply++) {
      const position = replay(moves.slice(0, ply));
      expect(parsePosition(formatPosition(position))).toEqual(position);
    }
  }
});

test.each([
  ['malformed', `${EMPTY} x -`],
  [
    'wrong side to move',
    `x......../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x -`,
  ],
  [
    'forced onto a won board',
    `xxx....../oo......./o......../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 1`,
  ],
  [
    'won by both',
    `xxxooo.../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 4`,
  ],
  // X's only piece, in cell 5, sends O to board 5, not board 1.
  [
    'not sent there',
    `....x..../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} o 1`,
  ],
  [
    'free for no reason',
    `....x..../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} o -`,
  ],
])('rejects an invalid position: %s', (_, text) => {
  expect(() => parsePosition(text)).toThrow('Invalid position');
});

test('parses a game record and fills Result from the move list', () => {
  const record = parseGame(`
    [X "alice"]
    [O "bob"]

    1. 5-5 5-1 2. 1-9 9-5 3. 5-3 3-7 1-0
  `);
  expect(record.tags).toEqual({ X: 'alice', O: 'bob', Result: '1-0' });
  expect(record.moves.map(formatMove)).toEqual(['5-5', '5-1', '1-9', '9-5', '5-3', '3-7']);
});

test('game records round-trip', () => {
  const record = {
    tags: { X: 'alice', O: 'bob', Result: '½-½' },
    moves: randomGame(seededRandom(3)),
  };
  expect(parseGame(formatGame(record))).toEqual(record);
});

test('rejects game records with illegal moves', () => {
  expect(() => parseGame('1. 5-5 1-1')).toThrow('Illegal move 2: 1-1');
});

test('rejects tag values that would break the record', () => {
  expect(() => formatGame({ tags: { X: 'a"b' }, moves: [] })).toThrow('Invalid tag');
});

test('a Position tag sets the starting position', () => {
  const start = `xxx....../xxx....../xx......./oo.o.o.../o.oo.o.../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`;
  const record = parseGame(`[Position "${start}"]\n\n1. 3-3 1-0`);
  expect(record.moves).toEqual([parseMove('3-3')]);
  expect(startOf(record.tags)).toEqual(parsePosition(start));
  expect(() => parseGame(`[Position "${start}"]\n\n1. 5-5`)).toThrow('Illegal move 1: 5-5');
});
