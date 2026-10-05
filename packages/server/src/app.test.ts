import { parseMove, type ServerMessage } from '@uttt/core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { WebSocket } from 'ws';
import { buildApp } from './app.ts';
import { Store } from './store.ts';
import { codeAt, currentStep } from './two-factor.ts';

type App = Awaited<ReturnType<typeof buildApp>>;
const HEADERS = { host: 'uttt.test', origin: 'https://uttt.test' };
const apps: App[] = [];
const PASSWORD = 'correct horse battery';
/** The offline stand-in for Have I Been Pwned treats exactly this password as breached. */
const BREACHED = 'password123';
/** The offline stand-in for Turnstile rejects exactly this token. */
const BOT = 'bot';

/** Emails the apps under test "sent". */
const mailbox: { to: string; subject: string; text: string }[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  mailbox.length = 0;
});

/** The token from the latest emailed link to `path` sent to `to`. */
function emailedToken(to: string, path: string): string {
  const email = mailbox.findLast((message) => message.to === to && message.text.includes(path));
  const token = email?.text.match(/token=([\w-]+)/)?.[1];
  if (!token) throw new Error(`No ${path} email for ${to}`);
  return token;
}

async function newApp(store = new Store(':memory:')) {
  const app = await buildApp({
    store,
    publicUrl: 'https://uttt.test',
    isBreached: async (password) => password === BREACHED,
    isHuman: async (captcha) => captcha !== BOT,
    sendMail: async (message) => void mailbox.push(message),
    adminEmails: ['admin@example.com'],
  });
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

/** Signs up a new user and, unless told otherwise, follows the emailed verification link. */
async function signedUp(app: App, username: string, { verify = true } = {}) {
  const user = await visitor(app);
  const email = `${username}@example.com`;
  const response = await user.request('POST', '/api/signup', {
    username,
    email,
    password: PASSWORD,
  });
  expect(response.statusCode).toBe(200);
  if (verify) {
    const token = emailedToken(email, '/verify-email');
    expect((await user.request('POST', '/api/verify-email', { token })).statusCode).toBe(200);
  }
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
    user: { id: 1, username: 'alice', emailVerified: true },
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

  const bot = await (
    await visitor(app)
  ).request('POST', '/api/signup', {
    username: 'bot',
    email: 'bot@example.com',
    password: 'a fine password',
    captcha: BOT,
  });
  expect(bot.statusCode).toBe(400);
  expect(bot.json().error).toMatch("confirm you're a person");

  await alice.request('POST', '/api/logout');
  expect((await alice.request('GET', '/api/me')).json()).toEqual({ user: null });

  const wrong = await alice.request('POST', '/api/login', { login: 'alice', password: 'nope' });
  expect(wrong.statusCode).toBe(401);
  const right = await alice.request('POST', '/api/login', {
    login: 'alice@example.com',
    password: PASSWORD,
  });
  expect(right.json()).toEqual({ user: { id: 1, username: 'alice', emailVerified: true } });
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

test('challenges take any time control within the limits', async () => {
  const app = await newApp();
  const creator = await (await visitor(app)).connect();
  creator.send({ type: 'createChallenge', timeControl: '61+0', rated: false, color: 'x' });
  expect((await creator.next('error')).message).toBe('Invalid message');
  creator.send({ type: 'createChallenge', timeControl: '7+4', rated: false, color: 'x' });
  const { id } = await creator.next('challengeCreated');

  const accepter = await (await visitor(app)).connect();
  accepter.send({ type: 'acceptChallenge', id });
  const { gameId } = await creator.next('gameStarted');
  creator.send({ type: 'watch', gameId });
  const { game } = await creator.next('game');
  expect(game.timeControl).toBe('7+4');
  expect(game.clocks.x).toBe(7 * 60_000);
});

test('live games are listed for spectators, strongest first, until they end', async () => {
  const app = await newApp();
  const guests = await pair(await visitor(app), await visitor(app));
  const rated = await pair(await signedUp(app, 'alice'), await signedUp(app, 'bob'), true);
  const spectator = await visitor(app);

  const live = (await spectator.request('GET', '/api/games/live')).json();
  expect(live.map((game: { id: string }) => game.id)).toEqual([rated.gameId, guests.gameId]);

  guests.x.send({ type: 'resign', gameId: guests.gameId });
  await guests.x.next('game');
  expect((await spectator.request('GET', '/api/games/live')).json()).toHaveLength(1);
});

test('after a game, both players agreeing to a rematch starts one with colors swapped', async () => {
  const app = await newApp();
  const [alice, bob] = [await visitor(app), await visitor(app)];
  const { gameId, x, o } = await pair(alice, bob);
  x.send({ type: 'resign', gameId });
  await Promise.all([x.next('game'), o.next('game')]);

  const stranger = await (await visitor(app)).connect();
  stranger.send({ type: 'rematch', gameId });
  expect((await stranger.next('error')).message).toBe('You did not play this game');

  // Both players hear about every offer, their own included.
  x.send({ type: 'rematch', gameId });
  expect(await o.next('rematch')).toEqual({ type: 'rematch', gameId, by: 'x' });
  expect((await x.next('rematch')).by).toBe('x');
  o.send({ type: 'cancelRematch', gameId });
  expect((await x.next('rematch')).by).toBeNull();
  expect((await o.next('rematch')).by).toBeNull();

  x.send({ type: 'rematch', gameId });
  await o.next('rematch');
  o.send({ type: 'rematch', gameId });
  const { gameId: next } = await x.next('gameStarted');
  expect((await o.next('gameStarted')).gameId).toBe(next);
  x.send({ type: 'watch', gameId: next });
  expect((await x.next('game')).you).toBe('o');
});

test('the lobby counts players in games and waiting in each pool, and features a game', async () => {
  const app = await newApp();
  const spectator = await visitor(app);
  const lobby = async () => (await spectator.request('GET', '/api/lobby')).json();
  expect((await lobby()).featured).toBeNull();

  const { gameId, x } = await pair(await visitor(app), await visitor(app));
  const waiting = await (await visitor(app)).connect();
  waiting.send({ type: 'seek', timeControl: '5+3', rated: false });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(await lobby()).toMatchObject({
    playing: 2,
    seeking: { '5+3': 1 },
    featured: { live: true, game: { id: gameId } },
  });

  // Games can be fetched by id, with each move's time left.
  x.send({ type: 'move', gameId, move: parseMove('5-5') });
  await x.next('game');
  expect((await spectator.request('GET', `/api/games/${gameId}`)).json()).toMatchObject({
    moves: [parseMove('5-5')],
    clockHistory: [180_000],
  });
  expect((await spectator.request('GET', '/api/games/nonexist')).statusCode).toBe(404);

  // Once it's over, the last game played stands in.
  x.send({ type: 'resign', gameId });
  await x.next('game');
  expect((await lobby()).featured).toMatchObject({
    live: false,
    game: { id: gameId, termination: 'resign' },
  });
});

test('a cancelled challenge can no longer be accepted', async () => {
  const app = await newApp();
  const creator = await (await visitor(app)).connect();
  creator.send({ type: 'createChallenge', timeControl: '3+2', rated: false, color: 'random' });
  const { id } = await creator.next('challengeCreated');
  creator.send({ type: 'cancelChallenge' });

  const accepter = await (await visitor(app)).connect();
  accepter.send({ type: 'acceptChallenge', id });
  expect((await accepter.next('error')).message).toMatch('expired or was cancelled');
});

test('breached passwords are refused', async () => {
  const app = await newApp();
  const response = await (
    await visitor(app)
  ).request('POST', '/api/signup', {
    username: 'dave',
    email: 'dave@example.com',
    password: BREACHED,
  });
  expect(response.statusCode).toBe(400);
  expect(response.json().error).toMatch('data breach');
});

test('account settings need a session', async () => {
  const app = await newApp();
  expect((await (await visitor(app)).request('GET', '/api/account')).statusCode).toBe(401);
});

test('signing out other devices ends their sessions and live connections', async () => {
  const app = await newApp();
  const laptop = await signedUp(app, 'alice');
  const phone = await visitor(app);
  await phone.request('POST', '/api/login', { login: 'alice', password: PASSWORD });
  const phoneSocket = await phone.connect();

  const { sessions } = (await laptop.request('GET', '/api/account')).json();
  expect(sessions).toHaveLength(2);
  expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

  const closed = new Promise((resolve) => phoneSocket.socket.on('close', resolve));
  const after = (await laptop.request('POST', '/api/account/sessions/revoke-others')).json();
  expect(after.sessions).toHaveLength(1);
  await closed;
  expect((await phone.request('GET', '/api/me')).json().user).toBeNull();
  expect((await laptop.request('GET', '/api/me')).json().user.username).toBe('alice');
});

test('changing the password needs the current one and signs out other devices', async () => {
  const app = await newApp();
  const laptop = await signedUp(app, 'alice');
  const phone = await visitor(app);
  await phone.request('POST', '/api/login', { login: 'alice', password: PASSWORD });

  const change = (current: string, password: string) =>
    laptop.request('POST', '/api/account/password', { current, password });
  expect((await change('wrong password', 'a new password')).statusCode).toBe(403);
  expect((await change(PASSWORD, BREACHED)).statusCode).toBe(400);
  expect((await change(PASSWORD, 'a new password')).statusCode).toBe(200);

  expect((await phone.request('GET', '/api/me')).json().user).toBeNull();
  const login = await phone.request('POST', '/api/login', {
    login: 'alice',
    password: 'a new password',
  });
  expect(login.statusCode).toBe(200);
});

test('rated play needs a verified email; verification links work once', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice', { verify: false });
  const socket = await alice.connect();
  socket.send({ type: 'seek', timeControl: '3+2', rated: true });
  expect((await socket.next('error')).message).toBe('Verify your email to play rated games');

  const token = emailedToken('alice@example.com', '/verify-email');
  expect((await alice.request('POST', '/api/verify-email', { token })).statusCode).toBe(200);
  expect((await alice.request('POST', '/api/verify-email', { token })).statusCode).toBe(400);
  expect((await alice.request('GET', '/api/me')).json().user.emailVerified).toBe(true);
});

test('a password reset link sets a new password and signs out every device', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice');
  const stranger = await visitor(app);

  const ask = (email: string) => stranger.request('POST', '/api/password-reset/request', { email });
  expect((await ask('nobody@example.com')).json()).toEqual({ ok: true });
  expect(mailbox.some((message) => message.to === 'nobody@example.com')).toBe(false);
  await ask('alice@example.com');
  const token = emailedToken('alice@example.com', '/reset-password');

  const reset = (password: string) =>
    stranger.request('POST', '/api/password-reset', { token, password });
  expect((await reset(BREACHED)).statusCode).toBe(400);
  expect((await reset('a brand new password')).statusCode).toBe(200);
  expect((await reset('another password')).statusCode).toBe(400);

  expect((await alice.request('GET', '/api/me')).json().user).toBeNull();
  const login = await stranger.request('POST', '/api/login', {
    login: 'alice',
    password: 'a brand new password',
  });
  expect(login.statusCode).toBe(200);
});

