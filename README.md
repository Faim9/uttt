# UTTT — a free, open platform for Ultimate Tic-Tac-Toe

**Play at [uttt.org](https://uttt.org).** Play Ultimate Tic-Tac-Toe online against real people, climb a fair
rating ladder, and review your games with an engine. Built in the spirit of [lichess.org](https://lichess.org):
free, no ads, open source.

> **Built with AI assistance.** This project is developed by Faim9 together with Claude (Anthropic's AI
> model), which writes most of the code under Faim9's direction. Commits made this way carry a
> `Co-Authored-By: Claude` line. The design decisions and their reasoning are documented in
> [PILLARS.md](PILLARS.md).

## Features

- **Play online:** one-click pairing in six time controls (1+0 to 10+5), any time control up to 60+30 by
  challenge link, and correspondence games of 1 to 14 days per move. Guests play casual games; accounts
  play rated games.
- **Fair ratings:** Glicko-2 for bullet, blitz, rapid, correspondence, and puzzles, with rating graphs,
  profiles, and a leaderboard. Rating-based matchmaking with lag-compensated clocks.
- **Learn and train:** interactive lessons on the rules, 470 puzzles (each checked exhaustively) with a
  daily puzzle, and a computer opponent at six levels.
- **Analysis:** an analysis board with variations, live engine evaluation and best line, a board editor,
  import/export and shareable links; one-click post-game review that judges every move, with accuracy, an
  evaluation graph, and clock times.
- **Community:** watch live games, arena tournaments, challenge players directly, follow and block players,
  rematches, reports and moderation tools.
- **Bot API:** write a program that plays: bot accounts connect over WebSocket with an API token, play each
  other on a ladder of their own, and take challenges from people. See [docs/bot-api.md](docs/bot-api.md),
  with a complete example bot.
- **Everywhere:** in English, German, Spanish, French, and Portuguese; installable as an app on phones and
  desktops, link previews when shared, light and dark themes, sounds.

The engine (Monte Carlo Tree Search with a solver) runs in your browser, so analysis costs the server
nothing. The server is authoritative: it validates every move and runs the clocks, and games survive a
restart.

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

To deploy on a server (Docker, Cloudflare Tunnel, continuous backups), follow [docs/deploy.md](docs/deploy.md).

Data lives in one SQLite file (`uttt.db` by default); schema migrations run on startup.

Production settings (environment variables):

| Variable                                     | Purpose                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                                 | Required. The site's address, used in emailed links (e.g. `https://example.com`)                   |
| `SMTP_URL`                                   | Email delivery, from any provider (e.g. `smtps://user:pass@smtp.example.com`)                      |
| `MAIL_FROM`                                  | Sender address, e.g. `UTTT <noreply@example.com>`                                                  |
| `PORT`, `HOST`                               | Where to listen (default `127.0.0.1:3000`)                                                         |
| `DATABASE_PATH`                              | SQLite file location                                                                               |
| `CLIENT_IP_HEADER`                           | Header with the visitor's real address from a trusted proxy (`cf-connecting-ip` behind Cloudflare) |
| `ADMIN_EMAILS`                               | Comma-separated emails of admin accounts (they also need a confirmed email and two-factor on)      |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile keys for the bot check on sign-up; without them, there's no check             |

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
