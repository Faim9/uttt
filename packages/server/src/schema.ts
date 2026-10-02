import { CATEGORIES } from '@uttt/core';
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
    termination: text({ enum: ['line', 'resign', 'timeout', 'agreement', 'abort'] }),
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
