# Goodreads MCP

Use your Goodreads shelves and reading history from Claude Code, Codex, and
other Model Context Protocol clients—without sharing a Goodreads password.

Goodreads MCP reads supported Goodreads RSS feeds and optional Goodreads CSV
exports. The local server runs entirely on your machine. The remote server adds
OAuth 2.1 login, per-account storage, and a Streamable HTTP MCP endpoint on
Cloudflare Workers.

> [!IMPORTANT]
> Goodreads retired its public API. This project does not scrape Goodreads,
> collect session cookies, or use private Goodreads APIs. RSS is limited to
> roughly the most recent 100 books on each shelf; import a CSV export for
> complete history.

## Tools

| Tool                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `list_shelves`          | List shelves found in RSS or an imported library                  |
| `get_reading_list`      | Read a shelf with an optional result limit                        |
| `get_currently_reading` | Read the `currently-reading` shelf                                |
| `get_recently_read`     | Return recently completed books                                   |
| `reading_stats`         | Calculate counts, ratings, pages, and pace, optionally by year    |
| `search_library`        | Search your own library by title, author, or ISBN                 |
| `get_book`              | Find a library book and enrich ISBN metadata through Open Library |

## Run locally

Requirements: Node.js 20 or newer and a Goodreads profile user ID. For RSS
access, open **My Books**, find the RSS link at the bottom of a shelf, and copy
the `key` query parameter. Treat it as a secret.

```sh
export GOODREADS_USER_ID=12345678
export GOODREADS_RSS_KEY=your-rss-key
npx goodreads-mcp
```

`GOODREADS_RSS_KEY` is optional for public feeds. You can also set
`GOODREADS_CSV_PATH` to a Goodreads library export for complete local history.

### Claude Code

```sh
claude mcp add goodreads \
  --env GOODREADS_USER_ID=12345678 \
  --env GOODREADS_RSS_KEY=your-rss-key \
  -- npx -y goodreads-mcp
```

### Codex

```toml
# ~/.codex/config.toml
[mcp_servers.goodreads]
command = "npx"
args = ["-y", "goodreads-mcp"]

[mcp_servers.goodreads.env]
GOODREADS_USER_ID = "12345678"
GOODREADS_RSS_KEY = "your-rss-key"
```

## Use the hosted server

After deploying, connect a Streamable HTTP client to `/mcp`:

```sh
claude mcp add --transport http goodreads https://YOUR_WORKER.workers.dev/mcp
claude mcp login goodreads

codex mcp add goodreads --url https://YOUR_WORKER.workers.dev/mcp
codex mcp login goodreads
```

The OAuth login opens the Worker's connect page. Paste your Goodreads profile
URL (for example `https://www.goodreads.com/user/show/12345678-name`) and
optional RSS key. The OAuth provider supports dynamic client registration,
PKCE, refresh tokens, and protected-resource metadata for compatible clients.

## Self-host on Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/simhskal/goodreads-mcp)

For a manual deployment:

1. Fork or clone this repository and run `pnpm install`.
2. Create the D1 database and KV namespaces described in
   [`packages/server-remote/wrangler.toml`](packages/server-remote/wrangler.toml).
3. Apply the D1 migrations.
4. Replace placeholder binding IDs in `wrangler.toml`.
5. Add the secrets documented in
   [`packages/server-remote/README.md`](packages/server-remote/README.md).
6. Run `pnpm --filter @goodreads-mcp/server-remote deploy`.

Cloudflare's free plan is sufficient for personal/light use, subject to its
current limits. The deploy job in CI requires `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets.

## Development

```sh
corepack enable
pnpm install
pnpm check
pnpm build
```

Workspace layout:

```text
packages/core           RSS, CSV, library queries, stats, Open Library
packages/server-local   stdio MCP server published as goodreads-mcp
packages/server-remote  OAuth-enabled Cloudflare Worker and onboarding UI
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for project boundaries and
[SECURITY.md](SECURITY.md) for reporting and data-handling details.

## Privacy

The local server keeps your library and credentials on your machine. A hosted
deployment stores the Goodreads identity, RSS key, imported CSV rows, and OAuth
grants required to serve each account. It does not receive your Goodreads
password. RSS responses may be cached for up to 15 minutes. Use the
authenticated `delete_account` MCP tool to remove stored profile and library
data, then revoke the connection in your MCP client.

Open Library receives ISBN queries when `get_book` performs enrichment. Review
the policies of Goodreads, Open Library, Cloudflare, and your MCP client before
use.

## Limitations and migration path

- Goodreads RSS normally exposes only about 100 recent items per shelf.
- Private profiles may need an RSS key or CSV-only mode.
- Some CSV exports omit fields used by aggregate statistics.
- If Goodreads retires RSS, the core data-source interface can support another
  provider. Hardcover is the intended migration candidate because it offers a
  documented GraphQL API and Goodreads import.

## License

[MIT](LICENSE)
