import { DISCONNECT_GRACE_MS, legalMoves, parseMove } from '@uttt/core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FIRST_MOVE_MS, GameError, LiveGame, type Seat } from './game.ts';

const seat = (key: string): Seat => ({
  key,
  userId: null,
  username: null,
  bot: false,
  rating: null,
  provisional: false,
  ratingDiff: null,
});

let changes: number;
function newGame(timeControl: '1+0' | '3+2' | '1d' = '3+2', turnStartedAt?: number) {
  return new LiveGame(
    {
      id: 'abcd1234',
      timeControl,
      rated: false,
      seats: { x: seat('alice'), o: seat('bob') },
      turnStartedAt,
    },
    () => changes++,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  changes = 0;
});
afterEach(() => vi.useRealTimers());

test('players alternate, and only legal moves by the right player are accepted', () => {
  const game = newGame();
  expect(() => game.move('bob', 40)).toThrow('Not your turn');
  expect(() => game.move('eve', 40)).toThrow('not playing');
  game.move('alice', parseMove('5-5'));
  expect(() => game.move('bob', parseMove('1-1'))).toThrow(GameError);
  game.move('bob', parseMove('5-1'));
  expect(game.moves).toHaveLength(2);
  expect(changes).toBe(2);
});

test('clocks start after both first moves, count down, and add the increment', () => {
  const game = newGame('3+2');
  game.move('alice', parseMove('5-5'));
  vi.advanceTimersByTime(10_000);
  game.move('bob', parseMove('5-1'));
  expect(game.state().clocks).toEqual({ x: 180_000, o: 180_000 });
  expect(game.state().running).toBe('x');

  vi.advanceTimersByTime(5000);
  expect(game.state().clocks.x).toBe(175_000);
  game.move('alice', parseMove('1-9'));
  expect(game.state().clocks).toEqual({ x: 177_000, o: 180_000 });
  // Each move's time left is kept for reviewing the game.
  expect(game.state().clockHistory).toEqual([180_000, 180_000, 177_000]);
});

test('running out of time loses', () => {
  const game = newGame('1+0');
  game.move('alice', parseMove('5-5'));
  game.move('bob', parseMove('5-1'));
  vi.advanceTimersByTime(60_000 + 3 * 390); // the clock, plus the lag quota a move in transit may use
  expect(game.termination).toBe('timeout');
  expect(game.outcome).toBe('o');
  expect(game.state().clocks.x).toBe(0);
  expect(() => game.move('alice', parseMove('1-9'))).toThrow('over');
});

test('a game nobody starts is aborted', () => {
  const game = newGame();
  vi.advanceTimersByTime(FIRST_MOVE_MS);
  expect(game.termination).toBe('abort');
  expect(game.outcome).toBeNull();
});

test('abort is only allowed before the clocks start', () => {
  const game = newGame();
  game.move('alice', parseMove('5-5'));
  game.move('bob', parseMove('5-1'));
  expect(() => game.abort('alice')).toThrow('Too late');
  game.resign('alice');
  expect(game.outcome).toBe('o');
  expect(game.termination).toBe('resign');
});

test('a draw offer is accepted by the opponent and cleared by a move', () => {
  const game = newGame();
  game.draw('alice');
  expect(game.drawOffer).toBe('x');
  game.move('alice', parseMove('5-5'));
  expect(game.drawOffer).toBeNull();
  game.draw('bob');
  game.draw('alice');
  expect(game.outcome).toBe('draw');
  expect(game.termination).toBe('agreement');
});

test('a decided position ends the game with that outcome', () => {
  const game = newGame();
  while (game.termination === null) {
    const player = game.position.turn === 'x' ? 'alice' : 'bob';
    game.move(player, legalMoves(game.position)[0]);
  }
  expect(game.termination).toBe('line');
  expect(game.outcome).toBe(game.position.outcome);
  expect(game.state().running).toBeNull();
});

