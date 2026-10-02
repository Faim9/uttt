import { hash, verify } from '@node-rs/argon2';
import { LoginBody, SignupBody, type User } from '@uttt/core';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { BREACHED_MESSAGE, type BreachCheck } from './breach.ts';
import { hashToken, type Store } from './store.ts';

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
  (store: Store, isBreached: BreachCheck): FastifyPluginAsync =>
  async (app) => {
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

    app.post('/api/signup', strictLimit, async (request, reply) => {
      const { username, email, password } = SignupBody.parse(request.body);
      if (store.userByName(username)) {
        return reply.code(409).send({ error: 'That username is taken' });
      }
      if (store.emailTaken(email)) {
        return reply.code(409).send({ error: 'That email is already registered' });
      }
      if (await isBreached(password)) return reply.code(400).send({ error: BREACHED_MESSAGE });
      const user = store.createUser(username, email, await hash(password));
      return startSession(request, reply, user);
    });

    app.post('/api/login', strictLimit, async (request, reply) => {
      const { login, password } = LoginBody.parse(request.body);
      const user = store.userByLogin(login);
      const valid = await verify(user?.passwordHash ?? DUMMY_HASH, password);
      if (!user || !valid) {
        return reply.code(401).send({ error: 'Invalid username or password' });
      }
      return startSession(request, reply, { id: user.id, username: user.username });
    });

    app.post('/api/logout', async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (token) store.deleteSession(token);
      reply.clearCookie(SESSION_COOKIE, cookie);
      return { user: null };
    });
  };