test('two-factor authentication: setup, login with a code or a recovery code, and disabling', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice');
  const { secret, uri } = (await alice.request('POST', '/api/account/2fa/setup')).json();
  expect(uri).toContain(`secret=${secret}`);

  // Captured once, so the codes stay right even if a 30 s step boundary passes mid-test.
  const step = currentStep();
  const enable = (code: string) =>
    alice.request('POST', '/api/account/2fa/enable', { secret, code });
  expect((await enable(codeAt(secret, step + 5))).statusCode).toBe(400);
  const enabled = (await enable(codeAt(secret, step))).json();
  expect(enabled.twoFactor).toBe(true);
  expect(enabled.recoveryCodes).toHaveLength(10);

  const phone = await visitor(app);
  const login = (code?: string) =>
    phone.request('POST', '/api/login', { login: 'alice', password: PASSWORD, code });
  expect((await login()).json()).toMatchObject({ twoFactor: true });
  expect((await login('000000')).statusCode).toBe(401);
  // The setup code's step is used up; the next step's code (allowed for clock drift) works once.
  expect((await login(codeAt(secret, step))).statusCode).toBe(401);
  expect((await login(codeAt(secret, step + 1))).statusCode).toBe(200);
  expect((await login(codeAt(secret, step + 1))).statusCode).toBe(401);

  const [recovery] = enabled.recoveryCodes;
  expect((await login(recovery.toUpperCase())).statusCode).toBe(200);
  expect((await login(recovery)).statusCode).toBe(401);

  const disable = (password: string) =>
    alice.request('POST', '/api/account/2fa/disable', { password });
  expect((await disable('wrong password')).statusCode).toBe(403);
  expect((await disable(PASSWORD)).json().twoFactor).toBe(false);
  expect((await login()).statusCode).toBe(200);
});

