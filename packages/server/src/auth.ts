import { hash, verify } from '@node-rs/argon2';
import {
  EmailTokenBody,
  LoginBody,
  ResetPasswordBody,
  ResetRequestBody,
  SignupBody,
  type User,
} from '@uttt/core';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { BREACHED_MESSAGE, type BreachCheck } from './breach.ts';
import { NOT_HUMAN_MESSAGE, type HumanCheck } from './captcha.ts';
import type { Emails } from './email.ts';
import type { Hub } from './hub.ts';
import { hashToken, type Store } from './store.ts';
import { hashRecoveryCode, matchingStep } from './two-factor.ts';

/** What the HTTP routes depend on. */
export interface Services {
  store: Store;
  hub: Hub;
  isBreached: BreachCheck;
  isHuman: HumanCheck;
  emails: Emails;
  /** Lower-case emails of the admin accounts; see moderation.ts. */
  adminEmails: string[];
  /**
   * Wrong second-factor codes per user. Per-address rate limits alone would let someone who has the
   * password guess the 6-digit code from many addresses.
   */
  secondFactorFailures: Map<number, { count: number; since: number }>;
}

/** Sends email in the background: a slow or failing mail server must not fail the request. */
export function deliver(request: FastifyRequest, email: Promise<void>): void {
  email.catch((error) => request.log.error(error, 'Email delivery failed'));
}

const MAX_SECOND_FACTOR_FAILURES = 5;
const SECOND_FACTOR_LOCK_MS = 15 * 60_000;

/**
 * Checks a second factor: a current authenticator code, or an unused recovery code (used up here).
 * After too many wrong codes, throws until the lock expires.
 */
export function checkSecondFactor(
  { store, secondFactorFailures }: Services,
  userId: number,
  code: string,
): boolean {
  const twoFactor = store.twoFactor(userId);
  if (!twoFactor) return true;
  const last = secondFactorFailures.get(userId);
  const failures = last && Date.now() - last.since < SECOND_FACTOR_LOCK_MS ? last : null;
  if (failures && failures.count >= MAX_SECOND_FACTOR_FAILURES) {
    const error = new Error('Too many wrong codes. Try again in 15 minutes.');
    throw Object.assign(error, { statusCode: 429 });
  }

  const step = matchingStep(twoFactor.secret, code.trim(), twoFactor.lastStep);
  const hash = hashRecoveryCode(code);
  if (step !== null) {
    store.useSecondFactor(userId, { step });
  } else if (twoFactor.recoveryCodes.includes(hash)) {
    const recoveryCodes = twoFactor.recoveryCodes.filter((h) => h !== hash);
    store.useSecondFactor(userId, { recoveryCodes });
  } else {
    const count = (failures?.count ?? 0) + 1;
    secondFactorFailures.set(userId, { count, since: failures?.since ?? Date.now() });
    return false;
  }
  secondFactorFailures.delete(userId);
  return true;
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, cookie);
}

/** Who is behind a request: a signed-in user, or a guest identified by a random cookie. */
export interface Identity {
  /** `u:<userId>` or `g:<guestId>`; this is what a game seat belongs to. */
  key: string;
  user: User | null;
  /** Hash of the session token, for signed-in users; lets revoked sessions be disconnected. */
  sessionId: string | null;
}

const SESSION_COOKIE = 'session';
const GUEST_COOKIE = 'guest';
const GUEST_ID = /^[A-Za-z0-9_-]{22}$/;
const YEAR_SECONDS = 365 * 24 * 3600;
/** For endpoints that check passwords or send email. */
export const strictLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

const cookie: CookieSerializeOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

/** Login attempts for unknown users still run a verification, so timing doesn't reveal which users exist. */
const DUMMY_HASH = await hash('not-a-real-password');

/** The signed-in user and their session token, or null for guests. */
export function signedIn(
  store: Store,
  request: FastifyRequest,
): { user: User; token: string } | null {
  const token = request.cookies[SESSION_COOKIE];
  const user = token ? store.userBySession(token) : undefined;
  return token && user ? { user, token } : null;
}

export function identify(store: Store, request: FastifyRequest): Identity | null {
  const session = signedIn(store, request);
  if (session) {
    const { user, token } = session;
    return { key: `u:${user.id}`, user, sessionId: hashToken(token) };
  }
  const guest = request.cookies[GUEST_COOKIE];
  return guest && GUEST_ID.test(guest) ? { key: `g:${guest}`, user: null, sessionId: null } : null;
}

