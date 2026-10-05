import { expect, test } from 'vitest';
import { categoryOf, clockOf, isCorrespondence, isTimeControl } from './protocol.ts';

test.each(['1+0', '3+2', '60+30', '1d', '14d'])('accepts the time control %s', (value) => {
  expect(isTimeControl(value)).toBe(true);
});

test.each(['0+0', '61+0', '3+31', '0d', '15d', '3', 'd'])(
  'rejects the time control %s',
  (value) => {
    expect(isTimeControl(value)).toBe(false);
  },
);

test('correspondence gives each move days, and has its own rating category', () => {
  expect(isCorrespondence('3d')).toBe(true);
  expect(isCorrespondence('3+2')).toBe(false);
  expect(clockOf('3d')).toEqual({ initialMs: 3 * 86_400_000, incrementMs: 0 });
  expect(categoryOf('3d')).toBe('correspondence');
  expect([categoryOf('1+0'), categoryOf('3+2'), categoryOf('10+5')]).toEqual([
    'bullet',
    'blitz',
    'rapid',
  ]);
});
