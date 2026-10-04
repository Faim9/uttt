import {
  CATEGORIES,
  formatMove,
  parseMove,
  type Category,
  type GameState,
  type Outcome,
  type Player,
  type ReportReason,
  type TimeControl,
  type User,
} from '@uttt/core';
import Database from 'better-sqlite3';
import { and, desc, eq, gt, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { alias } from 'drizzle-orm/sqlite-core';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { GameInit, LiveGame } from './game.ts';
import { DEFAULT_RATING, PROVISIONAL_DEVIATION, decay, rate, type Rating } from './glicko.ts';
import * as schema from './schema.ts';

const { users, sessions, emailTokens, ratings, games, reports, auditLog } = schema;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SESSION_DAYS = 30;
/** Players inactive for longer drop off the leaderboard (but keep their rating). */
const LEADERBOARD_ACTIVE_DAYS = 30;

export interface PlayerRating extends Rating {
  games: number;
  provisional: boolean;
}

type GameRow = typeof games.$inferSelect;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const lower = (column: typeof users.username) => sql`lower(${column})`;

/** All database access. SQLite through Drizzle; schema migrations run on startup. */
export class Store {
  private readonly db;

  private readonly sqlite: Database.Database;

  constructor(path: string) {
    const sqlite = new Database(path);
    this.sqlite = sqlite;
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    this.db = drizzle({ client: sqlite, schema, casing: 'snake_case' });
    migrate(this.db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  }

  close(): void {
    this.sqlite.close();
  }

  /** Throws if the database is unusable. */
  ping(): void {
    this.db.run(sql`select 1`);
  }

  // Users and sessions

  createUser(username: string, email: string, passwordHash: string): User {
    const user = this.db
      .insert(users)
      .values({ username, email: email.toLowerCase(), passwordHash, createdAt: new Date() })
      .returning({ id: users.id, username: users.username })
      .get();
    return { ...user, emailVerified: false };
  }

  userByName(username: string) {
    return this.db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt,
        closedAt: users.closedAt,
      })
      .from(users)
      .where(eq(lower(users.username), username.toLowerCase()))
      .get();
  }

  emailTaken(email: string): boolean {
    return !!this.db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }

  /** Finds a user by username or email, including the password hash. */
  userByLogin(login: string) {
    const key = login.toLowerCase();
    return this.db
      .select()
      .from(users)
      .where(or(eq(lower(users.username), key), eq(users.email, key)))
      .get();
  }

  account(userId: number) {
    return this.db
      .select({
        username: users.username,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        closedAt: users.closedAt,
        closedReason: users.closedReason,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();
  }

  userByEmail(email: string) {
    return this.db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .get();
  }

  markEmailVerified(userId: number): void {
    this.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId)).run();
  }

  /** Returns a new single-use token for an emailed link, replacing earlier ones for the same purpose. */
  createEmailToken(userId: number, purpose: 'verify' | 'reset', ttlMs: number): string {
    const token = randomBytes(32).toString('base64url');
    const sameKind = and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose));
    this.db.delete(emailTokens).where(sameKind).run();
    this.db
      .insert(emailTokens)
      .values({ id: hashToken(token), userId, purpose, expiresAt: new Date(Date.now() + ttlMs) })
      .run();
    return token;
  }

  /** Consumes an emailed token, returning its user if it was valid and unexpired. */
  useEmailToken(token: string, purpose: 'verify' | 'reset'): number | undefined {
    const row = this.db
      .delete(emailTokens)
      .where(and(eq(emailTokens.id, hashToken(token)), eq(emailTokens.purpose, purpose)))
      .returning()
      .get();
    return row && row.expiresAt.getTime() > Date.now() ? row.userId : undefined;
  }

  /** The user's two-factor settings, or null when two-factor authentication is off. */
  twoFactor(userId: number) {
    const row = this.db
      .select({
        secret: users.totpSecret,
        lastStep: users.totpLastStep,
        recoveryCodes: users.recoveryCodes,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!row?.secret) return null;
    return {
      secret: row.secret,
      lastStep: row.lastStep ?? -1,
      recoveryCodes: row.recoveryCodes ?? [],
    };
  }

  /** Turns two-factor on, given the step of the code that proved setup worked. */
  enableTwoFactor(
    userId: number,
    secret: string,
    step: number,
    recoveryCodeHashes: string[],
  ): void {
    this.db
      .update(users)
      .set({ totpSecret: secret, totpLastStep: step, recoveryCodes: recoveryCodeHashes })
      .where(eq(users.id, userId))
      .run();
  }

  disableTwoFactor(userId: number): void {
    this.db
      .update(users)
      .set({ totpSecret: null, totpLastStep: null, recoveryCodes: null })
      .where(eq(users.id, userId))
      .run();
  }

  /** Records a used code's step, or the recovery codes left, after a successful second factor. */
  useSecondFactor(userId: number, used: { step: number } | { recoveryCodes: string[] }): void {
    const values =
      'step' in used ? { totpLastStep: used.step } : { recoveryCodes: used.recoveryCodes };
    this.db.update(users).set(values).where(eq(users.id, userId)).run();
  }

  passwordHash(userId: number): string | undefined {
    const row = this.db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return row?.hash;
  }

  setPassword(userId: number, passwordHash: string): void {
    this.db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
  }

  /** Returns a new session token. Only its hash is stored. */
  createSession(userId: number, userAgent: string): string {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    this.db
      .insert(sessions)
      .values({
        id: hashToken(token),
        userId,
        expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS),
        createdAt: now,
        lastSeenAt: now,
        userAgent: userAgent.slice(0, 300),
      })
      .run();
    return token;
  }

  /**
   * Resolves a session token to its user. Sessions halfway to expiry are extended, and "last seen" is
   * updated at most hourly, so most requests don't write.
   */
  userBySession(token: string): User | undefined {
    const id = hashToken(token);
    const row = this.db
      .select({
        id: users.id,
        username: users.username,
        emailVerifiedAt: users.emailVerifiedAt,
        closedAt: users.closedAt,
        expiresAt: sessions.expiresAt,
        lastSeenAt: sessions.lastSeenAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, id))
      .get();
    if (!row || row.closedAt) return undefined;

    const now = Date.now();
    const remainingMs = row.expiresAt.getTime() - now;
    if (remainingMs <= 0) {
      this.db.delete(sessions).where(eq(sessions.id, id)).run();
      return undefined;
    }
    if (remainingMs < (SESSION_DAYS / 2) * DAY_MS || now - row.lastSeenAt.getTime() > HOUR_MS) {
      const expiresAt = new Date(now + SESSION_DAYS * DAY_MS);
      this.db
        .update(sessions)
        .set({ expiresAt, lastSeenAt: new Date(now) })
        .where(eq(sessions.id, id))
        .run();
    }
    return { id: row.id, username: row.username, emailVerified: row.emailVerifiedAt !== null };
  }

  /** The user's signed-in devices, newest activity first; `current` marks the one making the request. */
  sessions(userId: number, currentToken: string) {
    const currentId = hashToken(currentToken);
    return this.db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastSeenAt))
      .all()
      .map((session) => ({ ...session, current: session.id === currentId }));
  }

  deleteSession(token: string): void {
    this.db
      .delete(sessions)
      .where(eq(sessions.id, hashToken(token)))
      .run();
  }

  /** Signs out one of the user's sessions by its id, as listed by `sessions`; returns the ids removed. */
  deleteSessionById(userId: number, id: string): string[] {
    return this.db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.id, id)))
      .returning({ id: sessions.id })
      .all()
      .map((row) => row.id);
  }

  /** Signs out all the user's sessions except the one holding `keepToken`; returns the ids removed. */
  deleteOtherSessions(userId: number, keepToken?: string): string[] {
    const keep = keepToken ? ne(sessions.id, hashToken(keepToken)) : undefined;
    return this.db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), keep))
      .returning({ id: sessions.id })
      .all()
      .map((row) => row.id);
  }

  // Moderation

  /** Closes an account for breaking the terms: signed out everywhere; returns the sessions removed. */
  closeAccount(userId: number, reason: string): string[] {
    this.db
      .update(users)
      .set({ closedAt: new Date(), closedReason: reason })
      .where(eq(users.id, userId))
      .run();
    return this.deleteOtherSessions(userId);
  }

  reopenAccount(userId: number): void {
    this.db
      .update(users)
      .set({ closedAt: null, closedReason: null })
      .where(eq(users.id, userId))
      .run();
  }

  /** Renames a user, including on their past games. */
  rename(userId: number, username: string): void {
    this.db.transaction(() => {
      this.db.update(users).set({ username }).where(eq(users.id, userId)).run();
      this.db.update(games).set({ xUsername: username }).where(eq(games.xUserId, userId)).run();
      this.db.update(games).set({ oUsername: username }).where(eq(games.oUserId, userId)).run();
    });
  }

  /** Back to a provisional 1500 in every category. */
  resetRatings(userId: number): void {
    this.db.delete(ratings).where(eq(ratings.userId, userId)).run();
  }

  createReport(report: {
    reporterId: number;
    reportedId: number;
    reason: ReportReason;
    details: string;
  }): void {
    this.db
      .insert(reports)
      .values({ ...report, createdAt: new Date() })
      .run();
  }

  /** Unresolved reports, oldest first, with both players' current usernames. */
  openReports() {
    const reporter = alias(users, 'reporter');
    return this.db
      .select({
        id: reports.id,
        reporter: reporter.username,
        reported: users.username,
        reason: reports.reason,
        details: reports.details,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .innerJoin(users, eq(reports.reportedId, users.id))
      .leftJoin(reporter, eq(reports.reporterId, reporter.id))
      .where(isNull(reports.resolvedAt))
      .orderBy(reports.createdAt)
      .all();
  }

  /** Marks a report as dealt with; returns false if there was no open report with that id. */
  resolveReport(id: number): boolean {
    const resolved = this.db
      .update(reports)
      .set({ resolvedAt: new Date() })
      .where(and(eq(reports.id, id), isNull(reports.resolvedAt)))
      .returning({ id: reports.id })
      .all();
    return resolved.length > 0;
  }

  logAdminAction(entry: { admin: string; action: string; target: string; details: string }): void {
    this.db
      .insert(auditLog)
      .values({ ...entry, createdAt: new Date() })
      .run();
  }

  adminLog(limit = 100) {
    return this.db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit).all();
  }

  // Ratings

  /** A player's current rating, with deviation grown for the time they've been inactive. */
  rating(userId: number, category: Category): PlayerRating {
    const row = this.db
      .select()
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.category, category)))
      .get();
    if (!row) return { ...DEFAULT_RATING, games: 0, provisional: true };
    const current = decay(row, (Date.now() - row.updatedAt.getTime()) / DAY_MS);
    return { ...current, games: row.games, provisional: current.deviation > PROVISIONAL_DEVIATION };
  }

  ratings(userId: number): Record<Category, PlayerRating> {
    return Object.fromEntries(CATEGORIES.map((c) => [c, this.rating(userId, c)])) as Record<
      Category,
      PlayerRating
    >;
  }

  /** Updates both players' ratings after a rated game and returns their rating changes. */
  rateGame(
    userIds: Record<Player, number>,
    category: Category,
    outcome: Outcome,
  ): Record<Player, number> {
    return this.db.transaction(() => {
      const before = { x: this.rating(userIds.x, category), o: this.rating(userIds.o, category) };
      const xScore = outcome === 'x' ? 1 : outcome === 'draw' ? 0.5 : 0;
      const after = {
        x: rate(before.x, [{ opponent: before.o, score: xScore }]),
        o: rate(before.o, [{ opponent: before.x, score: 1 - xScore }]),
      };
      for (const side of ['x', 'o'] as const) {
        const values = { ...after[side], games: before[side].games + 1, updatedAt: new Date() };
        this.db
          .insert(ratings)
          .values({ userId: userIds[side], category, ...values })
          .onConflictDoUpdate({ target: [ratings.userId, ratings.category], set: values })
          .run();
      }
      const diff = (side: Player) =>
        Math.round(after[side].rating) - Math.round(before[side].rating);
      return { x: diff('x'), o: diff('o') };
    });
  }

  leaderboard(category: Category, limit = 50) {
    const activeSince = new Date(Date.now() - LEADERBOARD_ACTIVE_DAYS * DAY_MS);
    return this.db
      .select({ username: users.username, rating: ratings.rating, games: ratings.games })
      .from(ratings)
      .innerJoin(users, eq(ratings.userId, users.id))
      .where(
        and(
          eq(ratings.category, category),
          lte(ratings.deviation, PROVISIONAL_DEVIATION),
          gt(ratings.updatedAt, activeSince),
          isNull(users.closedAt),
        ),
      )
      .orderBy(desc(ratings.rating))
      .limit(limit)
      .all()
      .map((row) => ({ ...row, rating: Math.round(row.rating) }));
  }

  // Games

  saveGame(game: LiveGame): void {
    const { seats } = game;
    const values = {
      moves: game.moves.map(formatMove).join(' '),
      xClock: game.clocks.x,
      oClock: game.clocks.o,
      xRatingDiff: seats.x.ratingDiff,
      oRatingDiff: seats.o.ratingDiff,
      termination: game.termination,
      outcome: game.outcome,
      endedAt: game.termination ? new Date() : null,
    };
    this.db
      .insert(games)
      .values({
        id: game.id,
        timeControl: game.timeControl,
        rated: game.rated,
        xKey: seats.x.key,
        oKey: seats.o.key,
        xUserId: seats.x.userId,
        oUserId: seats.o.userId,
        xUsername: seats.x.username,
        oUsername: seats.o.username,
        xRating: seats.x.rating,
        oRating: seats.o.rating,
        createdAt: new Date(),
        ...values,
      })
      .onConflictDoUpdate({ target: games.id, set: values })
      .run();
  }

  game(id: string): GameRow | undefined {
    return this.db.select().from(games).where(eq(games.id, id)).get();
  }

  /** Games that were in progress when the server last stopped. */
  activeGames(): GameInit[] {
    return this.db.select().from(games).where(isNull(games.termination)).all().map(toInit);
  }

  /**
   * Deletes an account and everything tied to it (sessions, ratings, email links). Its games stay, since
   * they're also the opponents' records, but are anonymized.
   */
  deleteUser(userId: number): void {
    this.db.transaction(() => {
      this.db
        .update(games)
        .set({ xUserId: null, xUsername: null, xKey: 'deleted' })
        .where(eq(games.xUserId, userId))
        .run();
      this.db
        .update(games)
        .set({ oUserId: null, oUsername: null, oKey: 'deleted' })
        .where(eq(games.oUserId, userId))
        .run();
      this.db.delete(users).where(eq(users.id, userId)).run();
    });
  }

  /** Every game the user played, for their data export. */
  allGames(userId: number): GameState[] {
    return this.db
      .select()
      .from(games)
      .where(or(eq(games.xUserId, userId), eq(games.oUserId, userId)))
      .orderBy(desc(games.createdAt))
      .all()
      .map(toState);
  }

  recentGames(userId: number, limit = 20): GameState[] {
    return this.db
      .select()
      .from(games)
      .where(
        and(
          or(eq(games.xUserId, userId), eq(games.oUserId, userId)),
          ne(games.termination, 'abort'),
        ),
      )
      .orderBy(desc(games.createdAt))
      .limit(limit)
      .all()
      .map(toState);
  }
}

const parseMoves = (moves: string) => (moves ? moves.split(' ').map(parseMove) : []);

function toInit(row: GameRow): GameInit {
  const seat = (side: Player) => ({
    key: row[`${side}Key` as const],
    userId: row[`${side}UserId` as const],
    ...toState(row).players[side],
  });
  return {
    id: row.id,
    timeControl: row.timeControl as TimeControl,
    rated: row.rated,
    seats: { x: seat('x'), o: seat('o') },
    moves: parseMoves(row.moves),
    clocks: { x: row.xClock, o: row.oClock },
  };
}

/** The state of a stored game, as sent to clients. */
export function toState(row: GameRow): GameState {
  const player = (side: Player) => ({
    username: row[`${side}Username` as const],
    rating: row[`${side}Rating` as const],
    provisional: false,
    ratingDiff: row[`${side}RatingDiff` as const],
  });
  return {
    id: row.id,
    timeControl: row.timeControl as TimeControl,
    rated: row.rated,
    players: { x: player('x'), o: player('o') },
    moves: parseMoves(row.moves),
    clocks: { x: row.xClock, o: row.oClock },
    running: null,
    drawOffer: null,
    absence: { x: null, o: null },
    termination: row.termination,
    outcome: row.outcome,
  };
}
