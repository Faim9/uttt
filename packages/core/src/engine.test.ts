import { expect, test } from 'vitest';
import { bestMove, Search } from './engine.ts';
import { parseMove, parsePosition } from './notation.ts';
import { initialPosition, legalMoves, play, type Player } from './rules.ts';
import { randomGame, seededRandom } from './testing.ts';

const EMPTY = '.........';

test('takes an immediate win', () => {
  const position = parsePosition(
    `xxx....../xxx....../xx......./oo.o.o.../oo.o.o.../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`,
  );
  expect(bestMove(position, 1000, seededRandom(4))).toBe(parseMove('3-3'));
});

test('reports a winning evaluation and a principal variation', () => {
  const position = parsePosition(
    `xxx....../xxx....../xx......./oo.o.o.../oo.o.o.../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`,
  );
  const search = new Search(position, seededRandom(5));
  search.run(2000);
  const { winChance, pv, playouts } = search.analysis;
  expect(winChance).toBe(1);
  expect(pv[0]).toBe(parseMove('3-3'));
  expect(playouts).toBe(2000);
});

test('has nothing to suggest once the game is over', () => {
  const position = play(
    parsePosition(
      `xxx....../xxx....../xx......./oo.o.o.../oo.o.o.../${EMPTY}/${EMPTY}/${EMPTY}/${EMPTY} x 3`,
    ),
    parseMove('3-3'),
  );
  const search = new Search(position);
  search.run(10);
  expect(search.analysis).toMatchObject({ bestMove: null, winChance: 1, pv: [] });
  expect(() => bestMove(position, 10)).toThrow('game is over');
});

test('suggests only legal moves, in positions from random games', () => {
  const random = seededRandom(7);
  for (let game = 0; game < 40; game++) {
    let position = initialPosition;
    for (const move of randomGame(random)) {
      expect(legalMoves(position)).toContain(bestMove(position, 50, random));
      position = play(position, move);
    }
  }
});

test('beats a random player', () => {
  const random = seededRandom(6);
  let wins = 0;
  for (const engine of ['x', 'o'] as Player[]) {
    for (let game = 0; game < 3; game++) {
      let position = initialPosition;
      while (position.outcome === null) {
        const legal = legalMoves(position);
        const move =
          position.turn === engine
            ? bestMove(position, 500, random)
            : legal[Math.floor(random() * legal.length)];
        position = play(position, move);
      }
      if (position.outcome === engine) wins++;
    }
  }
  expect(wins).toBeGreaterThanOrEqual(5);
});
