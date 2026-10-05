import {
  RATING_KINDS,
  categoryOf,
  formatMove,
  isCorrespondence,
  parseMove,
  type Category,
  type GameState,
  type Outcome,
  type Player,
  type Puzzle,
  type RatingKind,
  type FeedbackKind,
  type ReportReason,
  type TimeControl,
  type User,
} from '@uttt/core';
import Database from 'better-sqlite3';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { alias } from 'drizzle-orm/sqlite-core';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { GameInit, LiveGame } from './game.ts';
import { DEFAULT_RATING, PROVISIONAL_DEVIATION, decay, rate, type Rating } from './glicko.ts';
import * as schema from './schema.ts';

const {
  users,
  sessions,
  emailTokens,
  ratings,
  games,
  reports,
  feedback,
  auditLog,
  follows,
  blocks,
  ratingHistory,
  tournaments,
  tournamentPlayers,
  puzzles,
  puzzleAttempts,
  correspondenceChallenges,
} = schema;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SESSION_DAYS = 30;
/** Players inactive for longer drop off the leaderboard (but keep their rating). */
const LEADERBOARD_ACTIVE_DAYS = 30;

export interface GameFilters {
  category?: Category;
  rated?: boolean;
  result?: 'win' | 'loss' | 'draw';
  opponent?: string;
  /** Only games started before this time, for the next page. */
  before?: Date;
}

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
    return { ...user, emailVerified: false, bot: false };
  }

  userByName(username: string) {
    return this.db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt,
        closedAt: users.closedAt,
        bot: users.bot,
      })
      .from(users)
      .where(eq(lower(users.username), username.toLowerCase()))
      .get();
  }

  // Bot accounts

  /** Turns an account into a bot, for good; only one that has played no games yet. */
  makeBot(userId: number): boolean {
    const played = this.db
      .select({ id: games.id })
      .from(games)
      .where(or(eq(games.xUserId, userId), eq(games.oUserId, userId)))
      .limit(1)
      .get();
    if (played) return false;
    this.db.update(users).set({ bot: true }).where(eq(users.id, userId)).run();
    return true;
  }

  /** Stores a new API token for a bot (replacing its old one), or revokes it with null. */
  setApiToken(userId: number, token: string | null): void {
    const apiTokenHash = token === null ? null : hashToken(token);
    this.db.update(users).set({ apiTokenHash }).where(eq(users.id, userId)).run();
  }

  /** The bot an API token belongs to, if the token is valid and the account open. */
  userByApiToken(token: string): User | undefined {
    const row = this.db
      .select({
        id: users.id,
        username: users.username,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(
        and(eq(users.apiTokenHash, hashToken(token)), eq(users.bot, true), isNull(users.closedAt)),
      )
      .get();
    if (!row) return undefined;
    return { id: row.id, username: row.username, emailVerified: !!row.emailVerifiedAt, bot: true };
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
        turnEmails: users.turnEmails,
        bot: users.bot,
        hasApiToken: sql<boolean>`${users.apiTokenHash} is not null`.mapWith(Boolean),
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();
  }

  setTurnEmails(userId: number, on: boolean): void {
    this.db.update(users).set({ turnEmails: on }).where(eq(users.id, userId)).run();
  }

  /** Where to tell a user it's their move: only a confirmed address, if they want these emails. */
  turnEmailTo(userId: number): { username: string; email: string } | undefined {
    return this.db
      .select({ username: users.username, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.turnEmails, true),
          isNotNull(users.emailVerifiedAt),
          isNull(users.closedAt),
        ),
      )
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
        bot: users.bot,
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
    return {
      id: row.id,
      username: row.username,
      emailVerified: row.emailVerifiedAt !== null,
      bot: row.bot,
    };
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
    this.db.transaction(() => {
      this.db.delete(ratings).where(eq(ratings.userId, userId)).run();
      this.db.delete(ratingHistory).where(eq(ratingHistory.userId, userId)).run();
    });
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

  createFeedback(entry: { userId: number; kind: FeedbackKind; text: string }): void {
    this.db
      .insert(feedback)
      .values({ ...entry, createdAt: new Date() })
      .run();
  }

  /** The player's own feedback, newest first. */
  feedbackBy(userId: number) {
    const { id, kind, text, createdAt, doneAt } = getTableColumns(feedback);
    return this.db
      .select({ id, kind, text, createdAt, doneAt })
      .from(feedback)
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.id))
      .all();
  }

  /** Feedback not yet dealt with, oldest first, with the sender's current username. */
  openFeedback() {
    return this.db
      .select({
        id: feedback.id,
        username: users.username,
        kind: feedback.kind,
        text: feedback.text,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .leftJoin(users, eq(feedback.userId, users.id))
      .where(isNull(feedback.doneAt))
      .orderBy(feedback.id)
      .all();
  }

  /** Marks feedback as dealt with; returns false if there was no open feedback with that id. */
  finishFeedback(id: number): boolean {
    const done = this.db
      .update(feedback)
      .set({ doneAt: new Date() })
      .where(and(eq(feedback.id, id), isNull(feedback.doneAt)))
      .returning({ id: feedback.id })
      .all();
    return done.length > 0;
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

  // Follows and blocks

  follow(followerId: number, followedId: number): void {
    this.db
      .insert(follows)
      .values({ followerId, followedId, createdAt: new Date() })
      .onConflictDoNothing()
      .run();
  }

  unfollow(followerId: number, followedId: number): void {
    this.db
      .delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followedId, followedId)))
      .run();
  }

  isFollowing(followerId: number, followedId: number): boolean {
    const row = this.db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followedId, followedId)))
      .get();
    return row !== undefined;
  }

  followerCount(userId: number): number {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followedId, userId))
      .get();
    return row?.count ?? 0;
  }

  /** The players `userId` follows, by name. */
  following(userId: number) {
    return this.db
      .select({ id: users.id, username: users.username })
      .from(follows)
      .innerJoin(users, eq(follows.followedId, users.id))
      .where(and(eq(follows.followerId, userId), isNull(users.closedAt)))
      .orderBy(lower(users.username))
      .all();
  }

  /** Blocking also ends follows both ways. */
  block(blockerId: number, blockedId: number): void {
    this.db.transaction(() => {
      this.db
        .insert(blocks)
        .values({ blockerId, blockedId, createdAt: new Date() })
        .onConflictDoNothing()
        .run();
      this.unfollow(blockerId, blockedId);
      this.unfollow(blockedId, blockerId);
    });
  }

  unblock(blockerId: number, blockedId: number): void {
    this.db
      .delete(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
      .run();
  }

  hasBlocked(blockerId: number, blockedId: number): boolean {
    const row = this.db
      .select()
      .from(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
      .get();
    return row !== undefined;
  }

  /** Player keys (`u:<id>`) the user must not be paired with: those they blocked, and those blocking them. */
  blockedKeys(userId: number): Set<string> {
    const rows = this.db
      .select({ blocker: blocks.blockerId, blocked: blocks.blockedId })
      .from(blocks)
      .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)))
      .all();
    return new Set(rows.map((row) => `u:${row.blocker === userId ? row.blocked : row.blocker}`));
  }

  // Tournaments

  createTournament(tournament: Omit<typeof tournaments.$inferInsert, 'createdAt'>): void {
    this.db
      .insert(tournaments)
      .values({ ...tournament, createdAt: new Date() })
      .run();
  }

  tournament(id: string) {
    return this.db
      .select({ ...getTableColumns(tournaments), creator: users.username })
      .from(tournaments)
      .leftJoin(users, eq(users.id, tournaments.createdBy))
      .where(eq(tournaments.id, id))
      .get();
  }

  /** How many of the player's tournaments haven't finished yet. */
  openTournamentsBy(userId: number): number {
    const row = this.db
      .select({ open: count() })
      .from(tournaments)
      .where(and(eq(tournaments.createdBy, userId), gt(tournaments.endsAt, new Date())))
      .get();
    return row?.open ?? 0;
  }

  /** Tournaments not yet over (soonest first), and the most recent finished ones. */
  tournamentList() {
    const now = new Date();
    const players = sql<number>`(select count(*) from ${tournamentPlayers}
      where ${tournamentPlayers.tournamentId} = ${tournaments.id})`;
    const columns = { ...getTableColumns(tournaments), players, creator: users.username };
    const list = () =>
      this.db
        .select(columns)
        .from(tournaments)
        .leftJoin(users, eq(users.id, tournaments.createdBy));
    return {
      current: list().where(gt(tournaments.endsAt, now)).orderBy(tournaments.startsAt).all(),
      finished: list()
        .where(lte(tournaments.endsAt, now))
        .orderBy(desc(tournaments.endsAt))
        .limit(10)
        .all(),
    };
  }

  /** Removes a tournament that hasn't started; returns whether there was one. */
  cancelTournament(id: string): boolean {
    const removed = this.db
      .delete(tournaments)
      .where(and(eq(tournaments.id, id), gt(tournaments.startsAt, new Date())))
      .returning({ id: tournaments.id })
      .all();
    return removed.length > 0;
  }

  joinTournament(tournamentId: string, userId: number): void {
    this.db
      .insert(tournamentPlayers)
      .values({ tournamentId, userId, joinedAt: new Date() })
      .onConflictDoNothing()
      .run();
  }

  /**
   * Everyone who joined, best first: 2 points per win and 1 per draw in the tournament's finished games
   * (aborted games don't count); fewer games breaks ties.
   */
  standings(
    tournamentId: string,
  ): { userId: number; username: string; score: number; games: number }[] {
    return this.db.all(sql`
      select ${users.id} as userId, ${users.username} as username,
        coalesce(sum(case
          when ${games.outcome} = 'draw' then 1
          when (${games.outcome} = 'x' and ${games.xUserId} = ${users.id})
            or (${games.outcome} = 'o' and ${games.oUserId} = ${users.id}) then 2
          else 0 end), 0) as score,
        count(${games.id}) as games
      from ${tournamentPlayers}
      join ${users} on ${users.id} = ${tournamentPlayers.userId}
      left join ${games} on ${games.tournamentId} = ${tournamentPlayers.tournamentId}
        and (${games.xUserId} = ${users.id} or ${games.oUserId} = ${users.id})
        and ${games.termination} is not null and ${games.termination} != 'abort'
      where ${tournamentPlayers.tournamentId} = ${tournamentId}
      group by ${users.id}
      order by score desc, games asc, lower(${users.username})
    `);
  }

  // Ratings

  /** A player's current rating, with deviation grown for the time they've been inactive. */
  rating(userId: number, category: RatingKind): PlayerRating {
    const row = this.db
      .select()
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.category, category)))
      .get();
    if (!row) return { ...DEFAULT_RATING, games: 0, provisional: true };
    const current = decay(row, (Date.now() - row.updatedAt.getTime()) / DAY_MS);
    return { ...current, games: row.games, provisional: current.deviation > PROVISIONAL_DEVIATION };
  }

  ratings(userId: number): Record<RatingKind, PlayerRating> {
    return Object.fromEntries(RATING_KINDS.map((c) => [c, this.rating(userId, c)])) as Record<
      RatingKind,
      PlayerRating
    >;
  }

  /** Stores a player's new rating, and adds it to their history. */
  private saveRating(
    userId: number,
    category: RatingKind,
    rating: Rating,
    games: number,
    at: Date,
  ): void {
    const values = { ...rating, games, updatedAt: at };
    this.db
      .insert(ratings)
      .values({ userId, category, ...values })
      .onConflictDoUpdate({ target: [ratings.userId, ratings.category], set: values })
      .run();
    this.db
      .insert(ratingHistory)
      .values({ userId, category, rating: Math.round(rating.rating), at })
      .run();
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
      const now = new Date();
      for (const side of ['x', 'o'] as const) {
        this.saveRating(userIds[side], category, after[side], before[side].games + 1, now);
      }
      const diff = (side: Player) =>
        Math.round(after[side].rating) - Math.round(before[side].rating);
      return { x: diff('x'), o: diff('o') };
    });
  }

  /** Each kind's rating after every rated game or puzzle, oldest first. */
  ratingHistory(userId: number): Record<RatingKind, { rating: number; at: Date }[]> {
    const rows = this.db
      .select()
      .from(ratingHistory)
      .where(eq(ratingHistory.userId, userId))
      .orderBy(ratingHistory.at)
      .all();
    return Object.fromEntries(
      RATING_KINDS.map((category) => [
        category,
        rows.filter((row) => row.category === category).map(({ rating, at }) => ({ rating, at })),
      ]),
    ) as Record<RatingKind, { rating: number; at: Date }[]>;
  }

  // Correspondence challenges

  createCorrespondenceChallenge(
    challenge: Omit<typeof correspondenceChallenges.$inferInsert, 'createdAt'>,
  ): void {
    this.db
      .insert(correspondenceChallenges)
      .values({ ...challenge, createdAt: new Date() })
      .run();
  }

  correspondenceChallenge(id: string) {
    return this.db
      .select({
        ...getTableColumns(correspondenceChallenges),
        username: users.username,
      })
      .from(correspondenceChallenges)
      .innerJoin(users, eq(correspondenceChallenges.userId, users.id))
      .where(eq(correspondenceChallenges.id, id))
      .get();
  }

  /** The challenges listed in the lobby (oldest first), or the ones `userId` made. */
  correspondenceChallenges(userId?: number) {
    return this.db
      .select({
        ...getTableColumns(correspondenceChallenges),
        username: users.username,
      })
      .from(correspondenceChallenges)
      .innerJoin(users, eq(correspondenceChallenges.userId, users.id))
      .where(
        userId === undefined
          ? and(eq(correspondenceChallenges.listed, true), isNull(users.closedAt))
          : eq(correspondenceChallenges.userId, userId),
      )
      .orderBy(correspondenceChallenges.createdAt)
      .all();
  }

  /** Removes a challenge; false if it was already gone (e.g. someone else accepted it first). */
  deleteCorrespondenceChallenge(id: string): boolean {
    const result = this.db
      .delete(correspondenceChallenges)
      .where(eq(correspondenceChallenges.id, id))
      .run();
    return result.changes > 0;
  }

  // Puzzles

  /** Adds the puzzles that aren't stored yet, starting at the given ratings. */
  addPuzzles(list: (Puzzle & Rating)[]): void {
    this.db.insert(puzzles).values(list).onConflictDoNothing().run();
  }

  puzzle(id: number) {
    return this.db.select().from(puzzles).where(eq(puzzles.id, id)).get();
  }

  /**
   * Today's puzzle, the same for everyone: days since 1970 (UTC), wrapped around the puzzles of two moves
   * or more (one-movers are too plain to feature).
   */
  dailyPuzzle() {
    const featured = gte(puzzles.winIn, 2);
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(puzzles)
      .where(featured)
      .get();
    return this.db
      .select()
      .from(puzzles)
      .where(featured)
      .orderBy(puzzles.id)
      .limit(1)
      .offset(Math.floor(Date.now() / DAY_MS) % (row?.count ?? 1))
      .get();
  }

  randomPuzzle() {
    return this.db
      .select()
      .from(puzzles)
      .orderBy(sql`random()`)
      .limit(1)
      .get();
  }

  /** The puzzles `userId` hasn't tried that are rated nearest to `rating`. */
  puzzlesNear(userId: number, rating: number, limit: number) {
    const tried = this.db
      .select({ id: puzzleAttempts.puzzleId })
      .from(puzzleAttempts)
      .where(eq(puzzleAttempts.userId, userId));
    return this.db
      .select()
      .from(puzzles)
      .where(notInArray(puzzles.id, tried))
      .orderBy(sql`abs(${puzzles.rating} - ${rating})`)
      .limit(limit)
      .all();
  }

  triedPuzzle(userId: number, puzzleId: number): boolean {
    const row = this.db
      .select()
      .from(puzzleAttempts)
      .where(and(eq(puzzleAttempts.userId, userId), eq(puzzleAttempts.puzzleId, puzzleId)))
      .get();
    return row !== undefined;
  }

  /** Every puzzle the user tried, for their data export. */
  puzzleAttempts(userId: number) {
    return this.db
      .select({
        puzzleId: puzzleAttempts.puzzleId,
        solved: puzzleAttempts.solved,
        at: puzzleAttempts.at,
      })
      .from(puzzleAttempts)
      .where(eq(puzzleAttempts.userId, userId))
      .orderBy(puzzleAttempts.at)
      .all();
  }

  /**
   * Records a user's try at a puzzle. The first try rates both, like a game the user wins by solving it;
   * returns the user's rating change, or null for a later try, which isn't rated.
   */
  ratePuzzle(userId: number, puzzleId: number, solved: boolean): number | null {
    return this.db.transaction(() => {
      const at = new Date();
      const first = this.db
        .insert(puzzleAttempts)
        .values({ userId, puzzleId, solved, at })
        .onConflictDoNothing()
        .run();
      const puzzle = this.puzzle(puzzleId);
      if (first.changes === 0 || !puzzle) return null;
      const before = this.rating(userId, 'puzzle');
      const score = solved ? 1 : 0;
      const after = rate(before, [{ opponent: puzzle, score }]);
      this.db
        .update(puzzles)
        .set({ ...rate(puzzle, [{ opponent: before, score: 1 - score }]), plays: puzzle.plays + 1 })
        .where(eq(puzzles.id, puzzleId))
        .run();
      this.saveRating(userId, 'puzzle', after, before.games + 1, at);
      return Math.round(after.rating) - Math.round(before.rating);
    });
  }

  /** The leaderboard of people, or of bots: the two are ranked apart. */
  leaderboard(category: Category, bots = false, limit = 50) {
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
          eq(users.bot, bots),
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
      clockHistory: game.clockHistory.join(' '),
      xClock: game.clocks.x,
      oClock: game.clocks.o,
      xRatingDiff: seats.x.ratingDiff,
      oRatingDiff: seats.o.ratingDiff,
      termination: game.termination,
      outcome: game.outcome,
      endedAt: game.termination ? new Date() : null,
      turnStartedAt: new Date(game.turnStartedAt),
    };
    this.db
      .insert(games)
      .values({
        id: game.id,
        timeControl: game.timeControl,
        category: categoryOf(game.timeControl),
        rated: game.rated,
        xKey: seats.x.key,
        oKey: seats.o.key,
        xUserId: seats.x.userId,
        oUserId: seats.o.userId,
        xUsername: seats.x.username,
        oUsername: seats.o.username,
        xBot: seats.x.bot,
        oBot: seats.o.bot,
        xRating: seats.x.rating,
        oRating: seats.o.rating,
        tournamentId: game.tournamentId,
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

  /** The most recently finished game that was played out (not aborted), for the lobby. */
  lastFinishedGame(): GameState | undefined {
    const row = this.db
      .select()
      .from(games)
      .where(and(isNotNull(games.endedAt), ne(games.termination, 'abort')))
      .orderBy(desc(games.endedAt))
      .limit(1)
      .get();
    return row && toState(row);
  }

  /**
   * A player's games, newest first, a page at a time (`before` is the last page's oldest `createdAt`),
   * filtered by category, rated or casual, result for this player, and opponent. Games in progress are
   * included; aborted ones are left out.
   */
  playerGames(userId: number, filters: GameFilters, limit = 30) {
    const asX = eq(games.xUserId, userId);
    const asO = eq(games.oUserId, userId);
    const won = or(and(asX, eq(games.outcome, 'x')), and(asO, eq(games.outcome, 'o')));
    const lost = or(and(asX, eq(games.outcome, 'o')), and(asO, eq(games.outcome, 'x')));
    const opponent = filters.opponent?.toLowerCase();
    const where = and(
      or(asX, asO),
      or(isNull(games.termination), ne(games.termination, 'abort')),
      filters.category ? eq(games.category, filters.category) : undefined,
      filters.rated === undefined ? undefined : eq(games.rated, filters.rated),
      filters.result === 'win' ? won : undefined,
      filters.result === 'loss' ? lost : undefined,
      filters.result === 'draw' ? eq(games.outcome, 'draw') : undefined,
      opponent
        ? or(
            and(asX, sql`lower(${games.oUsername}) = ${opponent}`),
            and(asO, sql`lower(${games.xUsername}) = ${opponent}`),
          )
        : undefined,
    );
    const total =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(games)
        .where(where)
        .get()?.count ?? 0;
    const rows = this.db
      .select()
      .from(games)
      .where(and(where, filters.before ? lt(games.createdAt, filters.before) : undefined))
      .orderBy(desc(games.createdAt))
      .limit(limit)
      .all();
    return {
      total,
      games: rows.map((row) => ({ ...toState(row), createdAt: row.createdAt })),
      next: rows.length === limit ? (rows.at(-1)?.createdAt.getTime() ?? null) : null,
    };
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
const parseClocks = (clocks: string | null) => (clocks ? clocks.split(' ').map(Number) : []);

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
    clockHistory: parseClocks(row.clockHistory),
    tournamentId: row.tournamentId,
    // A correspondence deadline keeps counting while the server is down; live games get the time back.
    turnStartedAt:
      isCorrespondence(row.timeControl as TimeControl) && row.turnStartedAt
        ? row.turnStartedAt.getTime()
        : undefined,
  };
}

/** The state of a stored game, as sent to clients. */
export function toState(row: GameRow): GameState {
  const player = (side: Player) => ({
    username: row[`${side}Username` as const],
    bot: row[`${side}Bot` as const],
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
    clockHistory: parseClocks(row.clockHistory),
    clocks: { x: row.xClock, o: row.oClock },
    running: null,
    drawOffer: null,
    absence: { x: null, o: null },
    termination: row.termination,
    outcome: row.outcome,
    tournamentId: row.tournamentId,
  };
}
