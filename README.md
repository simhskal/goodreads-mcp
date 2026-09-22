# Goodreads MCP

Use your Goodreads shelves and reading history from Claude Code, Codex, and
other Model Context Protocol clients—without sharing a Goodreads password.

Goodreads MCP reads supported Goodreads RSS feeds and optional Goodreads CSV
exports. The local server runs entirely on your machine. The stateless Vercel
server receives your Goodreads identity from client-configured HTTP headers.

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

Requirements: Node.js 20 or newer. The guided setup also requires a locally
installed Google Chrome or Chromium browser.

### Set up your Goodreads connection

For a guided local setup, run the command for the AI client you use:

```sh
npx -y goodreads-mcp setup --client claude
# or
npx -y goodreads-mcp setup --client codex
```

The setup helper opens a temporary visible browser window. Sign in to
Goodreads yourself in that window, then press Enter in the terminal. It finds
your profile ID and RSS link locally, asks before changing your AI client's
configuration, and reports only whether each value was found. It never asks
for, reads, or stores your Goodreads password or session cookies. The browser
session is closed when setup finishes.

The helper configures the Vercel-hosted endpoint at
`https://goodreads-mcp-chi.vercel.app/mcp`. If you do not want to use the
guided helper, the manual configuration below remains supported.

If you prefer to complete the connection manually, your only Goodreads
credential work should still happen directly on Goodreads. The setup sequence
is:

1. Open **Profile** and derive `GOODREADS_USER_ID` from the digits after
   `/user/show/` in the address bar.
2. Open **My Books**, choose a shelf, scroll to the bottom, and find its
   **RSS** link.
3. Parse `GOODREADS_RSS_KEY` from the link in memory, without opening, printing,
   or logging the secret-bearing URL.
4. Show the local destination and variable names, ask for confirmation, write
   the values, restart the MCP client, and verify the connection.

Browser control handles navigation; a local configuration tool handles the
write. The assistant should report only whether each value was found and
written—not the values themselves. If you are setting up manually, the user ID
is the numeric part of your profile URL. The RSS key is the value after `key=`
in the RSS link; leave it unset if the link has no `key` parameter.

The user ID is not sensitive. Treat the RSS key like a password. Keep it only in
your local environment or your MCP client's secret configuration; never put the
full RSS URL or key in source control, screenshots, chat, or command output. The
key is optional when your Goodreads feeds are public.

Sign in to Goodreads yourself; never give an automation tool your password or
ask it to read, export, or store session cookies. Once the RSS link is visible,
the tool must not capture screenshots, browser snapshots, network logs, the
current URL, or the link target. No particular browser or MCP client is
required.

Set the values in the environment that launches your MCP client:

```sh
export GOODREADS_USER_ID=12345678
export GOODREADS_RSS_KEY=your-rss-key
npx goodreads-mcp
```

You can also set `GOODREADS_CSV_PATH` to a Goodreads library export for complete
local history. Restart your MCP client after changing environment variables.

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

## Connect to the Vercel server

The canonical hosted deployment is available at
[goodreads-mcp-chi.vercel.app](https://goodreads-mcp-chi.vercel.app/), with its
Streamable HTTP MCP endpoint at
[`https://goodreads-mcp-chi.vercel.app/mcp`](https://goodreads-mcp-chi.vercel.app/mcp).
The home page includes a guided setup checklist, Goodreads user-ID helper, and
copyable commands for Codex and Claude Code.

The Vercel deployment exposes the same RSS-backed tools at `/mcp`. Keep
`GOODREADS_USER_ID` and the optional `GOODREADS_RSS_KEY` on your machine; the
MCP client sends them as HTTPS headers with each request. Treat the RSS key as a
secret. Do not add account credentials to the Vercel project.

Set the values in the shell that launches your client:

```sh
export GOODREADS_USER_ID=12345678
export GOODREADS_RSS_KEY=your-rss-key
```

### Codex

```toml
# ~/.codex/config.toml
[mcp_servers.goodreads]
url = "https://goodreads-mcp-chi.vercel.app/mcp"

[mcp_servers.goodreads.env_http_headers]
"X-Goodreads-User-ID" = "GOODREADS_USER_ID"
"X-Goodreads-RSS-Key" = "GOODREADS_RSS_KEY"
```

The guided setup command writes literal values under
`[mcp_servers.goodreads.http_headers]` instead, with the config file restricted
to your user account.

### Claude Code

```json
{
  "mcpServers": {
    "goodreads": {
      "type": "http",
      "url": "https://goodreads-mcp-chi.vercel.app/mcp",
      "headers": {
        "X-Goodreads-User-ID": "${GOODREADS_USER_ID}",
        "X-Goodreads-RSS-Key": "${GOODREADS_RSS_KEY}"
      }
    }
  }
}
```

Restart the client after exporting the variables. Do not run
`codex mcp login goodreads`; the stateless endpoint uses client headers rather
than OAuth. Use the local server when you need complete-history CSV imports.

To self-host the stateless endpoint, deploy the repository without Goodreads
environment variables:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsimhskal%2Fgoodreads-mcp)

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
api/server.ts           Stateless Vercel Streamable HTTP endpoint
```

See [AGENTS.md](AGENTS.md) for an architecture and conventions brief,
[CONTRIBUTING.md](CONTRIBUTING.md) for project boundaries, and
[SECURITY.md](SECURITY.md) for reporting and data-handling details.

## Privacy

The local server keeps your library and credentials on your machine. The
stateless Vercel server receives the Goodreads identity and optional RSS key in
HTTPS request headers and does not persist them. Neither deployment receives
your Goodreads password.

Open Library receives ISBN queries when `get_book` performs enrichment. Review
the policies of Goodreads, Open Library, Vercel, and your MCP client before use.

## Limitations and migration path

- Goodreads RSS normally exposes only about 100 recent items per shelf.
- Private profiles may need an RSS key or CSV-only mode.
- Some CSV exports omit fields used by aggregate statistics.
- If Goodreads retires RSS, the core data-source interface can support another
  provider. Hardcover is the intended migration candidate because it offers a
  documented GraphQL API and Goodreads import.

## License

[MIT](LICENSE)
