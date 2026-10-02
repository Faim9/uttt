/** Messages and types shared by the web client and the server. Client input is validated with these schemas. */

import { z } from 'zod';
import type { Outcome, Player } from './rules.ts';

/** Time controls as `<minutes>+<increment seconds>`. */
export const TIME_CONTROLS = ['1+0', '2+1', '3+2', '5+3', '10+5'] as const;
export type TimeControl = (typeof TIME_CONTROLS)[number];

export const CATEGORIES = ['bullet', 'blitz', 'rapid'] as const;
export type Category = (typeof CATEGORIES)[number];

export function clockOf(timeControl: TimeControl): { initialMs: number; incrementMs: number } {
  const [minutes, seconds] = timeControl.split('+').map(Number);
  return { initialMs: minutes * 60_000, incrementMs: seconds * 1000 };
}

/** Rating category by estimated game length, assuming ~25 moves per player. */
export function categoryOf(timeControl: TimeControl): Category {
  const { initialMs, incrementMs } = clockOf(timeControl);
  const estimateMs = initialMs + 25 * incrementMs;
  if (estimateMs < 180_000) return 'bullet';
  return estimateMs < 480_000 ? 'blitz' : 'rapid';
}

const Password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const SignupBody = z.object({
  username: z
    .string()
    .regex(/^[A-Za-z0-9_-]{3,20}$/, 'Username must be 3–20 letters, digits, _ or -'),
  email: z.email('Invalid email').max(254),
  password: Password,
});

export const ChangePasswordBody = z.object({
  current: z.string().min(1).max(128),
  password: Password,
});

export const LoginBody = z.object({
  /** Username or email. */
  login: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

const Id = z.string().regex(/^[A-Za-z0-9]{8}$/);
const GameAction = (type: 'resign' | 'draw' | 'abort') =>
  z.object({ type: z.literal(type), gameId: Id });

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('seek'), timeControl: z.enum(TIME_CONTROLS), rated: z.boolean() }),
  z.object({ type: z.literal('cancelSeek') }),
  z.object({
    type: z.literal('createChallenge'),
    timeControl: z.enum(TIME_CONTROLS),
    rated: z.boolean(),
    color: z.enum(['x', 'o', 'random']),
  }),
  z.object({ type: z.literal('cancelChallenge') }),
  z.object({ type: z.literal('acceptChallenge'), id: Id }),
  z.object({ type: z.literal('watch'), gameId: Id }),
  z.object({ type: z.literal('move'), gameId: Id, move: z.number().int().min(0).max(80) }),
  /** Offers a draw, or accepts the opponent's offer. */
  GameAction('draw'),
  GameAction('resign'),
  GameAction('abort'),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface User {
  id: number;
  username: string;
}

export interface GamePlayer {
  /** Null for guests. */
  username: string | null;
  rating: number | null;
  provisional: boolean;
  ratingDiff: number | null;
}

export type Termination = 'line' | 'resign' | 'timeout' | 'agreement' | 'abort';

export interface GameState {
  id: string;
  timeControl: TimeControl;
  rated: boolean;
  players: Record<Player, GamePlayer>;
  moves: number[];
  /** Milliseconds left for each player when the message was sent. */
  clocks: Record<Player, number>;
  /** Whose clock is running, if any. */
  running: Player | null;
  drawOffer: Player | null;
  /** Null while the game is in progress. */
  termination: Termination | null;
  /** Null while in progress and for aborted games. */
  outcome: Outcome | null;
}

export type ServerMessage =
  | { type: 'game'; game: GameState; you: Player | null }
  | { type: 'gameStarted'; gameId: string }
  | { type: 'challengeCreated'; id: string }
  | { type: 'error'; message: string };
