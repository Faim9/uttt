# UTTT Platform

A lichess/chess.com-style website for Ultimate Tic-Tac-Toe.

The product pillars, rules, notation, tech stack, MVP scope, and open decisions live in PILLARS.md. Treat it as the
source of truth for what we're building and why, and update it when a decision changes.

## Code rules (most important)

The codebase must stay **readable and concise**. Prefer less code that's obviously correct over more code that's clever.

- **No script sprawl.** No little helper scripts scattered around the repo. Every task (dev, build, test, lint,
  db migrate) runs through one `pnpm <task>` command in the root `package.json`. One-off exploration goes in the
  scratchpad, never in the repo.
- **Respect the structure.** Code lives in `packages/core`, `packages/server`, or `packages/web`. Don't add packages,
  top-level folders, or `utils/` grab-bags without a strong reason.
- **One way to do each thing.** Reuse what exists before adding something new. Don't add a dependency for something
  a few lines can do, or reimplement something a core dependency already does.
- **No premature abstraction.** Write it directly; extract only when there's real duplication.
- **Small, focused files and functions.** Name things clearly enough that comments are rarely needed; when you do
  comment, explain _why_, not _what_.
- **Delete dead code.** No commented-out blocks, unused exports, or "just in case" options.
- **Strict TypeScript.** No `any`. Validate all external input with the shared Zod schemas.
- **Server is authoritative.** Never trust the client for game state, clocks, or ratings.

@PILLARS.md
