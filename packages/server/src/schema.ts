import { CATEGORIES, REPORT_REASONS } from '@uttt/core';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    username: text().notNull(),
    email: text().notNull().unique(),
    passwordHash: text().notNull(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
    /** Null until the user follows the link in the verification email. */
    emailVerifiedAt: integer({ mode: 'timestamp_ms' }),
    /** Two-factor authentication: the TOTP secret, null when 2FA is off. */
    totpSecret: text(),
    /** The last time step a code was accepted for, so codes can't be replayed. */
    totpLastStep: integer(),
    /** JSON array of SHA-256 hashes of the unused recovery codes. */
    recoveryCodes: text({ mode: 'json' }).$type<string[]>(),
    /** Set when an admin closes the account for breaking the terms; it can't sign in until reopened. */
    closedAt: integer({ mode: 'timestamp_ms' }),
    closedReason: text(),
  },
  (t) => [uniqueIndex('users_username_lower').on(sql`lower(${t.username})`)],
);

export const sessions = sqliteTable('sessions', {
  /** SHA-256 of the session token; the token itself only lives in the user's cookie. */
  id: text().primaryKey(),
  userId: integer()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer({ mode: 'timestamp_ms' }).notNull(),
  /** Shown on the sessions page so users can tell their devices apart. */
  userAgent: text().notNull(),
});

/** Single-use links sent by email, to verify an address or reset a password. */
export const emailTokens = sqliteTable('email_tokens', {
  /** SHA-256 of the token; the token itself only exists in the email. */
  id: text().primaryKey(),
  userId: integer()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  purpose: text({ enum: ['verify', 'reset'] }).notNull(),
  expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
});

/** Glicko-2 ratings, one row per user and category. */
export const ratings = sqliteTable(
  'ratings',
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text({ enum: CATEGORIES }).notNull(),
    rating: real().notNull(),
    deviation: real().notNull(),
    volatility: real().notNull(),
    games: integer().notNull(),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.category] }),
    index('ratings_leaderboard').on(t.category, t.rating),
  ],
);

export const games = sqliteTable(
  'games',
  {
    id: text().primaryKey(),
    timeControl: text().notNull(),
    rated: integer({ mode: 'boolean' }).notNull(),
    /** Player keys (`u:<userId>` or `g:<guestId>`), so guests can reconnect after a restart. */
    xKey: text().notNull(),
    oKey: text().notNull(),
    xUserId: integer().references(() => users.id),
    oUserId: integer().references(() => users.id),
    xUsername: text(),
    oUsername: text(),
    xRating: integer(),
    oRating: integer(),
    xRatingDiff: integer(),
    oRatingDiff: integer(),
    /** UTN moves separated by spaces, e.g. `5-5 5-1 1-9`. */
    moves: text().notNull(),
    xClock: integer().notNull(),
    oClock: integer().notNull(),
    termination: text({ enum: ['line', 'resign', 'timeout', 'agreement', 'abort', 'disconnect'] }),
    outcome: text({ enum: ['x', 'o', 'draw'] }),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
    endedAt: integer({ mode: 'timestamp_ms' }),
  },
  (t) => [
    index('games_x_user').on(t.xUserId),
    index('games_o_user').on(t.oUserId),
    index('games_termination').on(t.termination),
  ],
);

/** Players reporting other players; admins review and resolve them. */
export const reports = sqliteTable(
  'reports',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /** Null once the reporter deletes their account; the report still stands. */
    reporterId: integer().references(() => users.id, { onDelete: 'set null' }),
    reportedId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text({ enum: REPORT_REASONS }).notNull(),
    details: text().notNull(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
    resolvedAt: integer({ mode: 'timestamp_ms' }),
  },
  (t) => [index('reports_open').on(t.resolvedAt)],
);

/** Every admin action, kept even if the admin's or the target's account is later deleted. */
export const auditLog = sqliteTable('audit_log', {
  id: integer().primaryKey({ autoIncrement: true }),
  admin: text().notNull(),
  action: text().notNull(),
  /** The affected username at the time, e.g. before a rename. */
  target: text().notNull(),
  details: text().notNull(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
});

/** Who follows whom; following shows a player's online status and games on your home page. */
export const follows = sqliteTable(
  'follows',
  {
    followerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followedId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followedId] }),
    index('follows_followed').on(t.followedId),
  ],
);

/** Blocked players are never paired with, challenged by, or offered rematches by the blocker. */
export const blocks = sqliteTable(
  'blocks',
  {
    blockerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index('blocks_blocked').on(t.blockedId),
  ],
);

/** A player's rating after each rated game, for the graphs on profiles. */
export const ratingHistory = sqliteTable(
  'rating_history',
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text({ enum: CATEGORIES }).notNull(),
    rating: integer().notNull(),
    at: integer({ mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('rating_history_user').on(t.userId, t.category, t.at)],
);
