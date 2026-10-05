import { CreateTournamentBody } from '@uttt/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { signedIn, strictLimit, type Services } from './auth.ts';
import { newId } from './hub.ts';
import { isAdmin } from './moderation.ts';

const Params = z.object({ id: z.string().regex(/^[A-Za-z0-9]{8}$/) });

/** A player's tournaments that haven't finished yet, at most; admins have no limit. */
const MAX_OPEN = 2;
/** How far ahead a player can schedule a tournament. */
const MAX_AHEAD_MS = 7 * 86_400_000;

/**
 * Arena tournaments: listing and standings for everyone. Players with a confirmed email schedule their own;
 * admins schedule the official ones. The creator or an admin can cancel one before it starts.
 */
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
      const { createdBy, ...shown } = tournament;
      return {
        ...shown,
        joined: standings.some((row) => row.userId === viewer),
        canCancel: viewer !== undefined && (createdBy === viewer || isAdmin(services, viewer)),
        standings: standings.map(({ userId, username, score, games }) => ({
          username,
          score,
          games,
          playing: hub.status(userId).gameId,
        })),
      };
    });

    app.post('/api/tournaments', strictLimit, async (request, reply) => {
      const user = signedIn(store, request)?.user;
      if (!user) return reply.code(401).send({ error: 'Sign in to create tournaments' });
      const { minutes, official, ...tournament } = CreateTournamentBody.parse(request.body);
      const admin = isAdmin(services, user.id);
      const refuse = (error: string) => reply.code(400).send({ error });
      if (official && !admin) return reply.code(403).send({ error: 'Admins only' });
      if (!user.emailVerified || user.bot) {
        return refuse('Confirm your email to create tournaments');
      }
      const start = tournament.startsAt.getTime();
      if (start < Date.now() - 60_000) return refuse('The start time has passed');
      if (!admin && start > Date.now() + MAX_AHEAD_MS) {
        return refuse('Tournaments can start at most a week ahead');
      }
      if (!admin && store.openTournamentsBy(user.id) >= MAX_OPEN) {
        return refuse('You already have two tournaments coming up');
      }
      const id = newId();
      const endsAt = new Date(start + minutes * 60_000);
      store.createTournament({ id, ...tournament, endsAt, official, createdBy: user.id });
      if (admin) {
        const details = `${tournament.name}, ${tournament.timeControl}, ${tournament.startsAt.toISOString()}`;
        store.logAdminAction({
          admin: user.username,
          action: 'create tournament',
          target: id,
          details,
        });
      }
      return { id };
    });

    app.post('/api/tournaments/:id/cancel', async (request, reply) => {
      const user = signedIn(store, request)?.user;
      const tournament = store.tournament(Params.parse(request.params).id);
      if (!tournament) return reply.code(404).send({ error: 'No such tournament' });
      const admin = user !== undefined && isAdmin(services, user.id);
      if (!user || (tournament.createdBy !== user.id && !admin)) {
        return reply.code(403).send({ error: 'Only its creator can cancel a tournament' });
      }
      if (!store.cancelTournament(tournament.id)) {
        return reply
          .code(400)
          .send({ error: 'Only tournaments that haven’t started can be cancelled' });
      }
      if (admin) {
        store.logAdminAction({
          admin: user.username,
          action: 'cancel tournament',
          target: tournament.id,
          details: '',
        });
      }
      return { ok: true };
    });
  };
