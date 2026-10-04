/**
 * UTN — Ultimate Tic-tac-toe Notation. The spec lives in docs/notation.md; the tests here enforce it.
 * A move is written `<big>-<small>`, both numbered 1–9 in reading order, e.g. `5-3`.
 */

import {
  boardOf,
  cellAt,
  cellOf,
  createPosition,
  HAS_LINE,
  initialPosition,
  isLegal,
  other,
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

/**
 * Parses a position string, rejecting positions no game can reach by the quick checks: piece counts that
 * don't match the side to move, a board won by both players, and a forced board the last move couldn't have
 * sent the player to. Whether some order of moves reaches the position would need a search, so isn't checked.
 */
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

  const invalid = (reason: string) => new Error(`Invalid position: ${reason}`);
  const count = (player: Player) => cells.split(player).length - 1;
  if (count('x') - count('o') !== (turn === 'x' ? 0 : 1)) {
    throw invalid(
      'X moves first, so X has as many pieces as O when X is to move, and one more when O is',
    );
  }
  const wonByBoth = NINE.find(
    (board) => HAS_LINE[position.x[board]] && HAS_LINE[position.o[board]],
  );
  if (wonByBoth !== undefined) {
    throw invalid(`board ${wonByBoth + 1} has three in a row for both X and O`);
  }
  if (position.forced !== forcedBoard) {
    throw invalid(`board ${forced} is already decided, so the next move is free`);
  }
  // The last move was the other side's, and a piece in cell k sends the next player to board k.
  const last = other(position.turn);
  const sendsTo = (board: number) => position[last].some((mask) => mask & (1 << board));
  const [mover, next] = [last.toUpperCase(), position.turn.toUpperCase()];
  if (forcedBoard !== null && !sendsTo(forcedBoard)) {
    throw invalid(
      `${mover} has no piece in cell ${forced} of any board, so can't have sent ${next} to board ${forced}`,
    );
  }
  if (
    forcedBoard === null &&
    count('x') > 0 &&
    !NINE.some((b) => position.boards[b] && sendsTo(b))
  ) {
    throw invalid(`a free move needs ${mover}'s last piece in a cell matching a decided board`);
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
