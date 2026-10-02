import { hash, verify } from '@node-rs/argon2';
import { ChangePasswordBody, type User } from '@uttt/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { signedIn, strictLimit } from './auth.ts';
import { BREACHED_MESSAGE, type BreachCheck } from './breach.ts';
import type { Hub } from './hub.ts';
import type { Store } from './store.ts';

const SessionBody = z.object({ id: z.string().regex(/^[0-9a-f]{64}$/) });

interface Session {
  user: User;
  token: string;
}

/** Settings for the signed-in user: sessions and password. Every route requires a session. */
export const accountRoutes =
  (store: Store, hub: Hub, isBreached: BreachCheck): FastifyPluginAsync =>
  async (app) => {
    /** Resolves the session once, rejecting guests, and hands it to the handler. */
    const withSession =
      (handler: (session: Session, request: FastifyRequest, reply: FastifyReply) => unknown) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        const session = signedIn(store, request);
        if (!session) return reply.code(401).send({ error: 'Please sign in' });
        return handler(session, request, reply);
      };

    const overview = ({ user, token }: Session) => ({
      ...store.account(user.id),
      sessions: store.sessions(user.id, token),
    });

    app.get('/api/account', withSession(overview));

    /** Changing the password signs out every other device. */
    app.post(
      '/api/account/password',
      strictLimit,
      withSession(async (session, request, reply) => {
        const { current, password } = ChangePasswordBody.parse(request.body);
        const currentHash = store.passwordHash(session.user.id);
        if (!currentHash || !(await verify(currentHash, current))) {
          return reply.code(403).send({ error: 'Your current password is incorrect' });
        }
        if (await isBreached(password)) return reply.code(400).send({ error: BREACHED_MESSAGE });
        store.setPassword(session.user.id, await hash(password));
        hub.endSessions(store.deleteOtherSessions(session.user.id, session.token));
        return overview(session);
      }),
    );

    app.post(
      '/api/account/sessions/revoke',
      withSession((session, request) => {
        const { id } = SessionBody.parse(request.body);
        hub.endSessions(store.deleteSessionById(session.user.id, id));
        return overview(session);
      }),
    );

    app.post(
      '/api/account/sessions/revoke-others',
      withSession((session) => {
        hub.endSessions(store.deleteOtherSessions(session.user.id, session.token));
        return overview(session);
      }),
    );
  };