test('after five wrong two-factor codes, even a right one is refused for a while', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice');
  const { secret } = (await alice.request('POST', '/api/account/2fa/setup')).json();
  const step = currentStep();
  await alice.request('POST', '/api/account/2fa/enable', { secret, code: codeAt(secret, step) });

  const login = (code: string) =>
    alice.request('POST', '/api/login', { login: 'alice', password: PASSWORD, code });
  for (let i = 0; i < 5; i++) expect((await login('000000')).statusCode).toBe(401);
  const locked = await login(codeAt(secret, step + 1));
  expect(locked.statusCode).toBe(429);
  expect(locked.json().error).toMatch('Too many wrong codes');
});

test('emails of one kind go to a user at most once a minute', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice', { verify: false });
  await alice.request('POST', '/api/account/verify-email');
  const stranger = await visitor(app);
  const ask = () =>
    stranger.request('POST', '/api/password-reset/request', { email: 'alice@example.com' });
  await ask();
  await ask();
  expect(mailbox.map((message) => message.subject)).toEqual([
    'Confirm your email',
    'Reset your password',
  ]);
});

test('one address can hold at most 50 live connections', async () => {
  const app = await newApp();
  const guest = await visitor(app);
  await Promise.all(Array.from({ length: 50 }, () => guest.connect()));
  const { socket } = await guest.connect();
  const code = await new Promise((resolve) => socket.on('close', resolve));
  expect(code).toBe(1008);
});

