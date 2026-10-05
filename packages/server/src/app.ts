import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyRequest } from 'fastify';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { accountRoutes } from './account.ts';
import { apiRoutes } from './api.ts';
import { apiToken, authRoutes, identify } from './auth.ts';
import { isBreached as checkBreaches, type BreachCheck } from './breach.ts';
import { turnstile, type HumanCheck } from './captcha.ts';
import { correspondenceRoutes } from './correspondence.ts';
import { Emails, smtpMailer, type SendMail } from './email.ts';
import { Hub } from './hub.ts';
import { moderationRoutes } from './moderation.ts';
import { linkPreview, previewRoutes } from './previews.ts';
import { puzzleRoutes } from './puzzles.ts';
import { socialRoutes } from './social.ts';
import { tournamentRoutes } from './tournaments.ts';
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
  /** Bot check on sign-up; tests replace it to stay offline. */
  isHuman?: HumanCheck;
  /** Email transport; tests replace it to read the emails. */
  sendMail?: SendMail;
  /** Emails of the admin accounts, e.g. from `ADMIN_EMAILS=a@example.com,b@example.com`. */
  adminEmails?: string[];
}

/**
 * The header holding the visitor's real address when a trusted proxy sits in front, e.g.
 * `cf-connecting-ip` behind Cloudflare. Only set it when the proxy is the only way in: anyone else
 * could forge the header.
 */
const CLIENT_IP_HEADER = process.env.CLIENT_IP_HEADER?.toLowerCase();

/** Generous for several tabs, and for players sharing an address (a school, a mobile network). */
const MAX_SOCKETS_PER_IP = 50;

const clientIp = (request: FastifyRequest) => {
  const forwarded = CLIENT_IP_HEADER && request.headers[CLIENT_IP_HEADER];
  return typeof forwarded === 'string' ? forwarded : request.ip;
};

export async function buildApp({
  store,
  webRoot,
  logger = false,
  publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:5173',
  isBreached = checkBreaches,
  isHuman = turnstile(),
  sendMail,
  adminEmails = (process.env.ADMIN_EMAILS ?? '').split(','),
}: AppOptions) {
  const app = Fastify({ logger });
  const siteOrigin = new URL(publicUrl).origin;

  // The CSP is set by SvelteKit as a <meta> tag with hashes of its inline scripts.
  await app.register(helmet, { contentSecurityPolicy: false });
  // Only the API is limited: one page load fetches dozens of the site's own files, and a class of students
  // behind one school address would otherwise lock itself out.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: clientIp,
    allowList: (request) => !request.url.startsWith('/api/'),
  });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 4096 } });

  // Browsers always send Origin on cross-site POSTs and WebSocket handshakes, so requiring the site's
  // own origin blocks CSRF and cross-site WebSocket hijacking. Bots' handshakes carry their API token
  // instead of cookies, which no other site can attach, so they need no Origin.
  app.addHook('onRequest', async (request, reply) => {
    const unsafe = !['GET', 'HEAD'].includes(request.method);
    const upgrade = request.headers.upgrade?.toLowerCase() === 'websocket';
    const bot = upgrade && apiToken(request) !== null;
    if ((unsafe || upgrade) && !bot && request.headers.origin !== siteOrigin) {
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

  const emails = new Emails(store, sendMail ?? smtpMailer(app.log), publicUrl);
  const hub = new Hub(store, emails, app.log);
  app.addHook('onClose', async () => hub.close());
  const services = {
    store,
    hub,
    isBreached,
    isHuman,
    emails,
    adminEmails: adminEmails.map((email) => email.trim().toLowerCase()).filter(Boolean),
    secondFactorFailures: new Map(),
  };
  await app.register(authRoutes(services));
  await app.register(accountRoutes(services));
  await app.register(moderationRoutes(services));
  await app.register(socialRoutes(services));
  await app.register(tournamentRoutes(services));
  await app.register(puzzleRoutes(services));
  await app.register(correspondenceRoutes(services));
  await app.register(apiRoutes(store, hub));
  await app.register(previewRoutes());

  // Open connections per visitor address, capped so one visitor can't exhaust the server's memory.
  const socketsPerIp = new Map<string, number>();
  app.get('/ws', { websocket: true }, (socket, request) => {
    const identity = identify(store, request);
    if (!identity) {
      const reason = apiToken(request)
        ? 'Invalid API token'
        : 'Load the site first to get a guest identity';
      return socket.close(1008, reason);
    }
    const ip = clientIp(request);
    const open = socketsPerIp.get(ip) ?? 0;
    if (open >= MAX_SOCKETS_PER_IP) return socket.close(1008, 'Too many connections');
    socketsPerIp.set(ip, open + 1);
    socket.on('close', () => {
      const left = (socketsPerIp.get(ip) ?? 1) - 1;
      if (left > 0) socketsPerIp.set(ip, left);
      else socketsPerIp.delete(ip);
    });
    hub.connect(socket, identity);
  });

  if (webRoot) {
    await app.register(fastifyStatic, {
      root: webRoot,
      // Built files with a content hash in their name never change, so browsers and Cloudflare keep them.
      setHeaders: (response, path) => {
        if (path.includes('/_app/immutable/')) {
          response.header('cache-control', 'public, max-age=31536000, immutable');
        }
      },
    });
    // Every page is the app's one page, with the link preview for its address filled in.
    const appPage = readFileSync(join(webRoot, '200.html'), 'utf8');
    const preview = linkPreview(store, hub, publicUrl);
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/')
        ? reply.code(404).send({ error: 'Not found' })
        : reply.type('text/html').send(preview(appPage, request.url)),
    );
  }

  return app;
}
