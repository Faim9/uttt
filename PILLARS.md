# UTTT Platform — Product Pillars

> A free, open, web-hosted platform for **Ultimate Tic-Tac-Toe**, in the spirit of lichess.org and chess.com:
> play rated games against real people, review them with a strong engine, and climb a fair ranking ladder.

This document is the north star for the project. Every feature, design choice, and trade-off should map
back to one or more pillars below. If something doesn't serve a pillar, it probably doesn't belong (yet).

---

## 0. Guiding Philosophy

- **Play first.** A visitor should be able to start a game in two clicks. Everything else supports playing.
- **The server is the source of truth.** Clients display and propose; the server validates and decides.
- **One rules engine.** Rules are implemented once and shared by the client, server, and engine — never re-implemented.
- **Fairness over features.** Correct ratings, honest clocks, and cheat-free games matter more than extra polish.
- **Lichess-style openness.** Free to play, no pay-to-win, no intrusive ads; data export is a user right.
- **Secure by default.** Security is a design constraint from day one, not a later hardening pass.

---

## 1. Game Core & Rules Correctness

The foundation everything else is built on.

### Rules (canonical)

- The board is a 3×3 grid of **local boards**, each a 3×3 tic-tac-toe grid (81 cells total).
- **X** moves first. Players alternate.
- The cell you play inside a local board determines which local board your opponent must play in next
  (e.g. playing in the top-right cell of any local board sends the opponent to the top-right local board).
- If the target local board is **already won or full**, the opponent may play in **any** open cell on any undecided local board.
- A local board is **won** by three in a row inside it; it is **drawn** if full with no winner.
- The game is won by winning three local boards in a row on the **global** board.
- If no legal moves remain and nobody has three in a row globally, the game is a **draw**.
- Drawn local boards count for **neither** player.
- Other ways to end a game: resignation, timeout, abort (before both players move), agreed draw, disconnect forfeit.

> Rule variants (e.g. drawn local boards counting for both, "won board can still be played in") are **out of scope for v1**
> but the engine should be designed so a variant flag can be added later.

### Notation — UTN (_Ultimate Tic-tac-toe Notation_) — decided

Notation mirrors how people think: **first which big board, then which cell inside it.**

Both levels use the same 1–9 numbering, in reading order (like a phone keypad):

```
1 2 3
4 5 6
7 8 9
```

- **Move:** `<big>-<small>`, e.g. `5-3` = center board, top-right cell.
- **Nice property:** the small cell of a move is the big board of the next move, so normal play reads as a chain:
  `5-3  3-7  7-5 ...`. A break in the chain means a free move, so free moves are easy to spot.
- **Game record:** a PGN-like text with header tags followed by numbered move pairs (X move, then O move):
  ```
  [X "alice"]
  [O "bob"]
  [TimeControl "180+2"]
  [Result "1-0"]

  1. 5-5 5-1 2. 1-9 9-5 3. 5-3 3-7 ... 1-0
  ```
  Results: `1-0` (X wins), `0-1` (O wins), `½-½` (draw).
- **Position string:** the 9 local boards in order 1–9, each written as 9 cells (`x`, `o`, `.`) and separated by `/`.
  After them come the side to move and the forced board (`-` = free move):
  ```
  ..x....../........./.....o.../........./....x..../........./........./........./......... o 3
  ```
  Won and drawn local boards are derived from the cells, not stored. Used for analysis board import/export,
  puzzle setup, and engine input.

### Requirements

- Single, well-tested rules library (move generation, legality, win/draw detection, UTN parse/format).
- Unit tests + property tests (e.g. random playouts never produce illegal states; parse ∘ format = identity).
- Fast enough for engine playouts: one 9-bit mask per player per local board.

---

## 2. Web-Hosted, Real-Time Play

The core user experience.

