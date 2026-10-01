import { expect, test } from 'vitest';
import { DEFAULT_RATING, decay, rate } from './glicko.ts';

test("matches the worked example in Glickman's paper", () => {
  const player = { rating: 1500, deviation: 200, volatility: 0.06 };
  const updated = rate(player, [
    { opponent: { rating: 1400, deviation: 30, volatility: 0.06 }, score: 1 },
    { opponent: { rating: 1550, deviation: 100, volatility: 0.06 }, score: 0 },
    { opponent: { rating: 1700, deviation: 300, volatility: 0.06 }, score: 0 },
  ]);
  expect(updated.rating).toBeCloseTo(1464.06, 1);
  expect(updated.deviation).toBeCloseTo(151.52, 1);
  expect(updated.volatility).toBeCloseTo(0.05999, 4);
});

test('a win against an equal opponent raises rating and lowers deviation', () => {
  const updated = rate(DEFAULT_RATING, [{ opponent: DEFAULT_RATING, score: 1 }]);
  expect(updated.rating).toBeGreaterThan(1500);
  expect(updated.deviation).toBeLessThan(DEFAULT_RATING.deviation);
  const loser = rate(DEFAULT_RATING, [{ opponent: DEFAULT_RATING, score: 0 }]);
  expect(loser.rating - 1500).toBeCloseTo(1500 - updated.rating, 6);
});

test('deviation grows with inactivity, up to the default', () => {
  const settled = { rating: 1800, deviation: 60, volatility: 0.06 };
  expect(decay(settled, 0).deviation).toBeCloseTo(60);
  expect(decay(settled, 100).deviation).toBeGreaterThan(80);
  expect(decay(settled, 100_000).deviation).toBe(350);
});
