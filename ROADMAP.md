# Roadmap

What's built, what's next, and in what order. This is the single place for project status: update it when
work is finished or priorities change. The target product is described in PILLARS.md.

## Next, in priority order (set by the owner, 2026-10-02)

1. **Post-game review:** one click from a finished game to see where you went wrong and which moves were good,
   by the engine's judgment: eval graph, best move per position, mistake/blunder classification.
2. **Rating-based matchmaking:** pair players close in rating, widening the range the longer they wait, so
   climbing the ladder brings stronger opponents. Today pairing is first-come within a pool.
3. **Account security + email service:** email verification, password reset, breached-password check, 2FA,
   session management page. Needed before hosting publicly for real tests.
4. **Clock lag compensation:** don't charge players for network transit time.
5. **Disconnects:** grace period, then the opponent may claim victory. Today a disconnected player's clock
   simply runs out.

## Done

- **Core:** rules, UTN notation (see docs/notation.md), MCTS engine. Full test coverage.
- **Web:** board UI, play vs. computer (6 levels), analysis board (variation tree, live engine eval, import/export,
  share links).
- **Online play:** accounts (Argon2id, DB sessions), guest play, quick pairing in five time controls, challenge
  links, server-authoritative games with clocks, resign / draw / abort, games restored after a server restart.
- **Ratings:** Glicko-2 per category (bullet / blitz / rapid), profiles with recent games, leaderboard.
- **Security baseline:** same-origin checks on unsafe requests and WebSocket handshakes, rate limits (HTTP and
  per-socket), Zod validation of all input, hash-based CSP, helmet headers.

## Later

- **Phase 2:** spectating / TV, social (follow, block), basic anti-cheat, moderation tools, OAuth, rating graphs.
- **Phase 3:** puzzles, tournaments, opening explorer, public API & bots, variants.
- **Engine upgrades, only when needed:** MCTS-solver → smarter playouts → neural-network-guided search.

## Open decisions

- **Hosting:** deferred until there's budget. The site is one process + one SQLite file, so a free VM (Oracle
  Cloud Always Free), a home machine behind Cloudflare Tunnel, or a ~$5/month VPS all work.
- **Email provider** (blocks priority 3): e.g. Resend or Brevo free tiers.
- **Site name and domain.**
- **Open-source license** (if any).
