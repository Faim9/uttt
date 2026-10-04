import { CATEGORIES } from '@uttt/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { signedIn } from './auth.ts';
import type { Hub } from './hub.ts';
import type { Store } from './store.ts';

const Params = z.object({ name: z.string().max(20) });

/** Read-only REST endpoints. Everything that changes a game goes through the WebSocket hub. */
export const apiRoutes =
  (store: Store, hub: Hub): FastifyPluginAsync =>
  async (app) => {
    /** For uptime checks and the container's health check. */
    app.get('/api/health', async () => {
      store.ping();
      return { ok: true };
    });

    app.get('/api/users/:name', async (request, reply) => {
      const user = store.userByName(Params.parse(request.params).name);
      if (!user) return reply.code(404).send({ error: 'No such player' });
      const ratings = Object.fromEntries(
        Object.entries(store.ratings(user.id)).map(([category, r]) => [
          category,
          { rating: Math.round(r.rating), provisional: r.provisional, games: r.games },
        ]),
      );
      // How the signed-in viewer relates to this player, for the Follow and Block buttons.
      const viewer = signedIn(store, request)?.user.id;
      return {
        username: user.username,
        createdAt: user.createdAt,
        closed: user.closedAt !== null,
        followers: store.followerCount(user.id),
        following: viewer !== undefined && store.isFollowing(viewer, user.id),
        blocked: viewer !== undefined && store.hasBlocked(viewer, user.id),
        history: store.ratingHistory(user.id),
        ratings,
        games: store.recentGames(user.id),
      };
    });

    app.get('/api/leaderboard/:name', async (request) => {
      const category = z.enum(CATEGORIES).parse(Params.parse(request.params).name);
      return store.leaderboard(category);
    });

    app.get('/api/games/live', async () => hub.liveGames());

    app.get('/api/challenges/:name', async (request, reply) => {
      const challenge = hub.challenge(Params.parse(request.params).name);
      return (
        challenge ?? reply.code(404).send({ error: 'This challenge has expired or was cancelled' })
      );
    });
  };