/** Signs up `admin@example.com` (an admin by email) and turns on the two-factor admins need. */
async function admin(app: App) {
  const user = await signedUp(app, 'admin');
  const { secret } = (await user.request('POST', '/api/account/2fa/setup')).json();
  await user.request('POST', '/api/account/2fa/enable', {
    secret,
    code: codeAt(secret, currentStep()),
  });
  return user;
}

test('players can report players; only admins with two-factor see reports', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice');
  await signedUp(app, 'mallory');
  const report = { username: 'mallory', reason: 'abuse', details: 'Insults in every game' };
  expect((await (await visitor(app)).request('POST', '/api/reports', report)).statusCode).toBe(401);
  expect((await alice.request('POST', '/api/reports', report)).statusCode).toBe(200);

  expect((await alice.request('GET', '/api/admin/reports')).statusCode).toBe(403);
  const notYet = await signedUp(app, 'admin');
  expect((await notYet.request('GET', '/api/account')).json().admin).toBe(false);
  expect((await notYet.request('GET', '/api/admin/reports')).statusCode).toBe(403);
});

test('admins close, reopen, rename, and reset players, and every action is logged', async () => {
  const app = await newApp();
  const boss = await admin(app);
  expect((await boss.request('GET', '/api/account')).json().admin).toBe(true);
  const mallory = await signedUp(app, 'mallory');
  await mallory.request('POST', '/api/reports', {
    username: 'admin',
    reason: 'other',
    details: 'Just testing',
  });
  const [{ id }] = (await boss.request('GET', '/api/admin/reports')).json();

  const close = await boss.request('POST', '/api/admin/users/mallory/close', { reason: 'Abuse' });
  expect(close.statusCode).toBe(200);
  expect((await mallory.request('GET', '/api/me')).json().user).toBeNull();
  const login = await mallory.request('POST', '/api/login', {
    login: 'mallory',
    password: PASSWORD,
  });
  expect(login.statusCode).toBe(403);
  expect((await boss.request('GET', '/api/users/mallory')).json().closed).toBe(true);

  await boss.request('POST', '/api/admin/users/mallory/reopen');
  const again = await mallory.request('POST', '/api/login', {
    login: 'mallory',
    password: PASSWORD,
  });
  expect(again.statusCode).toBe(200);

  const rename = (username: string) =>
    boss.request('POST', '/api/admin/users/mallory/rename', { username });
  expect((await rename('admin')).statusCode).toBe(409);
  expect((await rename('friendly')).statusCode).toBe(200);
  expect((await boss.request('GET', '/api/users/friendly')).statusCode).toBe(200);
  await boss.request('POST', '/api/admin/users/friendly/reset-ratings');
  await boss.request('POST', `/api/admin/reports/${id}/resolve`);
  expect((await boss.request('GET', '/api/admin/reports')).json()).toEqual([]);

  const log = (await boss.request('GET', '/api/admin/log')).json();
  expect(log.map((entry: { action: string }) => entry.action)).toEqual([
    'resolve report',
    'reset ratings',
    'rename',
    'reopen account',
    'close account',
  ]);
});

