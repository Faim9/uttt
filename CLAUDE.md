# UTTT Platform

A lichess/chess.com-style website for Ultimate Tic-Tac-Toe.

- **PILLARS.md** (loaded below): the target product and its principles. Change it only when a product decision changes.
- **ROADMAP.md** (loaded below): what's done, the owner's priority order, open decisions. Update it when finishing
  work or when priorities change; it is the only place that tracks status.
- **docs/notation.md**: the full UTN spec. Read it before touching notation, position strings, game records,
  import/export, or share links.

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

## Commands

`pnpm dev` (web on :5173, API on :3000, proxied) · `pnpm test` · `pnpm typecheck` · `pnpm lint` ·
`pnpm format` · `pnpm build` · `pnpm start` (production: one process serves the built site + API).
Schema changes: edit `packages/server/src/schema.ts`, then `pnpm --filter @uttt/server db:generate --name <change>`;
migrations run automatically on startup. Run typecheck, lint, and test before committing.

## Stack gotchas

- **SvelteKit 3:** config lives in `vite.config.ts` (`sveltekit({...})`); there is no `svelte.config.js`.
  `$lib` is replaced by the `#lib/*` subpath import in `packages/web/package.json`.
- **TypeScript is pinned to 6.0.x** until typescript-eslint supports TS 7.
- `core` is consumed as TS source (no build step); imports use explicit `.ts` extensions. The server runs
  `.ts` directly with Node's built-in type stripping, so only erasable TS syntax is allowed.
- The server rejects unsafe requests and WebSocket handshakes whose Origin isn't `PUBLIC_URL` (default
  `http://localhost:5173`), so in development open the site at exactly that address.
- Production runs from `deploy/` (Dockerfile, compose with Litestream backups and a Cloudflare Tunnel);
  see docs/deploy.md. Data lives in `deploy/data` on the server.
- The CSP is a `<meta>` tag SvelteKit adds to the build (configured in `vite.config.ts`); it's absent in dev.

@PILLARS.md
@ROADMAP.md
