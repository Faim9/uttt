# UTN — Ultimate Tic-tac-toe Notation

The text formats for moves, positions, and games. Implemented in `packages/core/src/notation.ts`; the tests
there are the executable version of this spec.

## Numbering

Notation mirrors how people think: **first which big board, then which cell inside it.** Both levels use the
same 1–9 numbering in reading order, like a phone keypad:

```
1 2 3
4 5 6
7 8 9
```

Internally boards and cells are 0–8 and a move is the number `board * 9 + cell` (0–80); only the notation
layer is 1-based.

## Moves

`<big>-<small>`, e.g. `5-3` = center board, top-right cell.

The small cell of a move is the big board of the next move, so normal play reads as a chain: `5-3 3-7 7-5`.
A break in the chain marks a free move.

## Position string

The 9 local boards in order 1–9, each as 9 cells (`x`, `o`, `.`) separated by `/`, then the side to move and
the forced board (`-` = free move):

```
..x....../........./.....o.../........./....x..../........./........./........./......... o 3
```

- Won and drawn local boards are derived from the cells, not stored.
- Parsing rejects positions no game can reach, by quick checks: piece counts that don't match the side to
  move, a local board with three in a row for both players, a forced board that is already decided, and a
  forced board the last move couldn't have sent the player to (a piece in cell `k` sends to board `k`; a free
  move needs one in a cell matching a decided board). Whether some order of moves reaches the position would
  take a search, so it isn't checked.

## Game record

PGN-like: header tags, a blank line, then numbered move pairs (X's move, then O's), ending with the result.

```
[X "alice"]
[O "bob"]
[TimeControl "3+2"]
[Result "1-0"]

1. 5-5 5-1 2. 1-9 9-5 3. 5-3 3-7 1-0
```

- **Results:** `1-0` (X wins), `0-1` (O wins), `½-½` (draw). The result also lives in the `Result` tag, because
  games can end by resignation or timeout, which the moves alone don't show.
- **`Position` tag:** a position string giving a custom starting position (used by the analysis board).
- Move numbers are ignored when parsing; every move is checked for legality.
- Tag values may not contain `"` or newlines.