test('following shows who is online and what they are playing', async () => {
  const app = await newApp();
  const [alice, bob, carol] = [
    await signedUp(app, 'alice'),
    await signedUp(app, 'bob'),
    await signedUp(app, 'carol'),
  ];
  expect((await alice.request('POST', '/api/users/alice/follow')).statusCode).toBe(400);
  await alice.request('POST', '/api/users/bob/follow');
  await alice.request('POST', '/api/users/carol/follow');
  expect((await carol.request('GET', '/api/users/bob')).json()).toMatchObject({
    followers: 1,
    following: false,
  });
  expect((await alice.request('GET', '/api/users/bob')).json().following).toBe(true);

  const { gameId } = await pair(bob, await visitor(app));
  expect((await alice.request('GET', '/api/following')).json()).toEqual([
    { username: 'bob', online: true, gameId },
    { username: 'carol', online: false, gameId: null },
  ]);
  await alice.request('POST', '/api/users/carol/unfollow');
  expect((await alice.request('GET', '/api/following')).json()).toHaveLength(1);
});

test('blocked players are never paired, and blocking ends follows', async () => {
  const app = await newApp();
  const [alice, bob] = [await signedUp(app, 'alice'), await signedUp(app, 'bob')];
  await bob.request('POST', '/api/users/alice/follow');
  await alice.request('POST', '/api/users/bob/block');
  expect((await bob.request('GET', '/api/following')).json()).toEqual([]);
  expect((await alice.request('GET', '/api/users/bob')).json().blocked).toBe(true);

  // Seeking the same pool, they wait; a third player gets paired instead.
  const [a, b] = [await alice.connect(), await bob.connect()];
  a.send({ type: 'seek', timeControl: '3+2', rated: false });
  b.send({ type: 'seek', timeControl: '3+2', rated: false });
  const carol = await (await visitor(app)).connect();
  carol.send({ type: 'seek', timeControl: '3+2', rated: false });
  const { gameId } = await carol.next('gameStarted');
  const paired = await Promise.race([a.next('gameStarted'), b.next('gameStarted')]);
  expect(paired.gameId).toBe(gameId);

  b.send({ type: 'cancelSeek' });
  b.send({ type: 'createChallenge', timeControl: '5+3', rated: false, color: 'x' });
  const { id } = await b.next('challengeCreated');
  const blocked = await alice.connect();
  blocked.send({ type: 'acceptChallenge', id });
  expect((await blocked.next('error')).message).toBe("You can't play this player");
});

test('rated games build a rating history, which a ratings reset clears', async () => {
  const app = await newApp();
  const boss = await admin(app);
  const [alice, bob] = [await signedUp(app, 'alice'), await signedUp(app, 'bob')];
  const { gameId, x } = await pair(alice, bob, true);
  x.send({ type: 'move', gameId, move: parseMove('5-5') });
  await x.next('game');
  x.send({ type: 'resign', gameId });
  await x.next('game');

  const { history } = (await bob.request('GET', '/api/users/alice')).json();
  expect(history.blitz).toHaveLength(1);
  expect(history.bullet).toEqual([]);
  await boss.request('POST', '/api/admin/users/alice/reset-ratings');
  expect((await bob.request('GET', '/api/users/alice')).json().history.blitz).toEqual([]);
});

