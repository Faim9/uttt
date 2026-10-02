import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { accountRoutes } from './account.ts';
import { apiRoutes } from './api.ts';
import { authRoutes, identify } from './auth.ts';
import { isBreached as checkBreaches, type BreachCheck } from './breach.ts';
import { Emails, smtpMailer, type SendMail } from './email.ts';
import { Hub } from './hub.ts';
import type { Store } from './store.ts';

export interface AppOptions {
  store: Store;
  /** The built web app to serve; in development Vite serves it instead. */
  webRoot?: string;
  logger?: boolean;
  /** Where the site is reachable, for links in emails. */
  publicUrl?: string;
  /** Breached-password check; tests replace it to stay offline. */
  isBreached?: BreachCheck;
  /** Email transport; tests replace it to read the emails. */
  sendMail?: SendMail;
}

/**
 * Browsers always send Origin on cross-site POSTs and WebSocket handshakes, so requiring it to match
 * the host blocks CSRF and cross-site WebSocket hijacking.
 */
function sameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

export async function buildApp({
  store,
  webRoot,
  logger = false,
  publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:5173',
  isBreached = checkBreaches,
  sendMail,
}: AppOptions) {
  const app = Fastify({ logger, trustProxy: process.env.TRUST_PROXY === 'true' });

  // The CSP is set by SvelteKit as a <meta> tag with hashes of its inline scripts.
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 4096 } });

  app.addHook('onRequest', async (request, reply) => {
    const unsafe = !['GET', 'HEAD'].includes(request.method);
    const upgrade = request.headers.upgrade?.toLowerCase() === 'websocket';
    if ((unsafe || upgrade) && !sameOrigin(request)) {
      return reply.code(403).send({ error: 'Cross-origin request blocked' });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: error.issues[0]?.message ?? 'Invalid request' });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    reply.code(status).send({ error: status >= 500 ? 'Internal error' : (error as Error).message });
  });

  const hub = new Hub(store, app.log);
  app.addHook('onClose', async () => hub.close());
  const emails = new Emails(store, sendMail ?? smtpMailer(app.log), publicUrl);
  const services = { store, hub, isBreached, emails };
  await app.register(authRoutes(services));
  await app.register(accountRoutes(services));
  await app.register(apiRoutes(store, hub));

  app.get('/ws', { websocket: true }, (socket, request) => {
    const identity = identify(store, request);
    if (!identity) return socket.close(1008, 'Load the site first to get a guest identity');
    hub.connect(socket, identity);
  });

  if (webRoot) {
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/')
        ? reply.code(404).send({ error: 'Not found' })
        : reply.sendFile('200.html'),
    );
  }

  return app;
}