- **Fully browser-based**, responsive (desktop + mobile web), no install required.
- **Real-time games over WebSockets** with server-authoritative move validation.
- **Time controls:** bullet, blitz, rapid, and correspondence (days per move). Increment supported (e.g. `3+2`).
- **Server-authoritative clocks** with lag compensation; clients only render time.
- **Matchmaking:** quick-pairing pools by time control and rating range; open seeks in a lobby; direct challenges to a user or by link.
- **Reconnection:** a dropped connection resumes the game seamlessly; disconnect grace period before forfeit.
- **Play vs. computer** at selectable strength levels (unrated).
- **Spectating:** live games can be watched; "TV" view of top-rated live games.
- **Game history & archive:** every finished game is stored, browsable, shareable by URL, and exportable.
- **Rematch, offer draw, resign, takeback (casual only)** in-game actions.
- **Accessibility:** keyboard play, screen-reader move announcements, color-blind-safe themes, light/dark mode.

---

## 3. Accounts & Identity

- **Account-based**: rated play, history, and rankings are tied to an account.
- **Anonymous play allowed** for casual games (lichess-style), with a nudge to sign up.
- **Sign-up/login:** email + password, plus optional OAuth (Google, GitHub, Discord). Email verification required for rated play.
- **Profile:** username, avatar, country/flag, bio, ratings per time control, rating graph, game stats, recent games.
- **Social:** follow players, friend challenges, block/mute users.
- **Settings:** board theme, piece style (X/O), sound, move confirmation, premoves, privacy options.
- **Account lifecycle:** password reset, 2FA (TOTP), session management (see & revoke devices), full data export, account deletion (GDPR).

---

## 4. Analysis Board & Engine

The pillar that turns the site from "a place to play" into "a place to improve."

### Engine — decided: plain MCTS (UCT with random playouts)

- **Why:** this is the simplest engine that plays well. It needs no hand-written evaluation function to tune, and the
  whole engine fits in ~150 lines. UTTT positions are cheap to simulate: ~16k playouts/second in Node (measured),
  so one second of thinking is enough to beat beginners and average players.
- **One implementation, two places:**
  - **Browser (Web Worker)** — analysis runs on the user's machine at no server cost.
  - **Server** — play vs. computer and, later, post-game review and cheat detection.
- **Outputs:** best move, principal variation (most-visited line), evaluation as X's win probability from root
  statistics, and playout count.
- **Strength levels** = playout budget (e.g. 100 → 50k playouts).
- **Upgrade path (only when needed):** MCTS-solver (proves forced wins/losses and fixes tactical blind spots) →
  smarter playouts (take immediate wins / block immediate losses) → a neural-network-guided search much later.

### Analysis board

- Free-form board: play any legal moves from any position; moves shown in UTN (`5-3`).
- **Variation tree:** main line + side lines, promote/delete variations, annotations (`!`, `?`, `!!`, `??`, comments).
- Live engine evaluation bar + top-N candidate moves with PVs, highlighted on the board.
- Import/export via UTN game records and position strings; shareable analysis links.
- **Post-game review:** one click from a finished game → full engine pass with eval graph, accuracy %, and
  inaccuracy/mistake/blunder classification per move.
- Visual aids: highlight forced local board, show which board each move sends the opponent to.

### Later

- Opening explorer (move statistics from the game database).
- Puzzles generated from real games' tactical moments, with their own puzzle rating.
- Studies / shared annotated boards.

---

## 5. Rating & Ranking Ladder

- **Rating system: Glicko-2** (as lichess) — tracks rating, rating deviation (confidence), and volatility.
- **Separate ratings per time control category** (bullet / blitz / rapid / correspondence) and later per variant.
- **Provisional ratings** (high RD) clearly marked, shown with `?`, excluded from leaderboards.
- **Starting rating:** 1500, high RD.
- **Rating changes shown** before the game (win/draw/loss deltas) and after.
- **Leaderboards:** top players per time control, by country, and among friends. Requires a minimum games
  count and recent activity to appear.