test('arena tournaments pair the players who are ready, and score their games', async () => {
  const app = await newApp();
  const boss = await admin(app);
  const tournament = { name: 'Launch Arena', timeControl: '3+2', rated: false, minutes: 30 };
  const now = { ...tournament, startsAt: new Date().toISOString() };
  expect(
    (await (await signedUp(app, 'carol')).request('POST', '/api/admin/tournaments', now))
      .statusCode,
  ).toBe(403);
  const { id } = (await boss.request('POST', '/api/admin/tournaments', now)).json();
  const later = { ...tournament, startsAt: new Date(Date.now() + 3_600_000).toISOString() };
  const upcoming = (await boss.request('POST', '/api/admin/tournaments', later)).json();

  const guest = await (await visitor(app)).connect();
  guest.send({ type: 'arena', tournamentId: id, ready: true });
  expect((await guest.next('error')).message).toBe('Sign in to play in tournaments');

  const [alice, bob] = [await signedUp(app, 'alice'), await signedUp(app, 'bob')];
  const [a, b] = [await alice.connect(), await bob.connect()];
  a.send({ type: 'arena', tournamentId: id, ready: true });
  b.send({ type: 'arena', tournamentId: id, ready: true });
  const { gameId } = await a.next('gameStarted'); // paired on the next pairing wave
  expect((await b.next('gameStarted')).gameId).toBe(gameId);
  a.send({ type: 'watch', gameId });
  const { game } = await a.next('game');
  expect(game.tournamentId).toBe(id);
  a.send({ type: 'resign', gameId });
  await a.next('game');

  const standings = (await alice.request('GET', `/api/tournaments/${id}`)).json().standings;
  expect(standings).toEqual([
    { username: 'bob', score: 2, games: 1, playing: null },
    { username: 'alice', score: 0, games: 1, playing: null },
  ]);

  const cancel = (tid: string) => boss.request('POST', `/api/admin/tournaments/${tid}/cancel`);
  expect((await cancel(id)).statusCode).toBe(400);
  expect((await cancel(upcoming.id)).statusCode).toBe(200);
  const list = (await alice.request('GET', '/api/tournaments')).json();
  expect(list.current.map((t: { id: string }) => t.id)).toEqual([id]);
});

test('puzzles are rated on the first try, judged by the moves played', async () => {
  const app = await newApp();
  const guest = await visitor(app);
  const shown = (await guest.request('GET', '/api/puzzles/next')).json();
  expect(shown.line.length).toBe(shown.winIn * 2 - 1);
  expect(shown.you).toBeNull();
  expect((await guest.request('GET', '/api/puzzles/daily')).json().daily).toBe(true);
  expect((await guest.request('GET', '/api/puzzles/999999')).statusCode).toBe(404);
  const solve = (user: typeof guest, puzzle: typeof shown, moves: string[]) =>
    user.request('POST', `/api/puzzles/${puzzle.id}/attempt`, { moves });
  expect((await solve(guest, shown, [])).statusCode).toBe(401);

  const alice = await signedUp(app, 'alice');
  // A new player starts on puzzles rated like them.
  const first = (await alice.request('GET', '/api/puzzles/next')).json();
  expect(first.you).toEqual({ rating: 1500, provisional: true, rated: true });
  expect(Math.abs(first.rating - 1500)).toBeLessThan(100);
  // A try sends every move played, both sides.
  const solution = first.line;
  const solved = (await solve(alice, first, solution)).json();
  expect(solved).toMatchObject({ solved: true, puzzle: { plays: 1, you: { rated: false } } });
  expect(solved.change).toBeGreaterThan(0);
  expect(solved.puzzle.rating).toBeLessThan(first.rating);
  // Only the first try counts.
  expect((await solve(alice, first, solution)).json()).toMatchObject({
    solved: true,
    change: null,
  });
  // Stopping short of the win doesn't solve it.
  expect((await solve(alice, first, solution.slice(0, -1))).json().solved).toBe(false);

  const second = (await alice.request('GET', '/api/puzzles/next')).json();
  expect(second.id).not.toBe(first.id);
  const wrong = second.line[0] === '1-1' ? '1-2' : '1-1';
  const failed = (await solve(alice, second, [wrong])).json();
  expect(failed.solved).toBe(false);
  expect(failed.change).toBeLessThan(0);

  const profile = (await alice.request('GET', '/api/users/alice')).json();
  expect(profile.ratings.puzzle.games).toBe(2);
  expect(profile.history.puzzle).toHaveLength(2);
});

