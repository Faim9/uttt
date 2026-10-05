import {
  categoryOf,
  ClientMessage,
  other,
  type GameState,
  type Player,
  type ServerMessage,
  type TimeControl,
} from '@uttt/core';
import type { FastifyBaseLogger } from 'fastify';
import { randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { Identity } from './auth.ts';
import type { Emails } from './email.ts';
import { GameError, LiveGame, type GameInit, type Seat } from './game.ts';
import { DEFAULT_RATING } from './glicko.ts';
import { matchmake, type PoolMember } from './matchmaking.ts';
import { toState, type Store } from './store.ts';

/** Per-connection flood protection: more messages than this per second closes the socket. */
const MAX_MESSAGES_PER_SECOND = 20;
/**
 * Every tick, waiting players are re-paired (each wave unpaired widens the rating gap they accept) and
 * every connection is pinged to measure its lag.
 */
const TICK_MS = 2000;
/** How long after a game its players can still agree to a rematch. */
const REMATCH_MS = 5 * 60_000;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

interface Client {
  socket: WebSocket;
  identity: Identity;
  window: { start: number; count: number };
  /** Estimated one-way network delay in ms (half the ping round trip, smoothed). */
  lag: number;
  pingSentAt: number;
}

interface Seek extends PoolMember {
  client: Client;
  timeControl: TimeControl;
  rated: boolean;
  /** Bots wait in pools of their own: people are never paired with them by chance. */
  bot: boolean;
}

interface Rematch {
  seats: Record<Player, Seat>;
  timeControl: TimeControl;
  rated: boolean;
  offer: Player | null;
  endedAt: number;
}

interface Challenge {
  client: Client;
  timeControl: TimeControl;
  rated: boolean;
  color: Player | 'random';
  /** For a direct challenge, the player it's for (their key); null for one shared by link. */
  to: string | null;
}

export const newId = () => Array.from({ length: 8 }, () => ID_ALPHABET[randomInt(62)]).join('');
const randomSide = (): Player => (randomInt(2) === 0 ? 'x' : 'o');
/** Who sits at a board: a connection's identity, or a player who may be offline (correspondence). */
type Sitter = Pick<Identity, 'key' | 'user'>;

function send(client: Client, message: ServerMessage): void {
  if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(message));
}

/** Real-time play: WebSocket clients, matchmaking, challenges, and the games in progress. */
export class Hub {
  private readonly clients = new Set<Client>();
  private readonly games = new Map<string, LiveGame>();
  private readonly watchers = new Map<string, Set<Client>>();
  private readonly challenges = new Map<string, Challenge>();
  /** Finished games whose players may still agree to a rematch. */
  private readonly rematches = new Map<string, Rematch>();
  /** Per tournament, the connections ready to be paired there (on the tournament page, not in a game). */
  private readonly arenas = new Map<string, Set<Client>>();
  /** Each player's last tournament opponent, so pairing avoids an immediate rematch. */
  private readonly lastOpponent = new Map<string, string>();
  private seeks: Seek[] = [];
  private readonly store: Store;
  private readonly emails: Emails;
  private readonly log: FastifyBaseLogger;
  private readonly ticker: ReturnType<typeof setInterval>;

  constructor(store: Store, emails: Emails, log: FastifyBaseLogger) {
    this.store = store;
    this.emails = emails;
    this.log = log;
    for (const init of store.activeGames()) this.addGame(init);
    this.ticker = setInterval(() => {
      this.pairSeeks(true);
      this.pairArenas();
      this.pingClients();
      this.expireRematches();
    }, TICK_MS);
  }

  close(): void {
    clearInterval(this.ticker);
  }

  connect(socket: WebSocket, identity: Identity): void {
    const client: Client = {
      socket,
      identity,
      window: { start: Date.now(), count: 0 },
      lag: 0,
      pingSentAt: 0,
    };
    this.clients.add(client);
    socket.on('pong', () => {
      const oneWay = (Date.now() - client.pingSentAt) / 2;
      client.lag = client.lag === 0 ? oneWay : 0.7 * client.lag + 0.3 * oneWay;
    });
    socket.on('message', (data) => this.receive(client, String(data)));
    socket.on('close', () => this.disconnect(client));
    // A bot that reconnects (after a restart, say) picks up the games it's still in.
    const { user } = identity;
    if (user?.bot) {
      for (const game of this.gamesOf(user.id))
        send(client, { type: 'gameStarted', gameId: game.id });
    }
  }

