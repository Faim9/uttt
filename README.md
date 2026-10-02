# UTTT — a free, open platform for Ultimate Tic-Tac-Toe

Play Ultimate Tic-Tac-Toe online against real people, climb a fair rating ladder, and review your games with an
engine. Built in the spirit of [lichess.org](https://lichess.org): free, no ads, open source.

> **Built with AI assistance.** This project is developed by Faim9 together with Claude (Anthropic's AI
> model), which writes most of the code under Faim9's direction. Commits made this way carry a
> `Co-Authored-By: Claude` line. The design decisions and their reasoning are documented in
> [PILLARS.md](PILLARS.md).

## Features

- **Play online:** quick pairing in five time controls (1+0 to 10+5) or a challenge link for a friend. Guests
  can play casual games; accounts play rated games.
- **Fair ratings:** Glicko-2, separately for bullet, blitz, and rapid, with profiles and a leaderboard.
- **Server-authoritative games:** the server validates every move and runs the clocks; games survive a
  server restart.
- **Play the computer** at six strength levels.
- **Analysis board:** variations, live engine evaluation and best line, import/export, shareable links.
- **Post-game review:** every move judged (best / good / inaccuracy / mistake / blunder), accuracy per player,
  an evaluation graph, and the best move wherever you went wrong.

The engine (Monte Carlo Tree Search) runs in your browser, so analysis costs the server nothing.

## How to play

Nine small tic-tac-toe boards form one big board. The cell you play sends your opponent to the matching board:
play the top-right cell, and they must play in the top-right board. If that board is already won or full, they
may play anywhere. Win three small boards in a row to win the game.

Moves are written `<big board>-<small cell>`, both numbered 1–9 like a phone keypad: `5-3` is the center board,
top-right cell. See [docs/notation.md](docs/notation.md).

## Running it

Requires Node.js 22.18+ and pnpm.

```sh
pnpm install
pnpm dev        # web on http://localhost:5173, API on :3000
pnpm test       # all tests
pnpm build      # production build of the web app
pnpm start      # production: one process serves the site and the API (PORT, HOST, DATABASE_PATH)
```

Data lives in one SQLite file (`uttt.db` by default); schema migrations run on startup.

Production settings (environment variables):

| Variable        | Purpose                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| `PUBLIC_URL`    | Required. The site's address, used in emailed links (e.g. `https://example.com`) |
| `SMTP_URL`      | Email delivery, from any provider (e.g. `smtps://user:pass@smtp.example.com`)    |
| `MAIL_FROM`     | Sender address, e.g. `UTTT <noreply@example.com>`                                |
| `PORT`, `HOST`  | Where to listen (default `127.0.0.1:3000`)                                       |
| `DATABASE_PATH` | SQLite file location                                                             |
| `TRUST_PROXY`   | `true` behind a reverse proxy, so rate limits see real client addresses          |

Without `SMTP_URL`, emails (verification and password-reset links) are written to the server log instead.

## Project layout

```
packages/core     rules, notation, engine, post-game review, shared protocol (pure TypeScript)
packages/server   Fastify HTTP + WebSocket server, SQLite (Drizzle), accounts, ratings
packages/web      SvelteKit single-page app
```

- [PILLARS.md](PILLARS.md) describes what the product should become and the principles behind it.
- [ROADMAP.md](ROADMAP.md) tracks what's done and what's next.
- [CLAUDE.md](CLAUDE.md) holds the coding rules and project conventions.

## License

Copyright © 2026 Faim9 and contributors.

This program is free software: you can redistribute it and/or modify it under the terms of the
[GNU Affero General Public License](LICENSE), version 3 or (at your option) any later version. In short: you
may use, study, change, and share it, but if you run a modified version as a website, you must publish your
source code under the same license.

**Additional term (AGPL section 7(b)):** the attribution "Created by Faim9" shown in the site footer must be
preserved, reasonably visible, in the user interface of any modified version.

The license covers the code only. It grants no rights to the project's name or logos; forks should use their
own name.

## Credits

- From [lichess](https://lichess.org) (AGPL-3.0): the move accuracy formula, and the matchmaking scoring
  (`packages/server/src/matchmaking.ts`, after lila's `MatchMaking.scala`), and clock lag compensation
  (`packages/server/src/game.ts`, after scalachess's `LagTracker.scala`).
- Ratings follow Mark Glickman's [Glicko-2 paper](http://www.glicko.net/glicko/glicko2.pdf).