test('shared links get previews: a title, a description and a board image', async () => {
  const webRoot = mkdtempSync(join(tmpdir(), 'uttt-web-'));
  writeFileSync(
    join(webRoot, '200.html'),
    '<html><head><title>UTTT</title><meta name="description" content="Play" /></head></html>',
  );
  const app = await buildApp({
    store: new Store(':memory:'),
    webRoot,
    publicUrl: 'https://uttt.test',
  });
  apps.push(app);
  const page = async (url: string) => (await app.inject({ url, headers: HEADERS })).body;

  const puzzle = await page('/puzzles?id=1');
  expect(puzzle).toContain('<title>Puzzle #1 · UTTT</title>');
  expect(puzzle).toMatch(/to play and win\. Can you find it\?/);
  const image = puzzle.match(/property="og:image" content="([^"]+)"/)?.[1] ?? '';
  expect(image).toMatch(/^https:\/\/uttt\.test\/api\/preview\.png\?position=/);

  const png = await app.inject({ url: image.replaceAll('&#38;', '&'), headers: HEADERS });
  expect(png.headers['content-type']).toBe('image/png');
  expect(png.rawPayload.subarray(1, 4).toString()).toBe('PNG');
  const bad = await app.inject({ url: '/api/preview.png?position=nonsense', headers: HEADERS });
  expect(bad.statusCode).toBe(400);

  // Unknown or malformed links fall back to the site's own preview, escaped.
  expect(await page('/game/nonexist')).toContain('<title>UTTT · Ultimate Tic-Tac-Toe</title>');
  expect(await page('/analysis?moves=9-9+bad')).toContain('og:title" content="UTTT · Ultimate');
  expect(await page('/@%3Cscript%3E')).not.toContain('<script>');
});

test('correspondence games wait for an opponent, and email whoever is away when it is their move', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice');
  const bob = await signedUp(app, 'bob');
  const turnEmails = () => mailbox.filter((email) => email.subject.startsWith('Your move'));
  const open = (user: typeof alice, body: object) =>
    user.request('POST', '/api/correspondence', {
      timeControl: '3d',
      rated: true,
      color: 'x',
      listed: true,
      ...body,
    });

  const { id } = (await open(alice, {})).json();
  const guest = await visitor(app);
  expect((await guest.request('GET', '/api/correspondence')).json().open).toEqual([
    { id, username: 'alice', rating: 1500, provisional: true, timeControl: '3d', rated: true },
  ]);
  expect((await guest.request('GET', `/api/challenges/${id}`)).json()).toMatchObject({
    username: 'alice',
    timeControl: '3d',
  });
  // Live challenges can't use days.
  const live = await bob.connect();
  live.send({ type: 'createChallenge', timeControl: '3d', rated: false, color: 'random' });
  expect((await live.next('error')).message).toBe('Invalid message');

  // Bob accepts while Alice is away: she gets an email, since she plays first.
  live.send({ type: 'acceptChallenge', id });
  const { gameId } = await live.next('gameStarted');
  expect(turnEmails()).toMatchObject([
    { to: 'alice@example.com', subject: 'Your move against bob' },
  ]);
  expect(turnEmails()[0].text).toContain(`/game/${gameId}`);
  const games = (await alice.request('GET', '/api/correspondence')).json();
  expect(games.mine).toEqual([]);
  expect(games.games).toMatchObject([{ id: gameId, opponent: 'bob', yourTurn: true }]);
  // Correspondence games aren't live play.
  expect((await guest.request('GET', '/api/lobby')).json().playing).toBe(0);
  expect((await guest.request('GET', '/api/games/live')).json()).toEqual([]);

  // Bob is online when Alice moves, so no email.
  const aliceSocket = await alice.connect();
  aliceSocket.send({ type: 'watch', gameId });
  await aliceSocket.next('game');
  aliceSocket.send({ type: 'move', gameId, move: parseMove('5-5') });
  await aliceSocket.next('game');
  expect(turnEmails()).toHaveLength(1);

  // Players can turn these emails off.
  const carol = await signedUp(app, 'carol');
  await carol.request('POST', '/api/account/turn-emails', { on: false });
  live.send({ type: 'acceptChallenge', id: (await open(carol, {})).json().id });
  await live.next('gameStarted');
  expect(turnEmails()).toHaveLength(1);

  // Open games: at most five, and only their owner cancels them.
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await open(alice, { listed: false })).json().id);
  expect((await open(alice, {})).statusCode).toBe(409);
  expect((await bob.request('POST', `/api/correspondence/${ids[0]}/cancel`)).statusCode).toBe(404);
  expect((await alice.request('POST', `/api/correspondence/${ids[0]}/cancel`)).statusCode).toBe(
    200,
  );
  expect((await guest.request('GET', '/api/correspondence')).json().open).toEqual([]);
});