- **Inactivity:** RD grows over time when inactive; inactive players drop off leaderboards but keep their rating.
- **Ladder integrity:** rating abuse detection (sandbagging, farming alt accounts, win trading); rating
  refunds to victims when a cheater is banned.
- **Later:** tournaments (arena & Swiss), seasons, titles/badges.

---

## 6. Security & Fair Play

Security is a pillar, not a checklist item.

### Application security

- Follow the **OWASP Top 10 / ASVS** as a baseline.
- **HTTPS everywhere**, HSTS, secure cookie flags (`HttpOnly`, `Secure`, `SameSite`).
- **Password storage:** Argon2id. Breached-password checks on sign-up. Optional 2FA (TOTP).
- **Sessions:** server-side sessions or short-lived tokens with rotation; revocable from the account page.
- **CSRF protection**, strict **Content Security Policy**, output encoding to prevent XSS (user bios, chat, usernames).
- **Input validation at every boundary**; parameterized queries only (no string-built SQL).
- **Rate limiting** on login, sign-up, chat, seeks, challenges, and API endpoints; bot/captcha protection on sign-up.
- **WebSocket hardening:** authenticated connections, per-connection message rate limits, schema-validated messages.
- **Least privilege** for services and DB users; secrets in a secret manager, never in the repo.
- **Dependency scanning**, automated security updates, and security review for auth/game-state changes.
- **Audit logs** for sensitive actions (login, password change, moderation actions).
- **Privacy:** minimal data collection, GDPR-compliant data export & deletion, clear privacy policy.

### Game integrity

- **Server-authoritative game state and clocks** — a client can never make an illegal move or fake time.
- **Anti-cheat:** server-side engine comparison of players' moves (accuracy vs. rating, move-time patterns,
  tab-focus signals), flagged for human review — never auto-ban on a single signal.
- **Fair-play policy** and a moderation pipeline: reports, mod dashboard, warnings, rating-pool bans, account closures.
- **Chat safety:** profanity filter, report/mute, chat disabled for new/anonymous accounts by default.

---

## 7. Performance, Reliability & Operations

- **Cheap by design:** the whole site is **one Node process + one SQLite file**, so it runs on a free or very cheap
  machine. Analysis runs in the browser, so engine load doesn't fall on the server.
- **Low latency:** move round-trip well under 100 ms within region; clocks must feel exact.
- **Graceful degradation:** every move is written to the DB, so a restart restores in-progress games.
- **Scale later, not now:** live games are held in memory in a single process. If we outgrow one machine, move to
  Postgres and shard games by ID. The DB layer (Drizzle) keeps that migration contained.
- **Observability:** structured logs (pino), a health endpoint, and basic metrics (active games, move latency).
- **CI:** type-check, lint, and test on every push (GitHub Actions — free).
- **Backups:** periodic copies of the SQLite file (e.g. Litestream to free object storage).
- **Deployable as a single Docker image.**

---

## 8. Community & Openness (lichess spirit)

- Free to play, no paywalled core features.
- **Public API** (read games, export, challenge) with rate limits — enables bots and third-party tools.
- **Bot accounts:** a clearly labeled class of account that can play via the API (separate from humans in rankings).
- Game database exports for research and engine training.
- Consider open-sourcing the codebase.

---

## Tech Stack — decided

**Principle: one language, few dependencies, one deployable.** Everything is **TypeScript**, so the rules, engine,
and message types are written once and imported by both the browser and the server.

