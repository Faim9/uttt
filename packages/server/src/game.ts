import {
  clockOf,
  isLegal,
  other,
  play,
  replay,
  type GamePlayer,
  type GameState,
  type Outcome,
  type Player,
  type Position,
  type Termination,
  type TimeControl,
} from '@uttt/core';

/** A rule violation by a player; its message is safe to show them. */
export class GameError extends Error {}

export interface Seat extends GamePlayer {
  /** `u:<userId>` or `g:<guestId>`. */
  key: string;
  userId: number | null;
}

export interface GameInit {
  id: string;
  timeControl: TimeControl;
  rated: boolean;
  seats: Record<Player, Seat>;
  moves?: number[];
  clocks?: Record<Player, number>;
}

/** Without a first move from each player in this time, the game is aborted. */
export const FIRST_MOVE_MS = 30_000;

/**
 * Lag compensation, after lichess's LagTracker (scalachess, AGPL-3.0): each move is refunded the mover's
 * network lag, but only out of a quota that refills by this much per move (up to 1 s, less in fast games),
 * starts at 3× that, and is capped at 7×. Real lag is forgiven; claiming more gains almost nothing.
 */
function lagQuotaGain(timeControl: TimeControl): number {
  const { initialMs, incrementMs } = clockOf(timeControl);
  const estimatedSeconds = (initialMs + 40 * incrementMs) / 1000;
  return Math.min(1000, estimatedSeconds * 4 + 150);
}

/**
 * A game in progress. The server is the only authority on moves and clocks.
 * Clocks start once both players have made their first move.
 */
export class LiveGame {
  readonly id: string;
  readonly timeControl: TimeControl;
  readonly rated: boolean;
  readonly seats: Record<Player, Seat>;
  readonly moves: number[];
  readonly clocks: Record<Player, number>;
  position: Position;
  drawOffer: Player | null = null;
  termination: Termination | null = null;
  outcome: Outcome | null = null;

  private turnStartedAt = Date.now();
  private readonly quotaGain: number;
  private readonly lagQuota: Record<Player, number>;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly onChange: (game: LiveGame) => void;

  constructor(init: GameInit, onChange: (game: LiveGame) => void) {
    const { initialMs } = clockOf(init.timeControl);
    this.id = init.id;
    this.timeControl = init.timeControl;
    this.rated = init.rated;
    this.seats = init.seats;
    this.moves = init.moves ?? [];
    this.clocks = init.clocks ?? { x: initialMs, o: initialMs };
    this.position = replay(this.moves);
    this.onChange = onChange;
    this.quotaGain = lagQuotaGain(init.timeControl);
    this.lagQuota = { x: 3 * this.quotaGain, o: 3 * this.quotaGain };
    this.schedule();
  }

  sideOf(key: string): Player | null {
    if (this.seats.x.key === key) return 'x';
    return this.seats.o.key === key ? 'o' : null;
  }

  /** `lagMs` is the mover's estimated one-way network delay, refunded within their lag quota. */
  move(key: string, move: number, lagMs = 0): void {
    const side = this.playerSide(key);
    if (side !== this.position.turn) throw new GameError('Not your turn');
    if (!isLegal(this.position, move)) throw new GameError('Illegal move');

    if (this.clocksRunning) {
      const elapsed = Date.now() - this.turnStartedAt;
      const refund = Math.min(Math.max(lagMs, 0), this.lagQuota[side], elapsed);
      const quota = this.lagQuota[side] - refund + this.quotaGain;
      this.lagQuota[side] = Math.min(quota, 7 * this.quotaGain);
      this.clocks[side] -= elapsed - refund;
      if (this.clocks[side] <= 0) return this.flag();
      this.clocks[side] += clockOf(this.timeControl).incrementMs;
    }
    this.moves.push(move);
    this.position = play(this.position, move);
    this.turnStartedAt = Date.now();
    this.drawOffer = null;

    if (this.position.outcome) return this.end(this.position.outcome, 'line');
    this.schedule();
    this.onChange(this);
  }

  resign(key: string): void {
    this.end(other(this.playerSide(key)), 'resign');
  }

  /** Offers a draw, or accepts the opponent's standing offer. */
  draw(key: string): void {
    const side = this.playerSide(key);
    if (this.drawOffer === other(side)) return this.end('draw', 'agreement');
    this.drawOffer = side;
    this.onChange(this);
  }

  abort(key: string): void {
    this.playerSide(key);
    if (this.clocksRunning) throw new GameError('Too late to abort; resign instead');
    this.end(null, 'abort');
  }

  /** Clocks are reported as of `now`; the client counts down from there. */
  state(now = Date.now()): GameState {
    const running = this.termination === null && this.clocksRunning ? this.position.turn : null;
    const clocks = { ...this.clocks };
    if (running) clocks[running] = Math.max(0, clocks[running] - (now - this.turnStartedAt));
    return {
      id: this.id,
      timeControl: this.timeControl,
      rated: this.rated,
      players: { x: publicSeat(this.seats.x), o: publicSeat(this.seats.o) },
      moves: [...this.moves],
      clocks,
      running,
      drawOffer: this.drawOffer,
      termination: this.termination,
      outcome: this.outcome,
    };
  }

  private get clocksRunning(): boolean {
    return this.moves.length >= 2;
  }

  /** The side `key` plays in this still-running game. */
  private playerSide(key: string): Player {
    if (this.termination !== null) throw new GameError('The game is over');
    const side = this.sideOf(key);
    if (!side) throw new GameError('You are not playing in this game');
    return side;
  }

  private schedule(): void {
    clearTimeout(this.timer);
    // The flag waits out the mover's lag quota too, so a move still in transit can arrive and count.
    const { turn } = this.position;
    this.timer = this.clocksRunning
      ? setTimeout(() => this.flag(), this.clocks[turn] + this.lagQuota[turn])
      : setTimeout(() => this.end(null, 'abort'), FIRST_MOVE_MS);
  }

  private flag(): void {
    this.clocks[this.position.turn] = 0;
    this.end(other(this.position.turn), 'timeout');
  }

  private end(outcome: Outcome | null, termination: Termination): void {
    clearTimeout(this.timer);
    this.outcome = outcome;
    this.termination = termination;
    this.drawOffer = null;
    this.onChange(this);
  }
}

function publicSeat({ username, rating, provisional, ratingDiff }: Seat): GamePlayer {
  return { username, rating, provisional, ratingDiff };
}
