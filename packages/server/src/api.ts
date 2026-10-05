import { CATEGORIES } from '@uttt/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { signedIn } from './auth.ts';
import type { Hub } from './hub.ts';
import { toState, type Store } from './store.ts';

const Params = z.object({ name: z.string().max(20) });
const GamesQuery = z.object({
  category: z.enum(CATEGORIES).optional(),
  rated: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  result: z.enum(['win', 'loss', 'draw']).optional(),
  opponent: z.string().max(20).optional(),
  before: z.coerce
    .number()
    .int()
    .positive()
    .transform((ms) => new Date(ms))
    .optional(),
});

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
        bot: user.bot,
        online: hub.status(user.id).online,
        closed: user.closedAt !== null,
        followers: store.followerCount(user.id),
        following: viewer !== undefined && store.isFollowing(viewer, user.id),
        blocked: viewer !== undefined && store.hasBlocked(viewer, user.id),
        history: store.ratingHistory(user.id),
        ratings,
      };
    });

    /** A player's games, a page at a time, with filters (see `Store.playerGames`). */
    app.get('/api/users/:name/games', async (request, reply) => {
      const user = store.userByName(Params.parse(request.params).name);
      if (!user) return reply.code(404).send({ error: 'No such player' });
      return store.playerGames(user.id, GamesQuery.parse(request.query));
    });

    /** People's leaderboard, or the bots' with `?bots`: the two are ranked apart. */
    app.get('/api/leaderboard/:name', async (request) => {
      const category = z.enum(CATEGORIES).parse(Params.parse(request.params).name);
      return store.leaderboard(category, 'bots' in (request.query as object));
    });

    /** Bots online now, with their blitz and bullet ratings, for people looking for one to play. */
    app.get('/api/bots', async () =>
      hub.onlineBots().map(({ username, playing }) => {
        const user = store.userByName(username);
        const rating = (category: 'bullet' | 'blitz') =>
          user ? Math.round(store.rating(user.id, category).rating) : null;
        return { username, playing, bullet: rating('bullet'), blitz: rating('blitz') };
      }),
    );

    app.get('/api/games/live', async () => hub.liveGames());

    /** A game by id, live or finished, e.g. for reviewing it with its clock times. */
    app.get('/api/games/:id', async (request, reply) => {
      const { id } = z.object({ id: z.string().regex(/^[A-Za-z0-9]{8}$/) }).parse(request.params);
      const row = store.game(id);
      return row ? toState(row) : reply.code(404).send({ error: 'Game not found' });
    });

    /**
     * For the lobby: how many are playing, how many wait in each pool (`3+2`, `3+2 rated`), and a game to
     * show: the strongest live one, or else the last one played.
     */
    app.get('/api/lobby', async () => {
      const [live] = hub.liveGames(1);
      const last = live ? undefined : store.lastFinishedGame();
      const featured = live
        ? { live: true, game: live }
        : last
          ? { live: false, game: last }
          : null;
      return { ...hub.activity(), featured };
    });

    app.get('/api/challenges/:name', async (request, reply) => {
      const challenge = hub.challenge(Params.parse(request.params).name);
      return (
        challenge ?? reply.code(404).send({ error: 'This challenge has expired or was cancelled' })
      );
    });
  };
