# Bot API

Write a program that plays Ultimate Tic-Tac-Toe at [uttt.org](https://uttt.org). Bots play each other in
rated games, with a leaderboard of their own, and people challenge them for casual games. Every bot carries
a **BOT** label.

## Get a token

1. Sign up a new account for your bot (not your own: a bot account can't be turned back) and confirm its
   email.
2. In **Settings → Bot account**, turn it into a bot. Only an account that hasn't played yet can.
3. Still in Settings, create an **API token**. It's shown once; keep it secret like a password. Creating a
   new one replaces it, and you can revoke it there too.

## Connect

Bots use the same WebSocket protocol as the website. Connect to `wss://uttt.org/ws` with your token in the
`Authorization` header, then send and receive JSON messages, one per WebSocket message:

```
Authorization: Bearer uttt_...
```

A wrong or revoked token closes the connection with code 1008, "Invalid API token".

## Moves

A move is a number from 0 to 80: `board * 9 + cell`, both counted 0–8 in reading order (top-left to
bottom-right). Players write moves as `board-cell` counted from 1, so move 22 (board 2, cell 4, counting
from 0) is `3-5`.
The rules: the cell you play sends your opponent to the board with that number; if that board is won or full,
they may play in any open board. Three in a row wins a board, three boards in a row win the game. See
[notation.md](notation.md) for the notation in full.

## Messages you send

| Message                                                                                                          | What it does                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `{"type": "seek", "timeControl": "3+2", "rated": true}`                                                          | Look for another bot. Pools: `1+0`, `2+1`, `3+0`, `3+2`, `5+3`, `10+5`. |
| `{"type": "cancelSeek"}`                                                                                         | Stop looking.                                                           |
| `{"type": "challengeUser", "username": "...", "timeControl": "5+3", "rated": false, "color": "random"}`          | Challenge one player who's online. `color` is `x`, `o`, or `random`.    |
| `{"type": "acceptChallenge", "id": "..."}`, `{"type": "declineChallenge", "id": "..."}`                          | Answer a challenge.                                                     |
| `{"type": "watch", "gameId": "..."}`                                                                             | Follow a game: you get its state now and after every change.            |
| `{"type": "move", "gameId": "...", "move": 40}`                                                                  | Play a move.                                                            |
| `{"type": "resign", "gameId": "..."}`, `{"type": "draw", "gameId": "..."}`, `{"type": "abort", "gameId": "..."}` | Resign; offer (or accept) a draw; abort before both players have moved. |

Time controls are `minutes+increment` (seconds), from `1+0` to `60+30`. Games against people are always
casual; rated games are bot against bot, and need the bot's email confirmed.

## Messages you receive

- `{"type": "challenge", "challenge": {"id", "from", "bot", "timeControl", "rated", "color"}}`: someone
  challenges you; `color` is their side.
- `{"type": "challengeGone", "id"}`: a challenge is off (declined, withdrawn, or its creator left).
- `{"type": "gameStarted", "gameId"}`: a game starts. Send `watch` to follow it.
- `{"type": "game", "game": {...}, "you": "x" | "o" | null}`: a game's state. The useful fields:
  - `moves`: every move so far. X moves first, so it's your turn when `you` is `"xo"[moves.length % 2]`.
  - `clocks`: milliseconds left for each side when the message was sent; `running`: whose clock runs.
  - `termination`: null while the game runs; then how it ended (`line`, `resign`, `timeout`, `agreement`,
    `abort`, `disconnect`), with `outcome` `x`, `o`, or `draw`.
- `{"type": "error", "message"}`: something you sent was refused, with the reason.

The game state also arrives when nothing changed for you (an opponent's draw offer, say), so play only when
it's your turn in a position you haven't answered yet.

## Fair play

- Each player must make their first move within 30 seconds, or the game is aborted. After that, the clocks
  run; network lag is refunded within limits.
- At most 20 messages a second per connection; more closes it. A bot that answers instantly would get
  there in a fast game, so the example below waits a tenth of a second before each move.
- Bots can't join tournaments or correspondence games.

## A complete bot in Python

This bot plays random legal moves, accepts every challenge, and looks for bot games in 3+2. It needs
Python 3.10+ and `pip install websockets` (version 14 or later). Run it with your token in `UTTT_TOKEN`.

```python
import asyncio
import json
import os
import random

import websockets

URL = os.environ.get("UTTT_URL", "wss://uttt.org/ws")
TOKEN = os.environ["UTTT_TOKEN"]
LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]


def decided(cells):
    """Whether a small board (9 cells: 'x', 'o' or None) is won or full."""
    won = any(cells[a] and cells[a] == cells[b] == cells[c] for a, b, c in LINES)
    return won or None not in cells


def legal_moves(moves):
    """The legal moves after `moves`, each board * 9 + cell."""
    cells = [None] * 81
    for ply, move in enumerate(moves):
        cells[move] = "xo"[ply % 2]
    closed = [decided(cells[b * 9 : b * 9 + 9]) for b in range(9)]
    target = moves[-1] % 9 if moves else None
    boards = [target] if target is not None and not closed[target] else range(9)
    return [b * 9 + c for b in boards if not closed[b] for c in range(9) if cells[b * 9 + c] is None]


async def main():
    headers = {"Authorization": f"Bearer {TOKEN}"}
    async with websockets.connect(URL, additional_headers=headers) as ws:

        async def send(message):
            await ws.send(json.dumps(message))

        seek = {"type": "seek", "timeControl": "3+2", "rated": False}
        await send(seek)
        answered = set()  # (game, ply) we've already moved in
        async for raw in ws:
            message = json.loads(raw)
            kind = message["type"]
            if kind == "challenge":
                await send({"type": "acceptChallenge", "id": message["challenge"]["id"]})
            elif kind == "gameStarted":
                await send({"type": "watch", "gameId": message["gameId"]})
            elif kind == "game":
                game, you = message["game"], message["you"]
                moves = game["moves"]
                if game["termination"] is not None:
                    await send(seek)  # this game is over: look for the next one
                elif you == "xo"[len(moves) % 2] and (game["id"], len(moves)) not in answered:
                    answered.add((game["id"], len(moves)))
                    await asyncio.sleep(0.1)  # stays under the message limit (see Fair play)
                    move = random.choice(legal_moves(moves))
                    await send({"type": "move", "gameId": game["id"], "move": move})
            elif kind == "error":
                print("refused:", message["message"])


asyncio.run(main())
```

From here, replace `random.choice` with a real search: the site's own engine is a Monte Carlo tree search
with a solver (`packages/core/src/engine.ts`). JavaScript works the same way: in Node.js 22,
`new WebSocket(url, { headers: { Authorization: 'Bearer ...' } })`.
