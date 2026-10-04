import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { signedIn, type Services } from './auth.ts';

const UserParams = z.object({ name: z.string().max(20) });

/** Following and blocking players. Every route acts for the signed-in user. */
export const socialRoutes =
  ({ store, hub }: Services): FastifyPluginAsync =>
  async (app) => {
    type Action = (me: number, them: number) => void;

    /** Applies `action` between the signed-in user and the player named in the URL. */
    const between = (action: Action) => async (request: FastifyRequest, reply: FastifyReply) => {
      const session = signedIn(store, request);
      if (!session) return reply.code(401).send({ error: 'Please sign in' });
      const them = store.userByName(UserParams.parse(request.params).name);
      if (!them) return reply.code(404).send({ error: 'No such player' });
      if (them.id === session.user.id) return reply.code(400).send({ error: "That's you" });
      action(session.user.id, them.id);
      return { ok: true };
    };

    app.post(
      '/api/users/:name/follow',
      between((me, them) => {
        if (!store.blockedKeys(me).has(`u:${them}`)) store.follow(me, them);
      }),
    );
    app.post('/api/users/:name/unfollow', between(store.unfollow.bind(store)));
    app.post('/api/users/:name/block', between(store.block.bind(store)));
    app.post('/api/users/:name/unblock', between(store.unblock.bind(store)));

    /** The players you follow, with whether they're online and the game they're playing. */
    app.get('/api/following', async (request, reply) => {
      const session = signedIn(store, request);
      if (!session) return reply.code(401).send({ error: 'Please sign in' });
      return store
        .following(session.user.id)
        .map(({ id, username }) => ({ username, ...hub.status(id) }));
    });
  };
