import { CorrespondenceBody } from '@uttt/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { signedIn, type Services } from './auth.ts';
import { newId } from './hub.ts';

/** Enough open games to try a few time controls, few enough to keep the lobby list honest. */
const MAX_OPEN = 5;

const Params = z.object({ id: z.string().regex(/^[A-Za-z0-9]{8}$/) });

/**
 * Correspondence games: open games wait in the database until someone accepts (over the socket, like any
 * challenge link), so nobody has to be online at the same time. The games themselves run in the hub.
 */
export const correspondenceRoutes =
  ({ store, hub }: Services): FastifyPluginAsync =>
  async (app) => {
    /** The lobby's correspondence card: open games to accept, and the visitor's own games and challenges. */
    app.get('/api/correspondence', async (request) => {
      const user = signedIn(store, request)?.user;
      const blocked = user ? store.blockedKeys(user.id) : new Set<string>();
      const open = store
        .correspondenceChallenges()
        .filter(({ userId }) => userId !== user?.id && !blocked.has(`u:${userId}`))
        .map(({ id, username, userId, timeControl, rated }) => {
          const { rating, provisional } = store.rating(userId, 'correspondence');
          return { id, username, rating: Math.round(rating), provisional, timeControl, rated };
        });
      if (!user) return { open, mine: [], games: [] };
      const mine = store
        .correspondenceChallenges(user.id)
        .map(({ id, timeControl, rated, listed }) => ({ id, timeControl, rated, listed }));
      return { open, mine, games: hub.correspondenceGames(user.id) };
    });

    app.post('/api/correspondence', async (request, reply) => {
      const user = signedIn(store, request)?.user;
      if (!user) return reply.code(401).send({ error: 'Sign in to play correspondence games' });
      if (user.bot) return reply.code(403).send({ error: 'Bots play live games only' });
      const body = CorrespondenceBody.parse(request.body);
      if (body.rated && !user.emailVerified) {
        return reply.code(403).send({ error: 'Verify your email to play rated games' });
      }
      if (store.correspondenceChallenges(user.id).length >= MAX_OPEN) {
        return reply
          .code(409)
          .send({ error: `You can have ${MAX_OPEN} open games; cancel one first` });
      }
      const id = newId();
      store.createCorrespondenceChallenge({ id, userId: user.id, ...body });
      return { id };
    });

    app.post('/api/correspondence/:id/cancel', async (request, reply) => {
      const user = signedIn(store, request)?.user;
      const challenge = store.correspondenceChallenge(Params.parse(request.params).id);
      if (!user || challenge?.userId !== user.id) {
        return reply.code(404).send({ error: 'No such open game' });
      }
      store.deleteCorrespondenceChallenge(challenge.id);
      return { ok: true };
    });
  };
