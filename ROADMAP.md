# Roadmap

What's built, what's next, and in what order. This is the single place for project status: update it when
work is finished or priorities change. The target product is described in PILLARS.md.

## Next, in priority order

1. **Public launch** (the owner skipped a soft launch): move to a rented server (separate from the owner's
   home network, runs 24/7) with an uptime alert, make the repository public (set `SOURCE_URL`), and launch.
2. **Bring in players:** plan the launch so new visitors find opponents (owner and Claude to discuss).

After that, the owner sets priorities:

- **Google Play listing:** wrap the installed app (a Trusted Web Activity, e.g. with Bubblewrap); needs a
  Google Play developer account ($25 once). The App Store is harder (Apple often rejects web wrappers).
- Other candidates: basic anti-cheat.

## Done

- **Core:** rules, UTN notation (see docs/notation.md), MCTS engine. Full test coverage.
- **Stronger engine:** MCTS-solver on a compact in-place board (~4× faster), playouts that take game-winning
  moves, exploration tuned to 0.6. Against the old engine at equal time: 72 wins, 5 draws, 3 losses (≥ +450 Elo).
  Levels 4–6 got bigger budgets (level 6: ~1 s per move), review 40k playouts per position, analysis up to 1M.
- **Web:** board UI, play vs. computer (6 levels), analysis board (variation tree, live engine eval, import/export,
  share links), and a board editor (place pieces in any order, e.g. from a screenshot; checks the position
  could come from a game, then opens it in the analysis board).
- **Online play:** accounts (Argon2id, DB sessions), guest play, quick pairing in five time controls, challenge
  links, server-authoritative games with clocks, resign (with confirmation) / draw / abort, games restored after
  a server restart. Your move shows the instant you click; the server confirms it in the background.
- **Post-game review:** "Review game" after every game (online and vs. computer) and on the analysis board.
  Evaluates each position at 40k playouts across parallel workers (~2–3 s per game), classifies every move
  (best / good / inaccuracy / mistake / blunder by win-chance lost: 10 / 20 / 30%), per-player accuracy,
  eval graph, jump to each player's next mistake, and "show best move".
