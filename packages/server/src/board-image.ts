/**
 * Draws a position as a PNG for link previews, in the site's Classic colors. Hand-drawn with distance
 * functions (antialiased over one pixel) and encoded with Node's zlib, so no image library is needed.
 */

import { cellAt, legalMoves, type Player, type Position } from '@uttt/core';
import { crc32, deflateSync } from 'node:zlib';

/** The size link previews use (1.91:1). */
const WIDTH = 1200;
const HEIGHT = 630;

type Rgb = readonly [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as never;
/** From app.css. */
const COLORS = {
  bg: rgb('#f5f4f0'),
  frame: rgb('#8a8377'),
  line: rgb('#d9d4ca'),
  cell: rgb('#fbfaf7'),
  active: rgb('#fff1c2'),
  last: rgb('#dfe9ff'),
  x: rgb('#2563eb'),
  o: rgb('#e8590c'),
};

// Board layout in pixels, like Board.svelte: a frame, three local boards per row, three cells per row each.
const GAP = 8;
const CELL_GAP = 3;
const CELL = 58;
const LOCAL = 3 * CELL + 2 * CELL_GAP;
const SIZE = 4 * GAP + 3 * LOCAL;
const LEFT = (WIDTH - SIZE) / 2;
const TOP = (HEIGHT - SIZE) / 2;

/** Distance from (x, y) to the segment from (ax, ay) to (bx, by). */
function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

class Canvas {
  readonly pixels = new Uint8Array(WIDTH * HEIGHT * 3);

  rect(left: number, top: number, width: number, height: number, color: Rgb): void {
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) this.pixels.set(color, (y * WIDTH + x) * 3);
    }
  }

  /** Draws a piece the way Piece.svelte does, in a `size`-pixel square at (left, top). */
  piece(
    player: Player,
    left: number,
    top: number,
    size: number,
    stroke: number,
    opacity = 1,
  ): void {
    const at = (units: number) => units * (size / 100);
    const half = at(stroke) / 2;
    const distance =
      player === 'x'
        ? (x: number, y: number) =>
            Math.min(
              toSegment(x, y, left + at(24), top + at(24), left + at(76), top + at(76)),
              toSegment(x, y, left + at(76), top + at(24), left + at(24), top + at(76)),
            ) - half
        : (x: number, y: number) =>
            Math.abs(Math.hypot(x - left - at(50), y - top - at(50)) - at(28)) - half;
    for (let y = Math.floor(top); y < Math.ceil(top + size); y++) {
      for (let x = Math.floor(left); x < Math.ceil(left + size); x++) {
        const alpha = Math.min(1, Math.max(0, 0.5 - distance(x + 0.5, y + 0.5))) * opacity;
        if (alpha === 0) continue;
        const i = (y * WIDTH + x) * 3;
        for (let c = 0; c < 3; c++) {
          this.pixels[i + c] += (COLORS[player][c] - this.pixels[i + c]) * alpha;
        }
      }
    }
  }

  png(): Buffer {
    const rows = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      // Each row starts with its filter type, 0 (none).
      rows.set(this.pixels.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3), y * (WIDTH * 3 + 1) + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(WIDTH, 0);
    header.writeUInt32BE(HEIGHT, 4);
    header.set([8, 2], 8); // 8 bits per channel, RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** The position as a 1200×630 PNG, with the boards to play in and the last move highlighted. */
export function boardImage(position: Position, lastMove: number | null = null): Buffer {
  const canvas = new Canvas();
  canvas.rect(0, 0, WIDTH, HEIGHT, COLORS.bg);
  canvas.rect(LEFT, TOP, SIZE, SIZE, COLORS.frame);
  const legal = new Set(legalMoves(position));
  for (let board = 0; board < 9; board++) {
    const left = LEFT + GAP + (board % 3) * (LOCAL + GAP);
    const top = TOP + GAP + Math.floor(board / 3) * (LOCAL + GAP);
    const decided = position.boards[board] !== null;
    const active = [...legal].some((move) => Math.floor(move / 9) === board);
    canvas.rect(left, top, LOCAL, LOCAL, COLORS.line);
    for (let cell = 0; cell < 9; cell++) {
      const move = board * 9 + cell;
      const x = left + (cell % 3) * (CELL + CELL_GAP);
      const y = top + Math.floor(cell / 3) * (CELL + CELL_GAP);
      const color = move === lastMove ? COLORS.last : active ? COLORS.active : COLORS.cell;
      canvas.rect(x, y, CELL, CELL, color);
      const piece = cellAt(position, move);
      // Pieces sit inside the cell's 14% padding; on decided boards they fade behind the winner.
      if (piece)
        canvas.piece(piece, x + CELL * 0.14, y + CELL * 0.14, CELL * 0.72, 13, decided ? 0.3 : 1);
    }
    const winner = position.boards[board];
    if (winner === 'x' || winner === 'o') {
      canvas.piece(winner, left + LOCAL * 0.06, top + LOCAL * 0.06, LOCAL * 0.88, 8);
    }
  }
  return canvas.png();
}
