import { parseMove, type ServerMessage } from '@uttt/core';
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
    sendMail: async (message) => void mailbox.push(message),
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
