import { expect, test } from 'vitest';
import { Search, type Analysis } from './engine.ts';
import { parseMove, parsePosition } from './notation.ts';
import { play } from './rules.ts';
import { gameAccuracy, reviewMove } from './review.ts';
import { seededRandom } from './testing.ts';

const evaluation = (winChance: number, bestMove: number | null = 0): Analysis => ({
  winChance,
  bestMove,
  pv: bestMove === null ? [] : [bestMove],
  playouts: 1000,
  proven: false,
});

test("judges a move by the drop in the mover's win chance", () => {
  const before = evaluation(0.7, 40); // X to move, 70% for X
  expect(reviewMove(41, 'x', before, evaluation(0.65)).judgement).toBe('good');
  expect(reviewMove(41, 'x', before, evaluation(0.55)).judgement).toBe('inaccuracy');
  expect(reviewMove(41, 'x', before, evaluation(0.45)).judgement).toBe('mistake');
  expect(reviewMove(41, 'x', before, evaluation(0.2)).judgement).toBe('blunder');
  expect(reviewMove(41, 'x', before, evaluation(0.2)).loss).toBeCloseTo(0.5);
});

test("O's losses are measured from O's side", () => {
  const before = evaluation(0.3, 40); // O to move, 70% for O
  const review = reviewMove(41, 'o', before, evaluation(0.8));
  expect(review.loss).toBeCloseTo(0.5);
  expect(review.judgement).toBe('blunder');
});

test("the engine's own move is best, even if the next eval is noisier", () => {
  const review = reviewMove(40, 'x', evaluation(0.7, 40), evaluation(0.66));
  expect(review).toMatchObject({ judgement: 'best', loss: 0, accuracy: expect.closeTo(100, 3) });
});

test('accuracy is 100 for lossless play and falls with the win chance lost', () => {
  const perfect = reviewMove(41, 'x', evaluation(0.5, 40), evaluation(0.52));
  const blunder = reviewMove(41, 'x', evaluation(0.9, 40), evaluation(0.1));
  expect(perfect.accuracy).toBeCloseTo(100, 3);
  expect(blunder.accuracy).toBeLessThan(5);
  expect(gameAccuracy([perfect, blunder])).toBeCloseTo((100 + blunder.accuracy) / 2);
  expect(gameAccuracy([])).toBeNull();
});

test('with the real engine, the immediate win is best and other moves lose win chance', () => {
  // X wins at once with 3-3; 3-4 instead sends O to board 4.
  const position = parsePosition(
    'xxx....../xxx....../xx......./oo.o.o.../oo.o.o.../........./........./........./......... x 3',
  );
  const analyze = (p: typeof position) => {
    const search = new Search(p, seededRandom(1));
    search.run(5000);
    return search.analysis;
  };
  const before = analyze(position);
  const win = reviewMove(parseMove('3-3'), 'x', before, analyze(play(position, parseMove('3-3'))));
  expect(win.judgement).toBe('best');
  const miss = reviewMove(parseMove('3-4'), 'x', before, analyze(play(position, parseMove('3-4'))));
  expect(miss.loss).toBeGreaterThan(0);
  expect(miss.bestMove).toBe(parseMove('3-3'));
});
