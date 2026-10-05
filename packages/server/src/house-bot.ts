import { replay, Search, TIME_CONTROLS, type ServerMessage, type TimeControl } from '@uttt/core';
import { fileURLToPath } from 'node:url';

/**
 * The house bot: an account of ours that's always online in the bot pools, so a newly written bot finds a
 * game at once, and people can challenge it from the leaderboard. It plays with the site's own engine and
 * connects through the bot API (docs/bot-api.md) like any other bot, as its own process, so the engine's
 * thinking never holds up the game server.
 */

/** The least time per move: stays well under the server's limit of 20 messages a second per connection. */
const MIN_MOVE_MS = 100;

/** The browser-style WebSocket both Node's global `WebSocket` and the `ws` package provide. */
export interface BotSocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'close', listener: () => void): void;
}

interface Options {
  /** Games at once; past it, the bot stops looking and declines challenges. */
  maxGames?: number;
  /** Longest think per move, in milliseconds; less when the clock runs low. */
  thinkMs?: number;
  /** Wait before reconnecting a dropped connection, in milliseconds. */
  retryMs?: number;
}

/**
 * One connection per pool (time control, rated or casual), since a connection waits in one pool at a time.
 * Each connection plays at most one game.
 */
interface Slot {
  timeControl: TimeControl;
  rated: boolean;
  socket: BotSocket | null;
  seeking: boolean;
  gameId: string | null;
}

/** Runs the house bot until `stop()`; `connect` opens one authenticated connection. */
export function houseBot(
  connect: () => Promise<BotSocket>,
  { maxGames = 3, thinkMs = 1000, retryMs = 5000 }: Options = {},
) {
  const slots: Slot[] = TIME_CONTROLS.flatMap((timeControl) =>
    [true, false].map((rated) => ({
      timeControl,
      rated,
      socket: null,
      seeking: false,
      gameId: null,
    })),
  );
  /** Positions already answered, as `gameId:ply`, since a game's state also arrives when nothing changed. */
  const answered = new Set<string>();
  /** Challenges reach every connection; each is answered once. */
  const challenges = new Set<string>();
  let stopped = false;

  const send = (slot: Slot, message: object) => slot.socket?.send(JSON.stringify(message));
  const playing = () => slots.filter((slot) => slot.gameId !== null).length;
  const idle = () => slots.find((slot) => slot.socket && slot.gameId === null);

  /** Waits in every free pool while there's room for another game, and nowhere when there isn't. */
  function seekWhereFree() {
    const room = playing() < maxGames;
    for (const slot of slots) {
      const want = room && slot.socket !== null && slot.gameId === null;
      if (want === slot.seeking) continue;
      send(
        slot,
        want
          ? { type: 'seek', timeControl: slot.timeControl, rated: slot.rated }
          : { type: 'cancelSeek' },
      );
      slot.seeking = want;
    }
  }

  async function receive(slot: Slot, message: ServerMessage) {
    if (message.type === 'gameStarted') {
      slot.seeking = false;
      if (slots.some((s) => s.gameId === message.gameId)) return;
      // After a reconnect every connection hears of the same games; each goes to a free one.
      const player = slot.gameId === null ? slot : (idle() ?? slot);
      player.gameId = message.gameId;
      send(player, { type: 'watch', gameId: message.gameId });
      seekWhereFree();
    } else if (message.type === 'challenge') {
      const { id } = message.challenge;
      if (challenges.has(id)) return;
      challenges.add(id);
      const free = playing() < maxGames ? idle() : undefined;
      send(free ?? slot, { type: free ? 'acceptChallenge' : 'declineChallenge', id });
    } else if (message.type === 'game') {
      const { game, you } = message;
      if (game.termination !== null) {
        if (slot.gameId === game.id) slot.gameId = null;
        seekWhereFree();
        return;
      }
      const ply = `${game.id}:${game.moves.length}`;
      if (you !== 'xo'[game.moves.length % 2] || answered.has(ply)) return;
      answered.add(ply);
      const [, increment] = game.timeControl.split('+').map(Number);
      const budget = Math.max(
        MIN_MOVE_MS,
        Math.min(thinkMs, game.clocks[you] / 40 + increment * 500),
      );
      send(slot, { type: 'move', gameId: game.id, move: await think(replay(game.moves), budget) });
    } else if (message.type === 'error') {
      console.warn('refused:', message.message);
    }
  }

  async function open(slot: Slot) {
    try {
      const socket = await connect();
      if (stopped) return socket.close();
      socket.addEventListener('message', ({ data }) => {
        receive(slot, JSON.parse(String(data)) as ServerMessage).catch(console.error);
      });
      socket.addEventListener('close', () => {
        // A move sent just before the drop may be lost: answer the position again after reconnecting.
        for (const ply of answered) if (ply.startsWith(`${slot.gameId}:`)) answered.delete(ply);
        Object.assign(slot, { socket: null, seeking: false, gameId: null });
        if (!stopped) setTimeout(() => open(slot), retryMs);
      });
      slot.socket = socket;
      seekWhereFree();
    } catch (error) {
      console.warn('connection failed:', error);
      if (!stopped) setTimeout(() => open(slot), retryMs);
    }
  }

  slots.forEach(open);
  return {
    stop() {
      stopped = true;
      for (const slot of slots) slot.socket?.close();
    },
  };
}

/** The engine's move after searching for `budget` ms, in chunks so other games' messages get through. */
async function think(position: ReturnType<typeof replay>, budget: number): Promise<number> {
  const search = new Search(position);
  const end = performance.now() + budget;
  do {
    search.run(500);
    await new Promise((resolve) => setImmediate(resolve));
  } while (performance.now() < end && !search.analysis.proven);
  const { bestMove } = search.analysis;
  if (bestMove === null) throw new Error('No legal moves in a running game');
  return bestMove;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.UTTT_URL ?? 'ws://localhost:3000/ws';
  const token = process.env.HOUSE_BOT_TOKEN;
  if (!token) {
    console.log('No HOUSE_BOT_TOKEN set: the house bot stays off.');
    process.exit(0);
  }
  houseBot(async () => {
    const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } } as never);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve);
      socket.addEventListener('error', reject);
    });
    return socket;
  });
}