- **Rating-based matchmaking** (after lichess's pool): pairs by rating gap minus a wait bonus that grows every
  2 s wave, so the accepted gap starts at ~100 points and widens while waiting; provisional players pair together.
- **Account security:** settings page with signed-in devices (sign out one or all, which also drops their live
  connections), password change, breached-password check (Have I Been Pwned, k-anonymity), email verification
  (required for rated play), password reset by email (any SMTP provider), and two-factor authentication
  (TOTP with replay protection, plus 10 single-use recovery codes).
- **Clock lag compensation** (after lichess's LagTracker): the server pings every connection to estimate its
  lag and refunds it on each move from a quota (refills ≤1 s per move, capped at 7×); the flag waits out the
  quota so moves in transit still count.
- **Disconnects:** a player whose last connection to a running game drops is shown as gone; after 30 s the
  opponent may claim the win or a draw ("won by abandonment"). Coming back resets the wait.
- **Deployment prep:** Docker image, compose with Litestream backups to Cloudflare R2 (7-day point-in-time
  restore), restore-on-first-start, Cloudflare Tunnel, rotated logs, health check; guide in docs/deploy.md.
- **Privacy (GDPR):** privacy page, download-my-data (JSON), account deletion (games kept, anonymized).
- **Ratings:** Glicko-2 per category (bullet / blitz / rapid), profiles with recent games, leaderboard.
- **Security baseline:** same-origin checks on unsafe requests and WebSocket handshakes, rate limits (HTTP and
  per-socket), Zod validation of all input, hash-based CSP, helmet headers. After a review before launch:
  two-factor locks for 15 minutes after 5 wrong codes, at most 50 live connections per address, at most one
  email of each kind per user per minute, Cloudflare Turnstile on sign-up, weekly Dependabot updates.
- **Terms of use** page, linked from the footer and the sign-up form.
- **Community:** follow players (follower counts; a "Following" card on the home page shows who's online and
  links to their games), block players (never paired, no challenges or rematches; ends follows), and rating
  graphs per category on profiles (history recorded per rated game, backfilled from past games).
- **Arena tournaments:** admins schedule them (name, time control, start, length, rated). Players with an
  account join from the tournament page and are paired again and again while they stay there (closest
  score, avoiding an immediate rematch and blocked players); 2 points per win, 1 per draw, computed from the
  tournament's games; live standings; after a game you're taken back to the tournament. The lobby features
  the running or next tournament.
- **Installable app (PWA):** manifest and icons, so phones and desktops can install UTTT with its own icon and
  open it full screen; a service worker caches the app (it opens instantly, and offline for the computer
  and analysis). On phones: an app-style bottom tab bar (Play, Puzzles, Watch, Tournaments, More)
  with a More sheet; "Install the app" where the browser allows it, instructions on iPhone.
- **Puzzles:** 470 positions where one move forces a game win in one to four moves (60 / 220 / 150 / 40),
  unique at every step against the best defense, checked exhaustively; generated from engine self-play with
  `pnpm puzzles` (new ones join the database when the server starts). A daily puzzle of two moves or more
  (the same for everyone), links to analyze.
- **Puzzle ratings** (like lichess's): every player and every puzzle has a Glicko-2 rating; solving counts
  as a win against the puzzle, a wrong move or giving up as a loss. Only the first try at a puzzle is rated,
  and the server judges the moves played. "Next puzzle" picks an untried one near your rating (guests get
  random ones, unrated). Puzzles start rated by length (1100 / 1500 / 1800 / 2000 for one to four moves) and
  settle as people play them. Profiles show the puzzle rating and its graph.
  A wrong move is played out, like on lichess: the opponent answers with the engine's best reply, your
  rating change shows at once, and "Try again" goes back to before the mistake.
- **Lobby for a small player base:** an honest activity line (players in games and looking, guests included),
  "N waiting" on each pool, a "Play now" button that joins the pool where someone already waits (3+2
  otherwise), and a search that follows you around the site: play the computer while you wait (suggested after
  20 s alone), and you're taken to your game when someone joins.
- **After a game:** rematch (offer, accept or decline; colors swap; offers last 5 minutes) and "New opponent",
  which goes back to the lobby already looking for a game in the same pool.
- **Moderation:** players report players (cheating, abuse, username, other) from profiles. Admins (by email in
  `ADMIN_EMAILS`, with a confirmed email and two-factor on) review reports, close and reopen accounts (signed
  out at once, off the leaderboard), rename players (games too), and reset ratings; every action is logged.
- **Spectating:** a Watch page lists live games (strongest players first) as mini boards with running
  clocks; opening one follows it move by move.
- **Time controls:** six quick-pairing pools (1+0, 2+1, 3+0, 3+2, 5+3, 10+5); challenges take any time
  control from 1+0 to 60+30.
- **Look and feel:** the home page is the lobby (one click on a time control starts pairing, like lichess;
  "Play a friend" opens a dialog), with a self-playing demo board and the rules. Logo, self-hosted Outfit font,
  and four themes picked in the footer: Classic (follows light/dark), Playful, Notebook, Arcade.

## Later

- **Phase 2:** social (follow, block), basic anti-cheat, moderation tools, OAuth, rating graphs.
- **Phase 3:** puzzles, tournaments, opening explorer, public API & bots, variants.
- **Engine upgrades, only when needed:** neural-network-guided search; parallel search across workers on the
  analysis board.

## Open decisions

- **Hosting:** the owner's computer for tests, behind a Cloudflare Tunnel. Oracle Cloud Always Free (Madrid)
  had no capacity when we tried; retry it or pick another server later. Portable by design: a new server restores
  the latest backup on first start. Name the host on the privacy page when it's a provider.
- **Email provider:** decided: Brevo (EU, free tier), named on the privacy page. Any SMTP provider works
  through `SMTP_URL` and `MAIL_FROM`.
- **Site name and domain:** decided: **UTTT**, at `uttt.org` (registered at Cloudflare, 2026-10). `u3t.org` as a
  redirect is a maybe, if the site takes off.
- **Publish the repository** and set `SOURCE_URL` in `packages/web/src/routes/+layout.svelte` before deploying:
  the AGPL requires offering the source to the site's users.
- **Impressum** (German law: name and a reachable postal address): postponed by the owner until donations or
  a wider launch; options are a current home address or a paid address service.
- **Logo:** a first one exists (grid with X and O, `packages/web/src/lib/Logo.svelte`, favicon); replace it if
  a designer makes a better one.
