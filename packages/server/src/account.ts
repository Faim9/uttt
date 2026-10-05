import { hash, verify } from '@node-rs/argon2';
import {
  ChangePasswordBody,
  DeleteAccountBody,
  formatMove,
  RESULTS,
  DisableTwoFactorBody,
  EnableTwoFactorBody,
  type User,
} from '@uttt/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  checkSecondFactor,
  clearSessionCookie,
  deliver,
  signedIn,
  strictLimit,
  type Services,
} from './auth.ts';
import { BREACHED_MESSAGE } from './breach.ts';
import { isAdmin } from './moderation.ts';
import {
  hashRecoveryCode,
  matchingStep,
  newRecoveryCodes,
  newSecret,
  otpauthUri,
} from './two-factor.ts';

const SessionBody = z.object({ id: z.string().regex(/^[0-9a-f]{64}$/) });
const TurnEmailsBody = z.object({ on: z.boolean() });

interface Session {
  user: User;
  token: string;
}

/** Settings for the signed-in user: email, password, and sessions. Every route requires a session. */
export const accountRoutes =
  (services: Services): FastifyPluginAsync =>
  async (app) => {
    const { store, hub, isBreached, emails } = services;
    /** Resolves the session once, rejecting guests, and hands it to the handler. */
    const withSession =
      (handler: (session: Session, request: FastifyRequest, reply: FastifyReply) => unknown) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        const session = signedIn(store, request);
        if (!session) return reply.code(401).send({ error: 'Please sign in' });
        return handler(session, request, reply);
      };

    const overview = ({ user, token }: Session) => {
      const account = store.account(user.id);
      return {
        username: account?.username,
        email: account?.email,
        emailVerified: Boolean(account?.emailVerifiedAt),
        twoFactor: store.twoFactor(user.id) !== null,
        turnEmails: account?.turnEmails ?? true,
        sessions: store.sessions(user.id, token),
        admin: isAdmin(services, user.id),
      };
    };

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
      '/api/account/verify-email',
      strictLimit,
      withSession((session, request) => {
        const account = store.account(session.user.id);
        if (account && !account.emailVerifiedAt) {
          deliver(request, emails.verification({ ...session.user, email: account.email }));
        }
        return overview(session);
      }),
    );

    app.post(
      '/api/account/turn-emails',
      withSession((session, request) => {
        store.setTurnEmails(session.user.id, TurnEmailsBody.parse(request.body).on);
        return overview(session);
      }),
    );

    /** Step 1 of enabling two-factor: a fresh secret for the authenticator app. Nothing is stored yet. */
    app.post(
      '/api/account/2fa/setup',
      withSession(({ user }) => {
        const secret = newSecret();
        return { secret, uri: otpauthUri(secret, user.username) };
      }),
    );

    /** Step 2: a valid code proves the app is set up; the recovery codes are shown only now. */
    app.post(
      '/api/account/2fa/enable',
      strictLimit,
      withSession((session, request, reply) => {
        const { secret, code } = EnableTwoFactorBody.parse(request.body);
        if (store.twoFactor(session.user.id)) {
          return reply.code(409).send({ error: 'Two-factor authentication is already on' });
        }
        const step = matchingStep(secret, code);
        if (step === null) {
          return reply
            .code(400)
            .send({ error: "That code didn't match. Check that your device's clock is right." });
        }
        const recoveryCodes = newRecoveryCodes();
        store.enableTwoFactor(session.user.id, secret, step, recoveryCodes.map(hashRecoveryCode));
        return { ...overview(session), recoveryCodes };
      }),
    );

    app.post(
      '/api/account/2fa/disable',
      strictLimit,
      withSession(async (session, request, reply) => {
        const { password } = DisableTwoFactorBody.parse(request.body);
        const currentHash = store.passwordHash(session.user.id);
        if (!currentHash || !(await verify(currentHash, password))) {
          return reply.code(403).send({ error: 'Your password is incorrect' });
        }
        store.disableTwoFactor(session.user.id);
        return overview(session);
      }),
    );

    /** Everything stored about the user, as a JSON download (GDPR right of access). */
    app.get(
      '/api/account/export',
      withSession((session, request, reply) => {
        const { user, token } = session;
        reply.header('content-disposition', `attachment; filename="uttt-${user.username}.json"`);
        return {
          exportedAt: new Date(),
          account: { ...store.account(user.id), twoFactor: store.twoFactor(user.id) !== null },
          sessions: store.sessions(user.id, token),
          ratings: store.ratings(user.id),
          puzzles: store.puzzleAttempts(user.id),
          games: store.allGames(user.id).map(({ moves, outcome, ...game }) => ({
            ...game,
            result: outcome ? RESULTS[outcome] : null,
            moves: moves.map(formatMove),
          })),
        };
      }),
    );

    /**
     * Deletes the account (GDPR right to erasure). Needs the password, and a code when two-factor is on.
     * Games stay for the opponents' records, anonymized.
     */
    app.post(
      '/api/account/delete',
      strictLimit,
      withSession(async ({ user }, request, reply) => {
        const { password, code } = DeleteAccountBody.parse(request.body);
        const currentHash = store.passwordHash(user.id);
        if (!currentHash || !(await verify(currentHash, password))) {
          return reply.code(403).send({ error: 'Your password is incorrect' });
        }
        if (store.twoFactor(user.id) && !(code && checkSecondFactor(services, user.id, code))) {
          return reply
            .code(403)
            .send({ error: 'Enter a valid authentication code', twoFactor: true });
        }
        if (hub.isPlaying(user.id)) {
          return reply.code(409).send({ error: 'Finish or resign your current game first' });
        }
        const sessionIds = store.deleteOtherSessions(user.id);
        store.deleteUser(user.id);
        hub.endSessions(sessionIds);
        clearSessionCookie(reply);
        return { user: null };
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
