import {
  categoryOf,
  ClientMessage,
  type Player,
  type ServerMessage,
  type TimeControl,
} from '@uttt/core';
import type { FastifyBaseLogger } from 'fastify';
import { randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { Identity } from './auth.ts';
import { GameError, LiveGame, type GameInit, type Seat } from './game.ts';
import { toState, type Store } from './store.ts';

/** Per-connection flood protection: more messages than this per second closes the socket. */
const MAX_MESSAGES_PER_SECOND = 20;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

interface Client {
  socket: WebSocket;
  identity: Identity;
  window: { start: number; count: number };
}

interface Seek {
  client: Client;
  timeControl: TimeControl;
  rated: boolean;
}

interface Challenge extends Seek {
  color: Player | 'random';
}

const newId = () => Array.from({ length: 8 }, () => ID_ALPHABET[randomInt(62)]).join('');
const randomSide = (): Player => (randomInt(2) === 0 ? 'x' : 'o');

function send(client: Client, message: ServerMessage): void {
  if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(message));
}

/** Real-time play: WebSocket clients, matchmaking, challenges, and the games in progress. */
export class Hub {
  private readonly games = new Map<string, LiveGame>();
  private readonly watchers = new Map<string, Set<Client>>();
  private readonly challenges = new Map<string, Challenge>();
  private seeks: Seek[] = [];
  private readonly store: Store;
  private readonly log: FastifyBaseLogger;

  constructor(store: Store, log: FastifyBaseLogger) {
    this.store = store;
    this.log = log;
    for (const init of store.activeGames()) this.addGame(init);
  }

  connect(socket: WebSocket, identity: Identity): void {
    const client: Client = { socket, identity, window: { start: Date.now(), count: 0 } };
    socket.on('message', (data) => this.receive(client, String(data)));
    socket.on('close', () => this.disconnect(client));
  }

  challenge(id: string) {
    const challenge = this.challenges.get(id);
    if (!challenge) return undefined;
    const { client, timeControl, rated, color } = challenge;
    return { username: client.identity.user?.username ?? null, timeControl, rated, color };
  }

  private receive(client: Client, data: string): void {
    const now = Date.now();
    if (now - client.window.start >= 1000) client.window = { start: now, count: 0 };
    if (++client.window.count > MAX_MESSAGES_PER_SECOND) {
      return client.socket.close(1008, 'Too many messages');
    }

    let message: ClientMessage;
    try {
      message = ClientMessage.parse(JSON.parse(data));
    } catch {
      return send(client, { type: 'error', message: 'Invalid message' });
    }
    try {
      this.handle(client, message);
    } catch (error) {
      if (!(error instanceof GameError)) this.log.error(error);
      const text = error instanceof GameError ? error.message : 'Something went wrong';
      send(client, { type: 'error', message: text });
    }
  }

  private handle(client: Client, message: ClientMessage): void {
    const { key } = client.identity;
    switch (message.type) {
      case 'seek':
        return this.seek({ client, ...message });
      case 'cancelSeek':
        this.seeks = this.seeks.filter((seek) => seek.client !== client);
        return;
      case 'createChallenge':
        return this.createChallenge({ client, ...message });
      case 'cancelChallenge':
        return this.cancelChallenges(client);
      case 'acceptChallenge':
        return this.acceptChallenge(client, message.id);
      case 'watch':
        return this.watch(client, message.gameId);
      case 'move':
        return this.liveGame(message.gameId).move(key, message.move);
      case 'draw':
        return this.liveGame(message.gameId).draw(key);
      case 'resign':
        return this.liveGame(message.gameId).resign(key);
      case 'abort':
        return this.liveGame(message.gameId).abort(key);
    }
  }

  /** Pairs with the longest-waiting compatible seek, or waits for one. */
  private seek(seek: Seek): void {
    requireAccountIfRated(seek);
    this.seeks = this.seeks.filter((s) => s.client !== seek.client);
    const match = this.seeks.find(
      (s) =>
        s.timeControl === seek.timeControl &&
        s.rated === seek.rated &&
        s.client.identity.key !== seek.client.identity.key,
    );
    if (!match) {
      this.seeks.push(seek);
      return;
    }
    this.seeks = this.seeks.filter((s) => s !== match);
    const [x, o] = randomSide() === 'x' ? [seek.client, match.client] : [match.client, seek.client];
    this.startGame(x, o, seek.timeControl, seek.rated);
  }