  /** Disconnects sockets opened with these (now revoked) sessions; they reconnect as guests. */
  endSessions(sessionIds: string[]): void {
    for (const client of this.clients) {
      const { sessionId } = client.identity;
      if (sessionId && sessionIds.includes(sessionId)) client.socket.close(4001, 'Signed out');
    }
  }

  /** The user's games that haven't ended, correspondence included unless `live`. */
  private gamesOf(userId: number, live = false): LiveGame[] {
    return [...this.games.values()].filter(
      (game) =>
        (game.seats.x.userId === userId || game.seats.o.userId === userId) &&
        !(live && game.correspondence),
    );
  }

  /** Whether the user is in a game that hasn't ended. */
  isPlaying(userId: number): boolean {
    return this.gamesOf(userId).length > 0;
  }

  /** Whether a user is connected, and the live game they're playing, if any; for their followers. */
  status(userId: number): { online: boolean; gameId: string | null } {
    const key = `u:${userId}`;
    const online = [...this.clients].some((client) => client.identity.key === key);
    return { online, gameId: this.gamesOf(userId, true)[0]?.id ?? null };
  }

  /** The user's correspondence games in progress: the ones where it's their move first, then by time left. */
  correspondenceGames(userId: number) {
    const now = Date.now();
    return this.gamesOf(userId)
      .filter((game) => game.correspondence)
      .map((game) => {
        const you = game.seats.x.userId === userId ? 'x' : 'o';
        const { clocks, running } = game.state(now);
        return {
          id: game.id,
          opponent: game.seats[other(you)].username,
          timeControl: game.timeControl,
          yourTurn: running === you,
          timeLeft: running ? clocks[running] : 0,
        };
      })
      .sort((a, b) => Number(b.yourTurn) - Number(a.yourTurn) || a.timeLeft - b.timeLeft);
  }

  /** Bots connected right now, for people looking for one to play. */
  onlineBots(): { username: string; playing: boolean }[] {
    const bots = new Map<string, { username: string; playing: boolean }>();
    for (const { identity } of this.clients) {
      const { user } = identity;
      if (!user?.bot || bots.has(user.username)) continue;
      bots.set(user.username, {
        username: user.username,
        playing: this.gamesOf(user.id, true).length > 0,
      });
    }
    return [...bots.values()];
  }

  /** Games where both players are online right now (no correspondence). */
  private liveOnly(): LiveGame[] {
    return [...this.games.values()].filter((game) => !game.correspondence);
  }

  /** What's happening right now, guests included: players in games, and who's waiting in each pool. */
  activity(): { playing: number; seeking: Record<string, number> } {
    const seeking: Record<string, number> = {};
    for (const seek of this.seeks.filter(({ bot }) => !bot)) {
      const pool = seek.rated ? `${seek.timeControl} rated` : seek.timeControl;
      seeking[pool] = (seeking[pool] ?? 0) + 1;
    }
    return { playing: this.liveOnly().length * 2, seeking };
  }

  /** Games in progress for spectators, strongest players first. */
  liveGames(limit = 30): GameState[] {
    const strength = ({ seats }: LiveGame) => (seats.x.rating ?? 0) + (seats.o.rating ?? 0);
    return this.liveOnly()
      .sort((a, b) => strength(b) - strength(a))
      .slice(0, limit)
      .map((game) => game.state());
  }

