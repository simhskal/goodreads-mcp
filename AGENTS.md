# AGENTS.md

Brief for AI agents and new contributors working in this repository. Read this
file end-to-end before making changes, then consult [PLAN.md](PLAN.md) for
product rationale and [CONTRIBUTING.md](CONTRIBUTING.md) for review rules.

## What this project is

Goodreads MCP exposes a reader's own Goodreads library to Model Context Protocol
clients (Claude Code, Codex, and others) **without collecting a Goodreads
password**.

Goodreads retired its public API, so all data arrives through two sanctioned
channels:

| Channel              | Gives                                                | Limits                                    |
| -------------------- | ---------------------------------------------------- | ----------------------------------------- |
| Per-shelf RSS feeds  | Live shelf data: title, author, ISBN, ratings, dates | ~100 most recent items per shelf; RSS key |
| Goodreads CSV export | Complete library history including reviews           | Manual, human-in-the-loop export          |

Open Library is used only to enrich ISBN metadata in `get_book`.

## Hard boundaries — do not cross

These are non-negotiable and PRs violating them are rejected:

- **No Goodreads passwords or session cookies.** Ever, in any code path.
- **No scraping and no private/internal Goodreads APIs** (including the internal
  AppSync GraphQL endpoint) in the hosted paths.
- **No real secrets or real library exports in the repo.** Test fixtures must use
  invented data. The RSS key is a secret: never log it, echo it, or embed it in
  a URL that gets written to logs or error messages.
- **Keep the data layer pluggable.** If Goodreads retires RSS, Hardcover's
  GraphQL API is the intended migration target, so provider-specific logic stays
  behind the `core` data-source interfaces rather than leaking into servers.

## Repository layout

pnpm workspace, TypeScript, ESM throughout. Node.js 20+.

```text
packages/core           RSS parsing, CSV import, library queries, stats, Open Library
packages/server-local   stdio MCP server, published to npm as `goodreads-mcp`
packages/server-remote   Cloudflare Worker: OAuth 2.1 provider, D1/KV storage, onboarding UI
api/server.ts           Single-user Vercel Streamable HTTP endpoint (rewritten from /mcp)
public/index.html       Static landing page for the Vercel deployment
```

Package names:

- `@organized-chaos/goodreads-mcp-core` — shared library, built to `dist/` and consumed via
  `workspace:*`
- `goodreads-mcp` — the published stdio server binary
- `@goodreads-mcp/server-remote` — private Worker package

### Three deployment targets, one tool surface

The same seven tools (`list_shelves`, `get_reading_list`,
`get_currently_reading`, `get_recently_read`, `reading_stats`, `search_library`,
`get_book`) are served by all targets:

1. **Local stdio** — reads `GOODREADS_USER_ID` / `GOODREADS_RSS_KEY` /
   `GOODREADS_CSV_PATH` from the environment.
2. **Vercel (single user)** — `api/server.ts` wraps `mcp-handler` and reuses
   `registerTools` and `readConfig` from `server-local`. Intended for one
   Goodreads account, no OAuth.
3. **Cloudflare Worker (multi-user)** — adds OAuth 2.1 with dynamic client
   registration, PKCE, refresh tokens, per-account D1 storage, CSV upload, and
   `delete_account`.

**When adding or changing a tool, update all three.** Tool registration lives in
`packages/server-local/src/server.ts` (shared by local and Vercel) and
`packages/server-remote/src/mcp.ts`.

## Commands

```sh
corepack enable
pnpm install

pnpm check       # format:check + typecheck + test — run this before every commit
pnpm build
pnpm format     # prettier --write .
pnpm test
pnpm typecheck
```

Package-scoped work:

```sh
pnpm --filter goodreads-mcp dev                       # stdio server via tsx
pnpm --filter @goodreads-mcp/server-remote dev        # wrangler dev
pnpm --filter @goodreads-mcp/server-remote db:migrate:local
pnpm --filter @goodreads-mcp/server-remote deploy
```

CI (`.github/workflows/ci.yml`) runs `pnpm install --frozen-lockfile`,
`pnpm check`, and `pnpm build` on every PR, then deploys the Worker on pushes to
`main` using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
Vercel deploys the repo separately via its own Git integration.

## Conventions

- **ESM with explicit `.js` extensions on relative imports**, even in
  TypeScript source (`import { x } from "./types.js"`). This is required by the
  `nodenext`-style resolution the project uses; omitting it breaks the build.
- `packages/core/src/index.ts` is a barrel of `export *`. Add new modules there.
- Validate tool inputs with `zod` (v4). Keep versions pinned exactly where they
  already are pinned (`@modelcontextprotocol/sdk`, `zod`, `wrangler`).
- MCP tool handlers return through the `jsonResult` / `errorResult` helpers so
  successes and failures have a consistent shape. Errors are surfaced as
  `isError` results with a human-readable message, not thrown.
- Prettier is the single formatting authority. Do not hand-format; run
  `pnpm format`.
- Tests are Vitest, colocated (`src/*.test.ts`) or in `test/`. The Worker package
  uses `@cloudflare/vitest-pool-workers`.
- **Add tests for any parsing or query change.** RSS and CSV parsing are the
  highest-risk surfaces in the codebase.

## Gotchas

- Two files depend on RSS's ~100-item cap being worked around by CSV. Don't
  "optimize" a query into RSS-only if it currently prefers imported CSV rows.
- `api/server.ts` imports `core` and `server-local` **from source**, not from
  `dist/`. Changes to those packages affect the Vercel function immediately, and
  a type error there fails the Vercel build even though it lives outside
  `packages/`.
- `pretypecheck` hooks build `@organized-chaos/goodreads-mcp-core` first; if typecheck fails with
  missing `dist/` types, run `pnpm build` once.
- The Worker's `wrangler.jsonc` contains placeholder binding IDs. A fresh
  self-host must create its own D1 database and KV namespaces and replace them.
- RSS responses may be cached up to 15 minutes. Stale results during manual
  testing are usually the cache, not a bug.

## Before you finish

1. `pnpm check` and `pnpm build` both pass.
2. New parsing/query behavior has tests, with invented fixture data.
3. No secrets, real user IDs, RSS keys, or exported libraries added.
4. Tool changes applied consistently across local, Vercel, and Worker targets.
5. README updated if setup, tools, or deployment steps changed.