  private createChallenge(challenge: Challenge): void {
    requireAccountIfRated(challenge);
    this.cancelChallenges(challenge.client);
    const id = newId();
    this.challenges.set(id, challenge);
    send(challenge.client, { type: 'challengeCreated', id });
  }

  private cancelChallenges(client: Client): void {
    for (const [id, challenge] of this.challenges) {
      if (challenge.client === client) this.challenges.delete(id);
    }
  }

  private acceptChallenge(client: Client, id: string): void {
    const challenge = this.challenges.get(id);
    if (!challenge) throw new GameError('This challenge has expired or was cancelled');
    if (challenge.client.identity.key === client.identity.key) {
      throw new GameError("You can't accept your own challenge");
    }
    requireAccountIfRated({ ...challenge, client });
    this.challenges.delete(id);
    const creatorSide = challenge.color === 'random' ? randomSide() : challenge.color;
    const [x, o] = creatorSide === 'x' ? [challenge.client, client] : [client, challenge.client];
    this.startGame(x, o, challenge.timeControl, challenge.rated);
  }

  private startGame(x: Client, o: Client, timeControl: TimeControl, rated: boolean): void {
    const seat = ({ key, user }: Identity): Seat => {
      const rating = user ? this.store.rating(user.id, categoryOf(timeControl)) : null;
      return {
        key,
        userId: user?.id ?? null,
        username: user?.username ?? null,
        rating: rating && Math.round(rating.rating),
        provisional: rating?.provisional ?? false,
        ratingDiff: null,
      };
    };
    const seats = { x: seat(x.identity), o: seat(o.identity) };
    const game = this.addGame({ id: newId(), timeControl, rated, seats });
    this.store.saveGame(game);
    for (const client of [x, o]) send(client, { type: 'gameStarted', gameId: game.id });
  }

  private addGame(init: GameInit): LiveGame {
    const game = new LiveGame(init, (changed) => this.onGameChange(changed));
    this.games.set(game.id, game);
    return game;
  }

  private onGameChange(game: LiveGame): void {
    const { seats, outcome } = game;
    if (game.termination) {
      this.games.delete(game.id);
      if (game.rated && outcome && seats.x.userId && seats.o.userId) {
        const userIds = { x: seats.x.userId, o: seats.o.userId };
        const diffs = this.store.rateGame(userIds, categoryOf(game.timeControl), outcome);
        seats.x.ratingDiff = diffs.x;
        seats.o.ratingDiff = diffs.o;
      }
    }
    this.store.saveGame(game);
    const state = game.state();
    for (const client of this.watchers.get(game.id) ?? []) {
      send(client, { type: 'game', game: state, you: game.sideOf(client.identity.key) });
    }
    if (game.termination) this.watchers.delete(game.id);
  }

  /** Subscribes to a game's updates; works for live and finished games alike. */
  private watch(client: Client, gameId: string): void {
    const { key } = client.identity;
    const live = this.games.get(gameId);
    if (live) {
      const watchers = this.watchers.get(gameId) ?? new Set();
      this.watchers.set(gameId, watchers.add(client));
      return send(client, { type: 'game', game: live.state(), you: live.sideOf(key) });
    }
    const row = this.store.game(gameId);
    if (!row) throw new GameError('Game not found');
    const you = row.xKey === key ? 'x' : row.oKey === key ? 'o' : null;
    send(client, { type: 'game', game: toState(row), you });
  }

  private liveGame(id: string): LiveGame {
    const game = this.games.get(id);
    if (!game) throw new GameError('This game is over');
    return game;
  }

  private disconnect(client: Client): void {
    this.seeks = this.seeks.filter((seek) => seek.client !== client);
    this.cancelChallenges(client);
    for (const [gameId, watchers] of this.watchers) {
      watchers.delete(client);
      if (watchers.size === 0) this.watchers.delete(gameId);
    }
  }
}

function requireAccountIfRated({ client, rated }: Seek): void {
  if (rated && !client.identity.user) throw new GameError('Sign in to play rated games');
}
