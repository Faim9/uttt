# Roadmap

What's built, what's next, and in what order. This is the single place for project status: update it when
work is finished or priorities change. The target product is described in PILLARS.md.

## Next, in priority order

1. **Launch for real tests:** server (Oracle, pending capacity), then follow docs/deploy.md. The code is
   at https://github.com/Faim9/uttt (private until launch); at launch, make it public and set `SOURCE_URL`.

After that, the owner sets priorities. Candidates: spectating / TV, social features (follow, block), rating
graphs on profiles, online rematch, basic anti-cheat.

## Done

- **Core:** rules, UTN notation (see docs/notation.md), MCTS engine. Full test coverage.
- **Web:** board UI, play vs. computer (6 levels), analysis board (variation tree, live engine eval, import/export,
  share links).
- **Online play:** accounts (Argon2id, DB sessions), guest play, quick pairing in five time controls, challenge
  links, server-authoritative games with clocks, resign / draw / abort, games restored after a server restart.
- **Post-game review:** "Review game" after every game (online and vs. computer) and on the analysis board.
  Evaluates each position at 10k playouts across parallel workers (~1–2 s per game), classifies every move
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
  per-socket), Zod validation of all input, hash-based CSP, helmet headers.

## Later

- **Phase 2:** spectating / TV, social (follow, block), basic anti-cheat, moderation tools, OAuth, rating graphs.
- **Phase 3:** puzzles, tournaments, opening explorer, public API & bots, variants.
- **Engine upgrades, only when needed:** MCTS-solver → smarter playouts → neural-network-guided search.

## Open decisions

- **Hosting:** decided: Oracle Cloud Always Free VM (home region Madrid preferred), behind a Cloudflare Tunnel.
  Portable by design: moving provider means copying the SQLite file and repointing DNS.
- **Email provider:** any SMTP provider works (e.g. Resend or Brevo free tiers); set `SMTP_URL` and `MAIL_FROM`,
  and name the provider on the privacy page (`packages/web/src/routes/privacy/+page.svelte`).
- **Site name and domain:** decided: **UTTT**, at `uttt.org` (registered at Cloudflare, 2026-10). `u3t.org` as a
  redirect is a maybe, if the site takes off.
- **Publish the repository** and set `SOURCE_URL` in `packages/web/src/routes/+layout.svelte` before deploying:
  the AGPL requires offering the source to the site's users.
- **Logo.**
