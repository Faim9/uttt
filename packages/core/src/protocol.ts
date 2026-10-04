/** Messages and types shared by the web client and the server. Client input is validated with these schemas. */

import { z } from 'zod';
import type { Outcome, Player } from './rules.ts';

/** A time control as `<minutes>+<increment seconds>`, from 1+0 up to 60+30. */
export type TimeControl = `${number}+${number}`;
const TIME_CONTROL = /^([1-9]|[1-5]\d|60)\+([12]?\d|30)$/;

export const isTimeControl = (value: unknown): value is TimeControl =>
  typeof value === 'string' && TIME_CONTROL.test(value);

export const TimeControl = z.custom<TimeControl>(
  isTimeControl,
  'Time controls go from 1+0 to 60+30',
);

/** The quick-pairing pools. Challenges may use any time control. */
export const TIME_CONTROLS = ['1+0', '2+1', '3+0', '3+2', '5+3', '10+5'] as const;
export type PoolTimeControl = (typeof TIME_CONTROLS)[number];

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

const Username = z
  .string()
  .regex(/^[A-Za-z0-9_-]{3,20}$/, 'Username must be 3–20 letters, digits, _ or -');

export const SignupBody = z.object({
  username: Username,
  email: z.email('Invalid email').max(254),
  password: Password,
  /** Cloudflare Turnstile's token, when the site has the check on. */
  captcha: z.string().max(4096).optional(),
});

/** Tokens from emailed links: 32 random bytes, base64url. */
const EmailToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'This link is invalid');

export const EmailTokenBody = z.object({ token: EmailToken });

export const ResetRequestBody = z.object({ email: z.email('Invalid email').max(254) });

export const ResetPasswordBody = z.object({ token: EmailToken, password: Password });

export const ChangePasswordBody = z.object({
  current: z.string().min(1).max(128),
  password: Password,
});

export const LoginBody = z.object({
  /** Username or email. */
  login: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
  /** Authenticator or recovery code, for accounts with two-factor authentication. */
  code: z.string().max(20).optional(),
});

export const EnableTwoFactorBody = z.object({
  secret: z.string().regex(/^[A-Z2-7]{32}$/),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your app'),
});

export const DeleteAccountBody = z.object({
  password: z.string().min(1).max(128),
  code: z.string().max(20).optional(),
});

export const DisableTwoFactorBody = z.object({ password: z.string().min(1).max(128) });

export const REPORT_REASONS = ['cheating', 'abuse', 'username', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const ReportBody = z.object({
  username: Username,
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().min(1, 'Tell us what happened').max(1000),
});

export const CreateTournamentBody = z.object({
  name: z.string().trim().min(1).max(60),
  timeControl: TimeControl,
  rated: z.boolean(),
  startsAt: z.coerce.date(),
  minutes: z.number().int().min(10).max(240),
});

export const CloseAccountBody = z.object({ reason: z.string().trim().min(1).max(500) });
export const RenameBody = z.object({ username: Username });

/** How long a player must be gone from a running game before the opponent may claim it. */
export const DISCONNECT_GRACE_MS = 30_000;

const Id = z.string().regex(/^[A-Za-z0-9]{8}$/);
const GameAction = (type: 'resign' | 'draw' | 'abort' | 'rematch' | 'cancelRematch') =>
  z.object({ type: z.literal(type), gameId: Id });

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('seek'), timeControl: z.enum(TIME_CONTROLS), rated: z.boolean() }),
  z.object({ type: z.literal('cancelSeek') }),
  z.object({
    type: z.literal('createChallenge'),
    timeControl: TimeControl,
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
  /** After a game: offers a rematch, or accepts the opponent's offer. */
  GameAction('rematch'),
  /** Withdraws your rematch offer, or declines the opponent's. */
  GameAction('cancelRematch'),
  /** After the opponent has been gone for the grace period: take the win, or settle for a draw. */
  z.object({ type: z.literal('claim'), gameId: Id, result: z.enum(['win', 'draw']) }),
  /** Joins an arena tournament and asks to be paired (`ready`), or pauses between games. */
  z.object({ type: z.literal('arena'), tournamentId: Id, ready: z.boolean() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface User {
  id: number;
  username: string;
  /** Rated play needs a verified email. */
  emailVerified: boolean;
}

export interface GamePlayer {
  /** Null for guests. */
  username: string | null;
  rating: number | null;
  provisional: boolean;
  ratingDiff: number | null;
}

export type Termination = 'line' | 'resign' | 'timeout' | 'agreement' | 'abort' | 'disconnect';

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
  /** How long each player has been disconnected, in ms, or null while they're here. */
  absence: Record<Player, number | null>;
  /** Null while the game is in progress. */
  termination: Termination | null;
  /** Null while in progress and for aborted games. */
  outcome: Outcome | null;
  /** The arena tournament the game belongs to, if any. */
  tournamentId: string | null;
}

export type ServerMessage =
  | { type: 'game'; game: GameState; you: Player | null }
  | { type: 'gameStarted'; gameId: string }
  | { type: 'challengeCreated'; id: string }
  /** Who has offered a rematch after `gameId`, or null once the offer is withdrawn or declined. */
  | { type: 'rematch'; gameId: string; by: Player | null }
  | { type: 'error'; message: string };