test("the site's own files are cached and never rate limited; the API is", async () => {
  const webRoot = mkdtempSync(join(tmpdir(), 'uttt-web-'));
  writeFileSync(join(webRoot, '200.html'), '<html><head><title>UTTT</title></head></html>');
  mkdirSync(join(webRoot, '_app/immutable'), { recursive: true });
  writeFileSync(join(webRoot, '_app/immutable/app.abc123.js'), 'export {};');
  const app = await buildApp({
    store: new Store(':memory:'),
    webRoot,
    publicUrl: 'https://uttt.test',
  });
  apps.push(app);
  const get = (url: string) => app.inject({ url, headers: HEADERS });

  for (let i = 0; i < 300; i++) await get('/_app/immutable/app.abc123.js');
  const file = await get('/_app/immutable/app.abc123.js');
  expect(file.statusCode).toBe(200);
  expect(file.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  for (let i = 0; i < 300; i++) await get('/api/health');
  expect((await get('/api/health')).statusCode).toBe(429);
});

test('the health check reports a working database', async () => {
  const app = await newApp();
  expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ ok: true });
});

test('users can download all their data', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice');
  const { gameId, x } = await pair(alice, await signedUp(app, 'bob'));
  x.send({ type: 'resign', gameId });
  await x.next('game');

  const response = await alice.request('GET', '/api/account/export');
  expect(response.headers['content-disposition']).toContain('uttt-alice.json');
  const data = response.json();
  expect(data.account).toMatchObject({ username: 'alice', email: 'alice@example.com' });
  expect(data.sessions).toHaveLength(1);
  expect(data.ratings.blitz.games).toBe(0); // casual game
  expect(data.puzzles).toEqual([]);
  expect(data.games).toHaveLength(1);
  expect(data.games[0]).toMatchObject({ termination: 'resign', moves: [] });
});

test('deleting an account removes it and anonymizes its games', async () => {
  const app = await newApp();
  const alice = await signedUp(app, 'alice');
  const bob = await signedUp(app, 'bob');
  const { gameId, x } = await pair(alice, bob);

  const remove = (password: string) => alice.request('POST', '/api/account/delete', { password });
  expect((await remove('wrong password')).statusCode).toBe(403);
  expect((await remove(PASSWORD)).json().error).toMatch('current game');

  x.send({ type: 'resign', gameId });
  await x.next('game');
  expect((await remove(PASSWORD)).json()).toEqual({ user: null });

  expect((await alice.request('GET', '/api/me')).json().user).toBeNull();
  expect((await bob.request('GET', '/api/users/alice')).statusCode).toBe(404);
  const [game] = (await bob.request('GET', '/api/users/bob')).json().games;
  const names = [game.players.x.username, game.players.o.username];
  expect(names.sort()).toEqual(['bob', null].sort());
  // The name is free again.
  await signedUp(app, 'alice');
});
