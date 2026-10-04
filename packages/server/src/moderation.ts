import { CloseAccountBody, RenameBody, ReportBody } from '@uttt/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { signedIn, strictLimit, type Services } from './auth.ts';

const UserParams = z.object({ name: z.string().max(20) });
const ReportParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Admins are the accounts whose email is in `ADMIN_EMAILS`. They also need a verified email and
 * two-factor authentication, so a leaked password alone can't close accounts.
 */
export function isAdmin({ store, adminEmails }: Services, userId: number): boolean {
  const account = store.account(userId);
  if (!account?.emailVerifiedAt || !adminEmails.includes(account.email)) return false;
  return store.twoFactor(userId) !== null;
}

/** Players reporting players, and the admin tools that act on reports. Every admin action is logged. */
export const moderationRoutes =
  (services: Services): FastifyPluginAsync =>
  async (app) => {
    const { store, hub } = services;

    app.post('/api/reports', strictLimit, async (request, reply) => {
      const session = signedIn(store, request);
      if (!session) return reply.code(401).send({ error: 'Sign in to report a player' });
      const { username, reason, details } = ReportBody.parse(request.body);
      const reported = store.userByName(username);
      if (!reported) return reply.code(404).send({ error: 'No such player' });
      if (reported.id === session.user.id) {
        return reply.code(400).send({ error: "You can't report yourself" });
      }
      store.createReport({ reporterId: session.user.id, reportedId: reported.id, reason, details });
      return { ok: true };
    });

    type AdminHandler = (admin: string, request: FastifyRequest, reply: FastifyReply) => unknown;

    /** Rejects everyone but admins; hands the handler the admin's name for the audit log. */
    const asAdmin = (handler: AdminHandler) => (request: FastifyRequest, reply: FastifyReply) => {
      const session = signedIn(store, request);
      if (!session || !isAdmin(services, session.user.id)) {
        return reply.code(403).send({ error: 'Admins only' });
      }
      return handler(session.user.username, request, reply);
    };

    /** The user named in the URL, or a 404. */
    function target(request: FastifyRequest, reply: FastifyReply) {
      const user = store.userByName(UserParams.parse(request.params).name);
      if (!user) reply.code(404).send({ error: 'No such player' });
      return user;
    }

    const log = (admin: string, action: string, target: string, details = '') =>
      store.logAdminAction({ admin, action, target, details });

    app.get(
      '/api/admin/users/:name',
      asAdmin((admin, request, reply) => {
        const user = target(request, reply);
        if (!user) return;
        const account = store.account(user.id);
        return {
          ...account,
          emailVerified: Boolean(account?.emailVerifiedAt),
          twoFactor: store.twoFactor(user.id) !== null,
          ratings: store.ratings(user.id),
          games: store.recentGames(user.id, 10),
        };
      }),
    );

    app.post(
      '/api/admin/users/:name/close',
      asAdmin((admin, request, reply) => {
        const user = target(request, reply);
        if (!user) return;
        if (user.username === admin) {
          return reply.code(400).send({ error: "You can't close your own account here" });
        }
        const { reason } = CloseAccountBody.parse(request.body);
        hub.endSessions(store.closeAccount(user.id, reason));
        log(admin, 'close account', user.username, reason);
        return { ok: true };
      }),
    );

    app.post(
      '/api/admin/users/:name/reopen',
      asAdmin((admin, request, reply) => {
        const user = target(request, reply);
        if (!user) return;
        store.reopenAccount(user.id);
        log(admin, 'reopen account', user.username);
        return { ok: true };
      }),
    );

    app.post(
      '/api/admin/users/:name/rename',
      asAdmin((admin, request, reply) => {
        const user = target(request, reply);
        if (!user) return;
        const { username } = RenameBody.parse(request.body);
        const holder = store.userByName(username);
        if (holder && holder.id !== user.id) {
          return reply.code(409).send({ error: 'That username is taken' });
        }
        store.rename(user.id, username);
        log(admin, 'rename', user.username, `to ${username}`);
        return { ok: true };
      }),
    );

    app.post(
      '/api/admin/users/:name/reset-ratings',
      asAdmin((admin, request, reply) => {
        const user = target(request, reply);
        if (!user) return;
        store.resetRatings(user.id);
        log(admin, 'reset ratings', user.username);
        return { ok: true };
      }),
    );

    app.get(
      '/api/admin/reports',
      asAdmin(() => store.openReports()),
    );

    app.post(
      '/api/admin/reports/:id/resolve',
      asAdmin((admin, request, reply) => {
        const { id } = ReportParams.parse(request.params);
        if (!store.resolveReport(id)) return reply.code(404).send({ error: 'No such open report' });
        log(admin, 'resolve report', `#${id}`);
        return { ok: true };
      }),
    );

    app.get(
      '/api/admin/log',
      asAdmin(() => store.adminLog()),
    );
  };