| Layer          | Choice                                            | Why                                                                     |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Language       | **TypeScript** (strict) everywhere                | One language and one toolchain; code shared between client and server   |
| Rules + engine | Pure TS package, no dependencies                  | Runs the same in the browser (Web Worker) and in Node                   |
| Frontend       | **SvelteKit** (SPA mode, static build)            | Least boilerplate of the major frameworks; built-in routing             |
| Backend        | **Node + Fastify** (+ `@fastify/websocket`)       | Small, fast, built-in schema validation; also serves the frontend build |
| Validation     | **Zod**, schemas shared by client & server        | Every HTTP/WS message validated at the boundary                         |
| Database       | **SQLite** via **Drizzle ORM**                    | Zero-ops, free, fast; typed queries; Postgres migration path            |
| Auth           | Own session auth (DB sessions, `@node-rs/argon2`) | ~100 lines we fully understand; no auth vendor                          |
| Ratings        | Glicko-2, implemented in-house                    | Small, well-specified algorithm                                         |
| Tests          | **Vitest**                                        | Same config style as Vite/SvelteKit                                     |
| Tooling        | **pnpm** workspaces, ESLint, Prettier             | Standard; one root command for each task                                |

### Repository structure

```
packages/
  core/     rules, UTN notation, MCTS engine, shared Zod protocol schemas — no I/O
  server/   Fastify app: HTTP routes, WebSocket game hub, auth, ratings, DB (Drizzle)
  web/      SvelteKit frontend: board UI, lobby, analysis board, profiles
```

Three packages and no more, unless something genuinely can't fit. `core` must never import from `server` or `web`.

---

## MVP Scope (Phase 1)

The smallest product that proves the concept:

1. [x] Rules library with full test coverage + notation.
2. [x] Accounts (email/password, sessions) + anonymous casual play. _Email verification deferred._
3. [x] Real-time play with time controls, quick pairing, and challenge-by-link.
4. [x] Glicko-2 ratings per category (bullet/blitz/rapid) + a leaderboard.
5. [x] Game archive per user (profile page), shareable game URLs (`/game/<id>`).
6. [x] Analysis board with the in-browser MCTS engine (eval + best line).
7. [x] Security baseline from Pillar 6 (auth, rate limiting, CSP, server-authoritative state).
8. [x] Play vs. computer (pulled forward from Phase 2).

**Deferred from the MVP** (each needs a decision or an external service):

- Email verification and password reset: needs an email provider.
- Breached-password check (HIBP), 2FA, OAuth, session management page.
- Clock lag compensation; claiming victory when the opponent disconnects (today their clock just runs out).
- Rating-range matchmaking (pairing is first-come within a pool).

**Phase 2:** post-game review, play vs. computer, spectating/TV, profiles & social, basic anti-cheat, moderation tools.
**Phase 3:** puzzles, tournaments, opening explorer, public API & bots, mobile polish, variants.

---

## Non-Goals (for now)

- Native mobile apps (responsive web first).
- Paid tiers or monetization.
- Rule variants beyond the canonical ruleset.
- Voice/video features.

---

## Open Decisions

- [x] Tech stack — TypeScript everywhere, Fastify + SvelteKit + SQLite (see Tech Stack).
- [x] Notation — UTN `<big>-<small>`, 1–9 reading order (see Pillar 1).
- [x] Engine — plain MCTS, upgrade only when needed (see Pillar 4).
- [ ] Hosting — deferred (no budget yet). Since the site is one Docker image + SQLite file, free/cheap candidates are:
      Oracle Cloud Always Free VM, a home machine behind Cloudflare Tunnel, or a ~$5/month VPS.
- [ ] Project/site name and domain.
- [ ] Open-source license (if any).

---

## Glossary

- **Local board** — one of the nine small 3×3 boards.
- **Global board** — the 3×3 meta-board whose cells are the local boards.
- **Forced board** — the local board the player to move is required to play in.
- **Free move** — when the forced board is won/full and the player may play anywhere.
- **RD** — Glicko rating deviation; how uncertain a player's rating is.
- **PV** — principal variation; the engine's expected best line.
- **UTN** — Ultimate Tic-tac-toe Notation: moves as `<big>-<small>` (e.g. `5-3`), plus game record and position string formats.
- **MCTS** — Monte Carlo Tree Search; the engine picks moves by simulating many random games.