  /** A challenge by link: a live one (in memory), or a stored correspondence one. */
  challenge(id: string) {
    const live = this.challenges.get(id);
    if (live) {
      const { client, timeControl, rated, color } = live;
      return { username: client.identity.user?.username ?? null, timeControl, rated, color };
    }
    const stored = this.store.correspondenceChallenge(id);
    if (!stored) return undefined;
    const { username, timeControl, rated, color } = stored;
    return { username, timeControl: timeControl as TimeControl, rated, color };
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
        return this.seek(client, message.timeControl, message.rated);
      case 'cancelSeek':
        this.seeks = this.seeks.filter((seek) => seek.client !== client);
        return;
      case 'createChallenge':
        this.createChallenge({ client, ...message, to: null });
        return;
      case 'challengeUser':
        return this.challengeUser(client, message);
      case 'cancelChallenge':
        return this.cancelChallenges(client);
      case 'acceptChallenge':
        return this.acceptChallenge(client, message.id);
      case 'declineChallenge':
        return this.declineChallenge(client, message.id);
      case 'watch':
        return this.watch(client, message.gameId);
      case 'move': {
        const game = this.liveGame(message.gameId);
        game.move(key, message.move, client.lag);
        return this.notifyTurn(game);
      }
      case 'draw':
        return this.liveGame(message.gameId).draw(key);
      case 'resign':
        return this.liveGame(message.gameId).resign(key);
      case 'abort':
        return this.liveGame(message.gameId).abort(key);
      case 'claim':
        return this.liveGame(message.gameId).claim(key, message.result);
      case 'rematch':
        return this.rematch(client, message.gameId);
      case 'cancelRematch':
        return this.cancelRematch(client, message.gameId);
      case 'arena':
        return this.arena(client, message.tournamentId, message.ready);
    }
  }

  /** Joins the pool for a time control; guests count as provisional 1500s. */
  private seek(client: Client, timeControl: TimeControl, rated: boolean): void {
    requireAccountIfRated({ client, rated });
    const { key, user } = client.identity;
    const rating = user
      ? this.store.rating(user.id, categoryOf(timeControl))
      : { ...DEFAULT_RATING, provisional: true };
    this.seeks = this.seeks.filter((s) => s.client !== client);
    this.seeks.push({
      client,
      timeControl,
      rated,
      key,
      rating: rating.rating,
      provisional: rating.provisional,
      avoid: user ? this.store.blockedKeys(user.id) : undefined,
      misses: 0,
      bot: user?.bot ?? false,
    });
    this.pairSeeks(false);
  }

  /**
   * Browsers answer WebSocket pings automatically, so lag is measured by the server. A client that delays
   * its answers to look laggier gains at most its lag quota.
   */
  private pingClients(): void {
    for (const client of this.clients) {
      if (client.socket.readyState !== client.socket.OPEN) continue;
      client.pingSentAt = Date.now();
      client.socket.ping();
    }
  }

  /**
   * Pairs each pool (time control + rated, people or bots) by rating. Runs on every new seek, so equal
   * players meet at once, and on a timer, where every wave a player stays unpaired widens the gap they accept.
   */
  private pairSeeks(wave: boolean): void {
    const pools = new Map<string, Seek[]>();
    for (const seek of this.seeks) {
      const pool = `${seek.timeControl} ${seek.rated} ${seek.bot}`;
      pools.set(pool, [...(pools.get(pool) ?? []), seek]);
    }
    const paired = new Set<Seek>();
    for (const pool of pools.values()) {
      for (const [a, b] of matchmake(pool)) {
        paired.add(a).add(b);
        const [x, o] = randomSide() === 'x' ? [a.client, b.client] : [b.client, a.client];
        this.startGame(x, o, a.timeControl, a.rated);
      }
    }
    this.seeks = this.seeks.filter((seek) => !paired.has(seek));
    if (wave) for (const seek of this.seeks) seek.misses++;
  }

  private createChallenge(challenge: Challenge): string {
    requireAccountIfRated(challenge);
    this.cancelChallenges(challenge.client);
    const id = newId();
    this.challenges.set(id, challenge);
    send(challenge.client, { type: 'challengeCreated', id });
    return id;
  }

  /** Challenges one player who's online; every connection of theirs hears about it. */
  private challengeUser(
    client: Client,
    { username, timeControl, rated, color }: Extract<ClientMessage, { type: 'challengeUser' }>,
  ): void {
    if (!client.identity.user) throw new GameError('Sign in to challenge players');
    const target = this.store.userByName(username);
    const key = `u:${target?.id}`;
    const theirs = [...this.clients].filter((c) => c.identity.key === key);
    if (!target || target.closedAt || theirs.length === 0) {
      throw new GameError(`${username} isn't online right now`);
    }
    if (key === client.identity.key) throw new GameError("You can't challenge yourself");
    this.refuseIfBlocked(client, theirs[0]);
    refuseRatedAgainstBots(rated, client.identity.user?.bot ?? false, target.bot);
    const id = this.createChallenge({ client, timeControl, rated, color, to: key });
    const { user } = client.identity;
    const challenge = { id, from: user?.username ?? null, bot: user?.bot ?? false };
    for (const them of theirs) {
      send(them, { type: 'challenge', challenge: { ...challenge, timeControl, rated, color } });
    }
  }

  /** Withdraws the client's challenges; the players they were for hear that they're off. */
  private cancelChallenges(client: Client): void {
    for (const [id, challenge] of this.challenges) {
      if (challenge.client !== client) continue;
      this.challenges.delete(id);
      if (challenge.to) this.tell(challenge.to, { type: 'challengeGone', id });
    }
  }

  private declineChallenge(client: Client, id: string): void {
    const challenge = this.challenges.get(id);
    if (!challenge || challenge.to !== client.identity.key) return;
    this.challenges.delete(id);
    send(challenge.client, { type: 'challengeGone', id });
    this.tell(challenge.to, { type: 'challengeGone', id });
  }

  /** Sends a message to every connection of one player. */
  private tell(key: string, message: ServerMessage): void {
    for (const client of this.clients) if (client.identity.key === key) send(client, message);
  }

  private acceptChallenge(client: Client, id: string): void {
    const challenge = this.challenges.get(id);
    if (!challenge) {
      const gameId = this.acceptCorrespondence(id, client.identity);
      return send(client, { type: 'gameStarted', gameId });
    }
    if (challenge.client.identity.key === client.identity.key) {
      throw new GameError("You can't accept your own challenge");
    }
    if (challenge.to !== null && challenge.to !== client.identity.key) {
      throw new GameError('This challenge is for another player');
    }
    requireAccountIfRated({ ...challenge, client });
    this.refuseIfBlocked(challenge.client, client);
    const bots = [challenge.client, client].map(({ identity }) => identity.user?.bot ?? false);
    refuseRatedAgainstBots(challenge.rated, bots[0], bots[1]);
    this.challenges.delete(id);
    // Other tabs of the player it was for can drop it.
    if (challenge.to) this.tell(challenge.to, { type: 'challengeGone', id });
    const creatorSide = challenge.color === 'random' ? randomSide() : challenge.color;
    const [x, o] = creatorSide === 'x' ? [challenge.client, client] : [client, challenge.client];
    this.startGame(x, o, challenge.timeControl, challenge.rated);
  }

  /**
   * Starts a correspondence game from a stored challenge. Its creator may be offline: they'll find the
   * game on the home page (and by email, when it's their move).
   */
  private acceptCorrespondence(id: string, identity: Identity): string {
    const challenge = this.store.correspondenceChallenge(id);
    if (!challenge) throw new GameError('This challenge has expired or was cancelled');
    const { user } = identity;
    if (!user) throw new GameError('Sign in to play correspondence games');
    if (user.bot) throw new GameError('Bots play live games only');
    if (challenge.userId === user.id) throw new GameError("You can't accept your own challenge");
    if (challenge.rated && !user.emailVerified) {
      throw new GameError('Verify your email to play rated games');
    }
    if (this.store.blockedKeys(user.id).has(`u:${challenge.userId}`)) {
      throw new GameError("You can't play this player");
    }
    if (!this.store.deleteCorrespondenceChallenge(id)) {
      throw new GameError('Someone else accepted this challenge first');
    }
    const creator: Sitter = {
      key: `u:${challenge.userId}`,
      // Bots don't play correspondence, so the creator is a person.
      user: { id: challenge.userId, username: challenge.username, emailVerified: true, bot: false },
    };
    const creatorSide = challenge.color === 'random' ? randomSide() : challenge.color;
    const [x, o] = creatorSide === 'x' ? [creator, identity] : [identity, creator];
    const game = this.createGame(x, o, challenge.timeControl as TimeControl, challenge.rated);
    this.notifyTurn(game);
    return game.id;
  }

  /** Emails the player to move in a correspondence game, unless they're on the site right now. */
  private notifyTurn(game: LiveGame): void {
    if (!game.correspondence || game.termination) return;
    const { turn } = game.position;
    const seat = game.seats[turn];
    const online = [...this.clients].some((client) => client.identity.key === seat.key);
    if (online || seat.userId === null) return;
    const opponent = game.seats[other(turn)].username ?? 'your opponent';
    this.emails.yourTurn(seat.userId, opponent, game).catch((error) => this.log.error(error));
  }

  private startGame(
    x: Client,
    o: Client,
    timeControl: TimeControl,
    rated: boolean,
    tournamentId: string | null = null,
  ): void {
    const game = this.createGame(x.identity, o.identity, timeControl, rated, tournamentId);
    for (const client of [x, o]) send(client, { type: 'gameStarted', gameId: game.id });
  }

  private createGame(
    x: Sitter,
    o: Sitter,
    timeControl: TimeControl,
    rated: boolean,
    tournamentId: string | null = null,
  ): LiveGame {
    const seat = ({ key, user }: Sitter): Seat => {
      const rating = user ? this.store.rating(user.id, categoryOf(timeControl)) : null;
      return {
        key,
        userId: user?.id ?? null,
        username: user?.username ?? null,
        bot: user?.bot ?? false,
        rating: rating && Math.round(rating.rating),
        provisional: rating?.provisional ?? false,
        ratingDiff: null,
      };
    };
    const seats = { x: seat(x), o: seat(o) };
    const game = this.addGame({ id: newId(), timeControl, rated, seats, tournamentId });
    this.store.saveGame(game);
    return game;
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
    if (game.termination) {
      const { timeControl, rated } = game;
      this.rematches.set(game.id, { seats, timeControl, rated, offer: null, endedAt: Date.now() });
    }
    const state = game.state();
    for (const client of this.watchers.get(game.id) ?? []) {
      send(client, { type: 'game', game: state, you: game.sideOf(client.identity.key) });
    }
    if (game.termination) this.watchers.delete(game.id);
  }

  /** Offers a rematch, or accepts the opponent's offer: then a new game starts with colors swapped. */
  private rematch(client: Client, gameId: string): void {
    const { rematch, side } = this.rematchFor(client, gameId);
    const opponentKey = rematch.seats[other(side)].key;
    const opponent = [...this.clients].findLast((c) => c.identity.key === opponentKey);
    if (!opponent) throw new GameError('Your opponent has left');
    this.refuseIfBlocked(client, opponent);
    if (rematch.offer !== other(side)) {
      rematch.offer = side;
      return this.notifyRematch(gameId, rematch);
    }
    this.rematches.delete(gameId);
    const [x, o] = side === 'o' ? [client, opponent] : [opponent, client];
    this.startGame(x, o, rematch.timeControl, rematch.rated);
  }

  private cancelRematch(client: Client, gameId: string): void {
    const { rematch } = this.rematchFor(client, gameId);
    rematch.offer = null;
    this.notifyRematch(gameId, rematch);
  }

  private rematchFor(client: Client, gameId: string) {
    const rematch = this.rematches.get(gameId);
    if (!rematch) throw new GameError('Too late for a rematch');
    const { key } = client.identity;
    const side = rematch.seats.x.key === key ? 'x' : rematch.seats.o.key === key ? 'o' : null;
    if (!side) throw new GameError('You did not play this game');
    return { rematch, side } as const;
  }

  /** Players who blocked each other, either way, don't play each other. */
  private refuseIfBlocked(a: Client, b: Client): void {
    if (this.blocked(a, b)) throw new GameError("You can't play this player");
  }

  private blocked(a: Client, b: Client): boolean {
    const [userA, userB] = [a.identity.user, b.identity.user];
    return !!userA && !!userB && this.store.blockedKeys(userA.id).has(`u:${userB.id}`);
  }

  /** Joins a tournament and gets ready to be paired there, or pauses between games. */
  private arena(client: Client, tournamentId: string, ready: boolean): void {
    if (!ready) {
      this.arenas.get(tournamentId)?.delete(client);
      return;
    }
    const { user } = client.identity;
    if (!user) throw new GameError('Sign in to play in tournaments');
    if (user.bot) throw new GameError('Tournaments are for people, not bots');
    const tournament = this.store.tournament(tournamentId);
    if (!tournament || tournament.endsAt.getTime() <= Date.now()) {
      throw new GameError('This tournament is over');
    }
    requireAccountIfRated({ client, rated: tournament.rated });
    this.store.joinTournament(tournamentId, user.id);
    const clients = this.arenas.get(tournamentId) ?? new Set();
    this.arenas.set(tournamentId, clients.add(client));
  }

  /**
   * Pairs the ready players of every running tournament, closest scores first, avoiding blocked players
   * and (when anyone else is free) the opponent they just played. Paired players leave the ready list
   * until they're back on the tournament page.
   */
  private pairArenas(): void {
    const now = Date.now();
    for (const [id, ready] of this.arenas) {
      const tournament = this.store.tournament(id);
      if (!tournament || tournament.endsAt.getTime() <= now) {
        this.arenas.delete(id);
        continue;
      }
      if (tournament.startsAt.getTime() > now) continue;

      // One connection per player, and nobody who's already playing.
      const waiting = new Map<string, Client>();
      for (const client of ready) {
        const { key, user } = client.identity;
        if (user && this.gamesOf(user.id, true).length === 0) waiting.set(key, client);
      }
      if (waiting.size < 2) continue;
      const scores = new Map(this.store.standings(id).map((row) => [`u:${row.userId}`, row.score]));
      const score = (client: Client) => scores.get(client.identity.key) ?? 0;
      const queue = [...waiting.values()].sort((a, b) => score(b) - score(a));

      while (queue.length >= 2) {
        const a = queue.shift() as Client;
        const fresh = (b: Client) => this.lastOpponent.get(a.identity.key) !== b.identity.key;
        let index = queue.findIndex((b) => fresh(b) && !this.blocked(a, b));
        if (index < 0) index = queue.findIndex((b) => !this.blocked(a, b));
        if (index < 0) continue;
        const [b] = queue.splice(index, 1);
        ready.delete(a);
        ready.delete(b);
        this.lastOpponent.set(a.identity.key, b.identity.key);
        this.lastOpponent.set(b.identity.key, a.identity.key);
        const [x, o] = randomSide() === 'x' ? [a, b] : [b, a];
        this.startGame(x, o, tournament.timeControl as TimeControl, tournament.rated, id);
      }
    }
  }

  /** Tells every connection of both players who has offered a rematch. */
  private notifyRematch(gameId: string, { seats, offer }: Rematch): void {
    for (const client of this.clients) {
      const { key } = client.identity;
      if (key === seats.x.key || key === seats.o.key) {
        send(client, { type: 'rematch', gameId, by: offer });
      }
    }
  }

  private expireRematches(): void {
    for (const [id, { endedAt }] of this.rematches) {
      if (Date.now() - endedAt > REMATCH_MS) this.rematches.delete(id);
    }
  }

  /** Subscribes to a game's updates; works for live and finished games alike. */
  private watch(client: Client, gameId: string): void {
    const { key } = client.identity;
    const live = this.games.get(gameId);
    if (live) {
      const watchers = this.watchers.get(gameId) ?? new Set();
      this.watchers.set(gameId, watchers.add(client));
      const side = live.sideOf(key);
      send(client, { type: 'game', game: live.state(), you: side });
      if (side) live.setPresence(side, true);
      return;
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
    this.clients.delete(client);
    for (const ready of this.arenas.values()) ready.delete(client);
    this.seeks = this.seeks.filter((seek) => seek.client !== client);
    this.cancelChallenges(client);
    for (const [gameId, watchers] of this.watchers) {
      if (!watchers.delete(client)) continue;
      if (watchers.size === 0) this.watchers.delete(gameId);
      // A player whose last connection to a running game drops is marked as gone.
      const game = this.games.get(gameId);
      const side = game?.sideOf(client.identity.key);
      const stillHere = [...watchers].some((c) => c.identity.key === client.identity.key);
      if (game && side && !stillHere) game.setPresence(side, false);
    }
  }
}

/** Rated games are people against people, or bots against bots: the two ladders stay apart. */
function refuseRatedAgainstBots(rated: boolean, aIsBot: boolean, bIsBot: boolean): void {
  if (rated && aIsBot !== bIsBot) throw new GameError('Games between people and bots are casual');
}

function requireAccountIfRated({ client, rated }: { client: Client; rated: boolean }): void {
  if (!rated) return;
  const { user } = client.identity;
  if (!user) throw new GameError('Sign in to play rated games');
  if (!user.emailVerified) throw new GameError('Verify your email to play rated games');
}
