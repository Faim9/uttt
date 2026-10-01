# UTTT Platform — Product Pillars

> A free, open, web-hosted platform for **Ultimate Tic-Tac-Toe**, in the spirit of lichess.org and chess.com:
> play rated games against real people, review them with a strong engine, and climb a fair ranking ladder.

This document describes the **target product**: the principles and requirements every feature must serve.
What's built so far, and what comes next, lives in ROADMAP.md.

## 0. Guiding Philosophy

- **Play first.** A visitor should be able to start a game in two clicks. Everything else supports playing.
- **The server is the source of truth.** Clients display and propose; the server validates and decides.
- **One rules engine.** Rules are implemented once and shared by the client, server, and engine.
- **Fairness over features.** Correct ratings, honest clocks, and cheat-free games matter more than polish.
- **Lichess-style openness.** Free to play, no pay-to-win, no intrusive ads; data export is a user right.
- **Secure by default.** Security is a design constraint from day one, not a later hardening pass.

## 1. Game Core & Rules Correctness

- The board is a 3×3 grid of **local boards**, each a 3×3 tic-tac-toe grid. **X** moves first.
- The cell you play determines which local board your opponent must play in next. If that board is already
  **won or full**, they may play in any open cell of any undecided board.
- Three in a row wins a local board; a full board with no winner is drawn and counts for **neither** player.
- Three local boards in a row win the game. No legal moves left without that is a **draw**.
- Games also end by resignation, timeout, abort (before both players move), agreed draw, or disconnect forfeit.
- Rule variants are out of scope for now, but the design shouldn't rule out a variant flag later.
- **Notation (UTN):** moves are `<big>-<small>`, both 1–9 in reading order, e.g. `5-3` = center board,
  top-right cell. Full spec of moves, position strings, and game records: docs/notation.md.
- One well-tested rules library (unit + property tests), fast enough for engine playouts.

## 2. Web-Hosted, Real-Time Play

- **Fully browser-based**, responsive (desktop + mobile web), no install.
- **Real-time games over WebSockets**, with server-authoritative moves and clocks; clients only render time.
- **Time controls** with increment (e.g. `3+2`), grouped into bullet / blitz / rapid; correspondence later.
- **Fair clocks:** lag compensation, so players aren't charged for network transit.
- **Matchmaking:** quick-pairing pools by time control, pairing players close in rating; direct challenges by link.
- **Reconnection:** a dropped connection resumes the game; after a grace period the opponent may claim victory.
- **Play vs. computer** at selectable strength levels (unrated).
- **Spectating**, and a "TV" view of top-rated live games.
- **Game archive:** every finished game is stored, shareable by URL, and exportable.
- **In-game actions:** rematch, offer draw, resign, abort, takeback (casual only).
- **Accessibility:** keyboard play, screen-reader labels, color-blind-safe colors, light/dark mode.

## 3. Accounts & Identity

- Rated play, history, and rankings are tied to an account; **guests can play casual games**.
- **Sign-up/login** with email + password; optional OAuth later. Email verification before rated play.
- **Profile:** ratings per category, rating graph, stats, recent games.
- **Social:** follow players, friend challenges, block/mute.
- **Settings:** board theme, sound, move confirmation, premoves, privacy.
- **Account lifecycle:** password reset, 2FA (TOTP), session management, data export, account deletion (GDPR).

## 4. Analysis Board & Engine

The pillar that turns the site from "a place to play" into "a place to improve."

- **Engine: plain MCTS** (UCT with random playouts). It's the simplest engine that plays well: no hand-tuned
  evaluation, ~150 lines, ~16k playouts/second. Strength levels are playout budgets.
- **The engine runs in the browser** (Web Workers): analysis, play vs. computer, and post-game review cost the
  server nothing. The server will only run it for anti-cheat.
- **Analysis board:** free play from any position, variation tree, live eval bar and best line,
  import/export via UTN, shareable links.