export const authRoutes =
  (services: Services): FastifyPluginAsync =>
  async (app) => {
    const { store, hub, isBreached, isHuman, emails } = services;
    function startSession(request: FastifyRequest, reply: FastifyReply, user: User) {
      const token = store.createSession(user.id, request.headers['user-agent'] ?? 'Unknown device');
      reply.setCookie(SESSION_COOKIE, token, { ...cookie, maxAge: 30 * 24 * 3600 });
      return { user };
    }

    /** Also hands out a guest cookie on first visit, so guests can play and reconnect. */
    app.get('/api/me', async (request, reply) => {
      const identity = identify(store, request);
      if (!identity) {
        const guestId = randomBytes(16).toString('base64url');
        reply.setCookie(GUEST_COOKIE, guestId, { ...cookie, maxAge: YEAR_SECONDS });
      }
      return { user: identity?.user ?? null };
    });

    /** The public Turnstile key the sign-up form needs, or null when the check is off. */
    app.get('/api/captcha', async () => ({ siteKey: process.env.TURNSTILE_SITE_KEY ?? null }));

    app.post('/api/signup', strictLimit, async (request, reply) => {
      const { username, email, password, captcha } = SignupBody.parse(request.body);
      // First, so scripts can't use sign-up to find out which emails are registered.
      if (!(await isHuman(captcha))) return reply.code(400).send({ error: NOT_HUMAN_MESSAGE });
      if (store.userByName(username)) {
        return reply.code(409).send({ error: 'That username is taken' });
      }
      if (store.emailTaken(email)) {
        return reply.code(409).send({ error: 'That email is already registered' });
      }
      if (await isBreached(password)) return reply.code(400).send({ error: BREACHED_MESSAGE });
      const user = store.createUser(username, email, await hash(password));
      deliver(request, emails.verification({ ...user, email }));
      return startSession(request, reply, user);
    });

    app.post('/api/login', strictLimit, async (request, reply) => {
      const { login, password, code } = LoginBody.parse(request.body);
      const user = store.userByLogin(login);
      const valid = await verify(user?.passwordHash ?? DUMMY_HASH, password);
      if (!user || !valid) {
        return reply.code(401).send({ error: 'Invalid username or password' });
      }
      if (user.closedAt) {
        return reply
          .code(403)
          .send({ error: 'This account was closed for breaking the terms of use.' });
      }
      // `twoFactor` tells the client to ask for a code and send the login again.
      if (user.totpSecret && !code) {
        return reply
          .code(401)
          .send({ error: 'Enter the code from your authenticator app', twoFactor: true });
      }
      if (code && !checkSecondFactor(services, user.id, code)) {
        return reply.code(401).send({ error: 'That code is not valid', twoFactor: true });
      }
      const emailVerified = user.emailVerifiedAt !== null;
      return startSession(request, reply, { id: user.id, username: user.username, emailVerified });
    });

    /** Verification links work without a session: they may be opened on another device. */
    app.post('/api/verify-email', strictLimit, async (request, reply) => {
      const userId = store.useEmailToken(EmailTokenBody.parse(request.body).token, 'verify');
      if (!userId) return reply.code(400).send({ error: 'This link is invalid or has expired' });
      store.markEmailVerified(userId);
      return { ok: true };
    });

    /** Answers the same whether or not the email is registered, so it can't be used to find accounts. */
    app.post('/api/password-reset/request', strictLimit, async (request) => {
      const user = store.userByEmail(ResetRequestBody.parse(request.body).email);
      if (user) deliver(request, emails.passwordReset(user));
      return { ok: true };
    });

    /** Resetting signs out every device. Following the link also proves the email address. */
    app.post('/api/password-reset', strictLimit, async (request, reply) => {
      const { token, password } = ResetPasswordBody.parse(request.body);
      if (await isBreached(password)) return reply.code(400).send({ error: BREACHED_MESSAGE });
      const userId = store.useEmailToken(token, 'reset');
      if (!userId) return reply.code(400).send({ error: 'This link is invalid or has expired' });
      store.setPassword(userId, await hash(password));
      store.markEmailVerified(userId);
      hub.endSessions(store.deleteOtherSessions(userId));
      return { ok: true };
    });

    app.post('/api/logout', async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (token) store.deleteSession(token);
      clearSessionCookie(reply);
      return { user: null };
    });
  };
