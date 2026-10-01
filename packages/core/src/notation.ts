/**
 * UTN — Ultimate Tic-tac-toe Notation. The spec lives in docs/notation.md; the tests here enforce it.
 * A move is written `<big>-<small>`, both numbered 1–9 in reading order, e.g. `5-3`.
 */

import {
  boardOf,
  cellAt,
  cellOf,
  createPosition,
  initialPosition,
  isLegal,
  play,
  type Outcome,
  type Player,
  type Position,
} from './rules.ts';

export interface GameRecord {
  tags: Record<string, string>;
  moves: number[];
}

export const RESULTS: Record<Outcome, string> = { x: '1-0', o: '0-1', draw: '½-½' };

const NINE = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const TAG = /\[(\w+) "([^"\n]*)"\]/g;

export function formatMove(move: number): string {
  return `${boardOf(move) + 1}-${cellOf(move) + 1}`;
}

export function parseMove(text: string): number {
  const match = /^([1-9])-([1-9])$/.exec(text);
  if (!match) throw new Error(`Invalid move: "${text}"`);
  return (Number(match[1]) - 1) * 9 + Number(match[2]) - 1;
}

export function formatPosition(position: Position): string {
  const boards = NINE.map((board) =>
    NINE.map((cell) => cellAt(position, board * 9 + cell) ?? '.').join(''),
  ).join('/');
  return `${boards} ${position.turn} ${position.forced === null ? '-' : position.forced + 1}`;
}

export function parsePosition(text: string): Position {
  const match = /^((?:[xo.]{9}\/){8}[xo.]{9}) ([xo]) ([1-9-])$/.exec(text.trim());
  if (!match) throw new Error(`Invalid position: "${text}"`);
  const [, cells, turn, forced] = match;

  const groups = cells.split('/');
  const masksOf = (player: Player) =>
    groups.map((group) =>
      [...group].reduce((mask, cell, i) => (cell === player ? mask | (1 << i) : mask), 0),
    );
  const forcedBoard = forced === '-' ? null : Number(forced) - 1;
  const position = createPosition(masksOf('x'), masksOf('o'), turn as Player, forcedBoard);

  const count = (player: Player) => cells.split(player).length - 1;
  if (count('x') - count('o') !== (turn === 'x' ? 0 : 1)) {
    throw new Error(`Invalid position: piece counts don't match side to move`);
  }
  if (position.forced !== forcedBoard) {
    throw new Error(`Invalid position: forced board ${forced} is already decided`);
  }
  return position;
}

export function formatGame({ tags, moves }: GameRecord): string {
  const header = Object.entries(tags).map(([key, value]) => {
    if (!/^\w+$/.test(key) || /["\n]/.test(value)) throw new Error(`Invalid tag: ${key}`);
    return `[${key} "${value}"]`;
  });
  const body = moves.map((move, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + formatMove(move));
  if (tags.Result) body.push(tags.Result);
  return `${header.join('\n')}\n\n${body.join(' ')}\n`;
}

/**
 * Parses a game record and checks that every move is legal.
 * A `Position` tag holding a position string sets a custom starting position.
 */
export function parseGame(text: string): GameRecord {
  const tags = Object.fromEntries([...text.matchAll(TAG)].map(([, key, value]) => [key, value]));
  const tokens = text
    .replace(TAG, ' ')
    .split(/\s+/)
    .filter((token) => token && !/^\d+\.$/.test(token));

  const last = tokens.at(-1);
  if (last && Object.values(RESULTS).includes(last)) {
    tokens.pop();
    tags.Result ??= last;
  }

  const moves = tokens.map(parseMove);
  moves.reduce((position, move, i) => {
    if (!isLegal(position, move)) throw new Error(`Illegal move ${i + 1}: ${formatMove(move)}`);
    return play(position, move);
  }, startOf(tags));
  return { tags, moves };
}

export function startOf(tags: GameRecord['tags']): Position {
  return tags.Position ? parsePosition(tags.Position) : initialPosition;
}
