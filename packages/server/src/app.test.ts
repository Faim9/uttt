import { parseMove, type ServerMessage } from '@uttt/core';
import { afterEach, expect, test } from 'vitest';
import type { WebSocket } from 'ws';
import { buildApp } from './app.ts';
import { Store } from './store.ts';

type App = Awaited<ReturnType<typeof buildApp>>;
const HEADERS = { host: 'uttt.test', origin: 'https://uttt.test' };
const apps: App[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function newApp(store = new Store(':memory:')) {
  const app = await buildApp({ store });
  apps.push(app);
  return app;
}

/** A browser-like visitor: keeps cookies and sends a same-origin Origin header. */
async function visitor(app: App) {
  let cookie = '';
  const request = async (method: 'GET' | 'POST', url: string, payload?: object) => {
    const response = await app.inject({
      method,
      url,
      payload,
      headers: { ...HEADERS, cookie },
    });
    for (const { name, value } of response.cookies) {
      cookie = [
        ...cookie.split('; ').filter((c) => c && !c.startsWith(`${name}=`)),
        `${name}=${value}`,
      ].join('; ');
    }
    return response;
  };
  await request('GET', '/api/me');

  const connect = async () => {
    // The injected request has no real socket, so give it the remote address rate limiting keys on.
    const socket = await app.injectWS('/ws', {
      headers: { ...HEADERS, cookie },
      socket: { remoteAddress: '127.0.0.1' },
    } as object);
    return messages(socket);
  };
  return { request, connect };
}

/** Wraps a socket with `next(type)`, which resolves with the next message of that type. */
function messages(socket: WebSocket) {
  const queue: ServerMessage[] = [];
  const waiting: (() => void)[] = [];
  socket.on('message', (data) => {
    queue.push(JSON.parse(String(data)));
    waiting.splice(0).forEach((wake) => wake());
  });
  async function next<T extends ServerMessage['type']>(type: T) {
    for (;;) {
      const index = queue.findIndex((message) => message.type === type);
      if (index >= 0) return queue.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
  }
  const send = (message: object) => socket.send(JSON.stringify(message));
  return { next, send, socket };
}

async function signedUp(app: App, username: string) {
  const user = await visitor(app);
  const response = await user.request('POST', '/api/signup', {
    username,
    email: `${username}@example.com`,
    password: 'correct horse battery',
  });
  expect(response.statusCode).toBe(200);
  return user;
}

/** Two clients seek the same pool; returns them as X and O of the started game. */
async function pair(a: Awaited<ReturnType<typeof visitor>>, b: typeof a, rated = false) {
  const [first, second] = [await a.connect(), await b.connect()];
  first.send({ type: 'seek', timeControl: '3+2', rated });
  second.send({ type: 'seek', timeControl: '3+2', rated });
  const { gameId } = await first.next('gameStarted');
  expect((await second.next('gameStarted')).gameId).toBe(gameId);
  first.send({ type: 'watch', gameId });
  second.send({ type: 'watch', gameId });
  const [firstState, secondState] = [await first.next('game'), await second.next('game')];
  const x = firstState.you === 'x' ? first : second;
  const o = x === first ? second : first;
  expect([firstState.you, secondState.you].sort()).toEqual(['o', 'x']);
  return { gameId, x, o };
}

test('sign up, sign in, and sign out', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice');
  expect((await alice.request('GET', '/api/me')).json()).toEqual({
    user: { id: 1, username: 'alice' },
  });

  const taken = await (
    await visitor(app)
  ).request('POST', '/api/signup', {
    username: 'ALICE',
    email: 'other@example.com',
    password: 'another password',
  });
  expect(taken.statusCode).toBe(409);

  const weak = await (
    await visitor(app)
  ).request('POST', '/api/signup', {
    username: 'bob',
    email: 'bob@example.com',
    password: 'short',
  });
  expect(weak.statusCode).toBe(400);
  expect(weak.json().error).toMatch('at least 8');

  await alice.request('POST', '/api/logout');
  expect((await alice.request('GET', '/api/me')).json()).toEqual({ user: null });

  const wrong = await alice.request('POST', '/api/login', { login: 'alice', password: 'nope' });
  expect(wrong.statusCode).toBe(401);
  const right = await alice.request('POST', '/api/login', {
    login: 'alice@example.com',
    password: 'correct horse battery',
  });
  expect(right.json()).toEqual({ user: { id: 1, username: 'alice' } });
});

test('rejects cross-origin requests and WebSocket handshakes', async () => {
  const app = await newApp();
  const evil = { origin: 'https://evil.example' };
  const post = await app.inject({ method: 'POST', url: '/api/logout', headers: evil });
  expect(post.statusCode).toBe(403);
  const noOrigin = await app.inject({ method: 'POST', url: '/api/logout' });
  expect(noOrigin.statusCode).toBe(403);
  await expect(app.injectWS('/ws', { headers: evil })).rejects.toThrow();
});

test('guests are paired, play moves, and the result reaches both players', async () => {
  const app = await newApp();
  const { gameId, x, o } = await pair(await visitor(app), await visitor(app));

  x.send({ type: 'move', gameId, move: parseMove('5-5') });
  expect((await o.next('game')).game.moves).toEqual([parseMove('5-5')]);
  await x.next('game');

  o.send({ type: 'move', gameId, move: parseMove('1-1') });
  expect((await o.next('error')).message).toBe('Illegal move');
  x.send({ type: 'move', gameId, move: parseMove('5-1') });
  expect((await x.next('error')).message).toBe('Not your turn');

  o.send({ type: 'resign', gameId });
  const { game } = await x.next('game');
  expect(game).toMatchObject({ termination: 'resign', outcome: 'x' });
});

test('rated games need accounts and update both ratings', async () => {
  const app = await newApp();
  const guest = await (await visitor(app)).connect();
  guest.send({ type: 'seek', timeControl: '3+2', rated: true });
  expect((await guest.next('error')).message).toBe('Sign in to play rated games');

  const alice = await signedUp(app, 'alice');
  const { gameId, x, o } = await pair(alice, await signedUp(app, 'bob'), true);
  x.send({ type: 'move', gameId, move: parseMove('5-5') });
  await Promise.all([x.next('game'), o.next('game')]);
  o.send({ type: 'abort', gameId });
  expect((await x.next('game')).game.termination).toBe('abort');

  const rematch = await pair(alice, await signedUp(app, 'carol'), true);
  rematch.x.send({ type: 'resign', gameId: rematch.gameId });
  const { game } = await rematch.o.next('game');
  expect(game.players.x.ratingDiff).toBeLessThan(0);
  expect(game.players.o.ratingDiff).toBe(-(game.players.x.ratingDiff ?? 0));

  const profile = (await alice.request('GET', '/api/users/ALICE')).json();
  expect(profile.ratings.blitz.games).toBe(1);
  expect(profile.games).toHaveLength(1); // aborted games aren't listed
});

test('challenge links start a game with the chosen colors', async () => {
  const app = await newApp();
  const creator = await (await visitor(app)).connect();
  creator.send({ type: 'createChallenge', timeControl: '5+3', rated: false, color: 'o' });
  const { id } = await creator.next('challengeCreated');

  const guest = await visitor(app);
  const info = (await guest.request('GET', `/api/challenges/${id}`)).json();
  expect(info).toEqual({ username: null, timeControl: '5+3', rated: false, color: 'o' });

  const accepter = await guest.connect();
  accepter.send({ type: 'acceptChallenge', id });
  const { gameId } = await creator.next('gameStarted');
  creator.send({ type: 'watch', gameId });
  expect((await creator.next('game')).you).toBe('o');
  expect((await guest.request('GET', `/api/challenges/${id}`)).statusCode).toBe(404);
});

test('games in progress survive a server restart', async () => {
  const store = new Store(':memory:');
  const app = await newApp(store);
  const a = await visitor(app);
  const { gameId, x, o } = await pair(a, await visitor(app));
  x.send({ type: 'move', gameId, move: parseMove('5-5') });
  await o.next('game');

  const restarted = await newApp(store);
  const watcher = await (await visitor(restarted)).connect();
  watcher.send({ type: 'watch', gameId });
  const { game, you } = await watcher.next('game');
  expect(game.moves).toEqual([parseMove('5-5')]);
  expect(game.termination).toBeNull();
  expect(you).toBeNull();
});
