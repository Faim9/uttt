import { expect, test } from 'vitest';
import { matchmake, pairScore, type PoolMember } from './matchmaking.ts';

const member = (key: string, rating: number, misses = 0, provisional = false): PoolMember => ({
  key,
  rating,
  provisional,
  misses,
});

test('players close in rating are paired; distant ones are not', () => {
  expect(pairScore(member('a', 1500), member('b', 1580))).toBe(80);
  expect(pairScore(member('a', 1500), member('b', 1700))).toBeNull();
});

test('the accepted gap widens the longer both players wait', () => {
  const gap = (misses: number) => pairScore(member('a', 1500, misses), member('b', 1800, misses));
  expect(gap(0)).toBeNull();
  expect(gap(16)).toBeNull(); // 300 - 16 × 12 = 108, over the limit of 100
  expect(gap(17)).toBe(96);
  // The bonus is the smaller of the two, so one long wait alone doesn't widen it.
  expect(pairScore(member('a', 1500, 40), member('b', 1800, 0))).toBeNull();
});

test('nobody is paired with themselves', () => {
  expect(pairScore(member('a', 1500), member('a', 1500))).toBeNull();
});

test('pairs the closest players first', () => {
  const pairs = matchmake([
    member('a', 1500),
    member('b', 1590),
    member('c', 1510),
    member('d', 1600),
  ]);
  const keys = pairs.map(([p, q]) => [p.key, q.key].sort().join(''));
  expect(keys.sort()).toEqual(['ac', 'bd']);
});

test('leaves players unpaired when no fair opponent is waiting', () => {
  const pairs = matchmake([member('a', 1200), member('b', 1500), member('c', 2100)]);
  expect(pairs).toEqual([]);
});
