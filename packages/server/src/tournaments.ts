import { CreateTournamentBody } from '@uttt/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { signedIn, type Services } from './auth.ts';
import { newId } from './hub.ts';
import { isAdmin } from './moderation.ts';

const Params = z.object({ id: z.string().regex(/^[A-Za-z0-9]{8}$/) });

/** Arena tournaments: listing and standings for everyone; admins create and cancel them. */
export const tournamentRoutes =
  (services: Services): FastifyPluginAsync =>
  async (app) => {
    const { store, hub } = services;

    app.get('/api/tournaments', async () => store.tournamentList());

    app.get('/api/tournaments/:id', async (request, reply) => {
      const tournament = store.tournament(Params.parse(request.params).id);
      if (!tournament) return reply.code(404).send({ error: 'No such tournament' });
      const viewer = signedIn(store, request)?.user.id;
      const standings = store.standings(tournament.id);
      return {
        ...tournament,
        joined: standings.some((row) => row.userId === viewer),
        standings: standings.map(({ userId, username, score, games }) => ({
          username,
          score,
          games,
          playing: hub.status(userId).gameId,
        })),
      };
    });

    /** The admin's username, or a 403 sent. */
    function admin(request: FastifyRequest, reply: FastifyReply): string | null {
      const session = signedIn(store, request);
      if (session && isAdmin(services, session.user.id)) return session.user.username;
      reply.code(403).send({ error: 'Admins only' });
      return null;
    }

    app.post('/api/admin/tournaments', async (request, reply) => {
      const name = admin(request, reply);
      if (!name) return;
      const { minutes, ...tournament } = CreateTournamentBody.parse(request.body);
      const id = newId();
      const endsAt = new Date(tournament.startsAt.getTime() + minutes * 60_000);
      store.createTournament({ id, ...tournament, endsAt });
      const details = `${tournament.name}, ${tournament.timeControl}, ${tournament.startsAt.toISOString()}`;
      store.logAdminAction({ admin: name, action: 'create tournament', target: id, details });
      return { id };
    });

    app.post('/api/admin/tournaments/:id/cancel', async (request, reply) => {
      const name = admin(request, reply);
      if (!name) return;
      const { id } = Params.parse(request.params);
      if (!store.cancelTournament(id)) {
        return reply
          .code(400)
          .send({ error: 'Only tournaments that haven’t started can be cancelled' });
      }
      store.logAdminAction({ admin: name, action: 'cancel tournament', target: id, details: '' });
      return { ok: true };
    });
  };
