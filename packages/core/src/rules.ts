/**
 * Ultimate Tic-Tac-Toe rules (see PILLARS.md, Pillar 1).
 * Boards and cells are indexed 0–8 in reading order; a move is `board * 9 + cell`.
 */

export type Player = 'x' | 'o';
export type Outcome = Player | 'draw';

export interface Position {
  /** Per local board, a 9-bit mask of the cells each player occupies. */
  readonly x: readonly number[];
  readonly o: readonly number[];
  /** Per local board: its winner, 'draw' if full, or null while still open. */
  readonly boards: readonly (Outcome | null)[];
  readonly turn: Player;
  /** The board the player to move must play in, or null for a free move. */
  readonly forced: number | null;
  readonly outcome: Outcome | null;
}

const FULL = 0b111_111_111;
// prettier-ignore
const LINES = [
  0b000_000_111, 0b000_111_000, 0b111_000_000, // rows
  0b001_001_001, 0b010_010_010, 0b100_100_100, // columns
  0b100_010_001, 0b001_010_100, // diagonals
];
const HAS_LINE = Array.from({ length: 512 }, (_, mask) =>
  LINES.some((line) => (mask & line) === line),
);

export const boardOf = (move: number) => Math.floor(move / 9);
export const cellOf = (move: number) => move % 9;
export const other = (player: Player): Player => (player === 'x' ? 'o' : 'x');

function localOutcome(x: number, o: number): Outcome | null {
  if (HAS_LINE[x]) return 'x';
  if (HAS_LINE[o]) return 'o';
  return (x | o) === FULL ? 'draw' : null;
}

/** Drawn local boards count for neither player. */
function globalOutcome(boards: readonly (Outcome | null)[]): Outcome | null {
  const maskOf = (player: Player) =>
    boards.reduce((mask, owner, i) => (owner === player ? mask | (1 << i) : mask), 0);
  if (HAS_LINE[maskOf('x')]) return 'x';
  if (HAS_LINE[maskOf('o')]) return 'o';
  return boards.every((owner) => owner !== null) ? 'draw' : null;
}

/** Builds a position from cell masks. A forced board that is already decided becomes a free move. */
export function createPosition(
  x: readonly number[],
  o: readonly number[],
  turn: Player,
  forced: number | null,
): Position {
  const boards = x.map((xMask, i) => localOutcome(xMask, o[i]));
  return {
    x,
    o,
    boards,
    turn,
    forced: forced !== null && boards[forced] === null ? forced : null,
    outcome: globalOutcome(boards),
  };
}

export const initialPosition = createPosition(Array(9).fill(0), Array(9).fill(0), 'x', null);

export function cellAt(position: Position, move: number): Player | null {
  const bit = 1 << cellOf(move);
  if (position.x[boardOf(move)] & bit) return 'x';
  if (position.o[boardOf(move)] & bit) return 'o';
  return null;
}

export function isLegal(position: Position, move: number): boolean {
  if (!Number.isInteger(move) || move < 0 || move >= 81 || position.outcome !== null) return false;
  const board = boardOf(move);
  if (position.boards[board] !== null) return false;
  if (position.forced !== null && position.forced !== board) return false;
  return cellAt(position, move) === null;
}

export function legalMoves(position: Position): number[] {
  if (position.outcome !== null) return [];
  const boards = position.forced === null ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [position.forced];
  const moves = [];
  for (const board of boards) {
    if (position.boards[board] !== null) continue;
    const taken = position.x[board] | position.o[board];
    for (let cell = 0; cell < 9; cell++) {
      if (!(taken & (1 << cell))) moves.push(board * 9 + cell);
    }
  }
  return moves;
}

/** Returns the position after `move`; the cell played picks the opponent's next board. */
export function play(position: Position, move: number): Position {
  if (!isLegal(position, move)) throw new Error(`Illegal move: ${move}`);
  const masks = { x: [...position.x], o: [...position.o] };
  masks[position.turn][boardOf(move)] |= 1 << cellOf(move);
  return createPosition(masks.x, masks.o, other(position.turn), cellOf(move));
}

export function replay(moves: readonly number[]): Position {
  return moves.reduce(play, initialPosition);
}