- **Post-game review:** one click from a finished game. It shows immediately where each player went wrong and
  which moves were good: an eval graph, the best move for every position, and every move classified (best,
  good, inaccuracy, mistake, blunder), with an accuracy score per player.
- **Later:** opening explorer, puzzles from real games' tactical moments, shared studies.
- **Engine upgrades only when needed:** MCTS-solver → smarter playouts → neural-network guidance.

## 5. Rating & Ranking Ladder

- **Glicko-2** per category (bullet / blitz / rapid): rating, deviation (confidence), volatility.
- **Provisional ratings** (high deviation) are marked with `?` and kept off leaderboards. Start: 1500.
- **Climbing should feel rewarding:** matchmaking pairs players of similar strength, so a higher rating brings
  stronger opponents.
- **Rating changes** shown after each game (and the possible changes before it).
- **Inactivity:** deviation grows while inactive; inactive players drop off leaderboards but keep their rating.
- **Ladder integrity:** detect sandbagging, alt-account farming, and win trading; refund victims of cheaters.
- **Later:** tournaments (arena & Swiss), seasons, titles.

## 6. Security & Fair Play

- **OWASP Top 10 / ASVS** as the baseline.
- **HTTPS everywhere**, HSTS, `HttpOnly` / `Secure` / `SameSite` cookies.
- **Passwords:** Argon2id, breached-password check on sign-up, optional 2FA.
- **Sessions:** server-side, stored hashed, revocable.
- **CSRF and cross-site WebSocket protection**, strict CSP, output encoding against XSS.
- **Validate input at every boundary** with the shared Zod schemas; parameterized queries only.
- **Rate limiting** on auth, seeks, challenges, API, and per WebSocket; bot protection on sign-up.
- **Least privilege**, secrets never in the repo, dependency scanning, audit logs for sensitive actions.
- **Privacy:** minimal data collection, GDPR export and deletion, a clear privacy policy.
- **Game integrity:** server-authoritative state and clocks; anti-cheat compares moves with the engine and
  flags for human review, never auto-banning on one signal; reports and moderation tools.

## 7. Performance, Reliability & Operations

- **Cheap by design:** one Node process + one SQLite file, runnable on a free or very cheap machine.
- **Low latency:** move round-trip well under 100 ms within region.
- **Every move is persisted**, so a restart restores games in progress.
- **Scale later:** if one machine isn't enough, move to Postgres and shard games by ID.
- **Operations:** structured logs, health endpoint, CI (typecheck, lint, test), SQLite backups (e.g. Litestream),
  a single Docker image.

## 8. Community & Openness

- Free to play; no paywalled core features.
- Public API and clearly labeled bot accounts (ranked separately from humans).
- Game database exports; consider open-sourcing the code.

## Tech Stack

**One language, few dependencies, one deployable.** Everything is TypeScript, so rules, engine, and protocol
types are written once and shared by browser and server.

- **core:** rules, notation, engine, Zod protocol schemas. Pure TS, no I/O; used by both sides.
- **server:** Node + Fastify (+ WebSocket), SQLite via Drizzle, own session auth (Argon2id), Glicko-2.
- **web:** SvelteKit as a static single-page app; the engine runs in Web Workers.
- **Tooling:** pnpm workspaces, Vitest, ESLint, Prettier.

Three packages and no more, unless something genuinely can't fit. `core` never imports from `server` or `web`.

## Non-Goals (for now)

Native mobile apps, paid tiers or monetization, rule variants, voice/video.

## Glossary

- **Local board** / **global board:** one of the nine small boards / the 3×3 board made of them.
- **Forced board:** the local board the player to move must play in. **Free move:** when it's decided.
- **RD:** Glicko rating deviation, i.e. how uncertain a rating is.
- **PV:** principal variation, the engine's expected best line.
- **UTN:** Ultimate Tic-tac-toe Notation (docs/notation.md).
- **MCTS:** Monte Carlo Tree Search; the engine picks moves by simulating many random games.