test("network lag is refunded from the mover's lag quota", () => {
  const game = newGame('3+2');
  game.move('alice', parseMove('5-5'));
  game.move('bob', parseMove('5-1'));
  vi.advanceTimersByTime(5000);
  game.move('alice', parseMove('1-9'), 300);
  expect(game.clocks.x).toBe(180_000 - 4700 + 2000);
});

test('claimed lag beyond the quota is not refunded', () => {
  // 1+0: the quota starts at 3 × 390 ms and refills 390 ms per move.
  const game = newGame('1+0');
  game.move('alice', parseMove('5-5'));
  game.move('bob', parseMove('5-1'));
  vi.advanceTimersByTime(3000);
  game.move('alice', parseMove('1-9'), 5000);
  expect(game.clocks.x).toBe(60_000 - (3000 - 1170));
  game.move('bob', parseMove('9-1'));
  vi.advanceTimersByTime(3000);
  game.move('alice', parseMove('1-5'), 5000);
  expect(game.clocks.x).toBe(58_170 - (3000 - 390));
});

test('a move still in transit when the clock runs out counts', () => {
  const game = newGame('1+0');
  game.move('alice', parseMove('5-5'));
  game.move('bob', parseMove('5-1'));
  vi.advanceTimersByTime(60_500);
  expect(game.termination).toBeNull();
  game.move('alice', parseMove('1-9'), 800);
  expect(game.clocks.x).toBe(300);

  vi.advanceTimersByTime(61_200); // O has no lag to show for it: past clock + quota, the flag falls.
  expect(game.termination).toBe('timeout');
});

test('after the grace period, the opponent of a disconnected player can claim the game', () => {
  const game = newGame();
  game.move('alice', parseMove('5-5'));
  game.move('bob', parseMove('5-1'));
  expect(() => game.claim('bob', 'win')).toThrow('still connected');

  game.setPresence('x', false);
  expect(game.state().absence).toEqual({ x: 0, o: null });
  vi.advanceTimersByTime(DISCONNECT_GRACE_MS - 1);
  expect(() => game.claim('bob', 'win')).toThrow('a little longer');

  // Coming back resets the grace period.
  game.setPresence('x', true);
  game.setPresence('x', false);
  vi.advanceTimersByTime(DISCONNECT_GRACE_MS);
  game.claim('bob', 'win');
  expect(game).toMatchObject({ outcome: 'o', termination: 'disconnect' });
});

test('the opponent of a disconnected player may settle for a draw instead', () => {
  const game = newGame();
  game.move('alice', parseMove('5-5'));
  game.move('bob', parseMove('5-1'));
  game.setPresence('o', false);
  vi.advanceTimersByTime(DISCONNECT_GRACE_MS);
  game.claim('alice', 'draw');
  expect(game).toMatchObject({ outcome: 'draw', termination: 'disconnect' });
});

const DAY = 86_400_000;

test('correspondence: each move gets the full time again, and missing a deadline loses', () => {
  const game = newGame('1d');
  vi.advanceTimersByTime(DAY - 1000); // no 30-second first-move rule: the first move has a day too
  game.move('alice', parseMove('5-5'));
  expect(game.state().clocks).toEqual({ x: DAY, o: DAY });
  vi.advanceTimersByTime(20 * 3_600_000);
  game.move('bob', parseMove('5-1'));
  expect(game.state().clocks.o).toBe(DAY);
  expect(game.state().absence).toEqual({ x: null, o: null });
  game.setPresence('o', false);
  vi.advanceTimersByTime(DAY - 1);
  expect(game.termination).toBeNull();
  expect(() => game.claim('bob', 'win')).toThrow('deadline');
  vi.advanceTimersByTime(1);
  expect(game).toMatchObject({ termination: 'timeout', outcome: 'o' });
});

test('correspondence: a first move left too long aborts, and deadlines survive a restart', () => {
  const unplayed = newGame('1d');
  vi.advanceTimersByTime(DAY);
  expect(unplayed.termination).toBe('abort');

  // Restored after the server was down: the time since the turn started still counts.
  const restored = newGame('1d', Date.now() - DAY + 1000);
  vi.advanceTimersByTime(1000);
  expect(restored.termination).toBe('abort');
});
