# Goodreads MCP

Turn your Goodreads shelves and reading history into private context for Claude
Code, Codex, and other Model Context Protocol clients—without sharing a
Goodreads password. Ask what to read next, find the books that stayed with you,
or create a Markdown-ready reading brief you can share.

Goodreads MCP reads supported Goodreads RSS feeds and optional Goodreads CSV
exports. The local server runs entirely on your machine. The shared Vercel
deployment authenticates clients with OAuth and stores an encrypted RSS key
per account. A self-hosted single-user deployment can still receive a
Goodreads user ID and optional RSS key from client headers on that host.

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
| `reading_brief`         | Create a fact-only, shareable Markdown reading summary            |
| `search_library`        | Search your own library by title, author, or ISBN                 |
| `get_book`              | Find a library book and enrich ISBN metadata through Open Library |

## Run locally

Requirements: Node.js 20 or newer. The guided setup also requires a locally
installed Google Chrome or Chromium browser.

## Start with a real question

After connecting, copy one of these into your AI client:

- “Create my reading brief for 2026 and make it ready to share.”
- “Which books did I rate five stars, and what do they have in common?”
- “Pick three books from my to-read shelf based on my favorite authors.”
- “Which unfinished series should I return to?”

### Set up your Goodreads connection

For a guided local setup, run the command for the AI client you use:

```sh
npx -y @organized-chaos/goodreads-mcp setup --client claude
# or
npx -y @organized-chaos/goodreads-mcp setup --client codex
```

The setup helper opens a temporary visible browser window. Sign in to
Goodreads yourself in that window, then press Enter in the terminal. It finds
your profile ID and RSS link locally, asks before changing your AI client's
configuration, and reports only whether each value was found. It never asks
for, reads, or stores your Goodreads password or session cookies. The browser
session is closed when setup finishes.

The helper configures the hosted OAuth endpoint at
`https://goodreads-mcp-chi.vercel.app/oauth/mcp`. It does not write an RSS key
into that client config. Enter the key later on the OAuth connect page, where
it is encrypted before storage. If you do not want to use the guided helper,
the manual configuration below remains supported.

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
npx -y @organized-chaos/goodreads-mcp
```

You can also set `GOODREADS_CSV_PATH` to a Goodreads library export for complete
local history. Restart your MCP client after changing environment variables.

### Claude Code

```sh
claude mcp add goodreads \
  --env GOODREADS_USER_ID=12345678 \
  --env GOODREADS_RSS_KEY=your-rss-key \
  -- npx -y @organized-chaos/goodreads-mcp
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

## Connect to the hosted server

The shared deployment is
[goodreads-mcp-chi.vercel.app](https://goodreads-mcp-chi.vercel.app/).
Connect clients to its OAuth endpoint:

[`https://goodreads-mcp-chi.vercel.app/oauth/mcp`](https://goodreads-mcp-chi.vercel.app/oauth/mcp)

Sign in through your MCP client. On the connect page, paste your Goodreads
profile URL (for example `https://www.goodreads.com/user/show/12345678-name`)
and optional RSS key. The key is encrypted before storage. It is not written
into client config and is not sent as a request header. The OAuth provider
supports dynamic client registration, PKCE, refresh tokens, and
protected-resource metadata.

`/mcp` on this shared host is disabled. Requests receive HTTP 410 and the
OAuth URL above. A health check that does not open a database connection is
at [`/health`](https://goodreads-mcp-chi.vercel.app/health). It returns 503,
with the missing variable names, until OAuth is configured.

### Claude

[Add Goodreads to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Goodreads&connectorUrl=https%3A%2F%2Fgoodreads-mcp-chi.vercel.app%2Foauth%2Fmcp)

That link opens Claude's custom connector dialog with the OAuth endpoint
filled in. Confirm the URL, then sign in.

Claude Code:

```sh
claude mcp add --transport http goodreads https://goodreads-mcp-chi.vercel.app/oauth/mcp
claude mcp login goodreads
```

### Cursor

[Add Goodreads to Cursor](https://cursor.com/install-mcp?name=goodreads&config=eyJ1cmwiOiJodHRwczovL2dvb2RyZWFkcy1tY3AtY2hpLnZlcmNlbC5hcHAvb2F1dGgvbWNwIn0%3D)

Cursor asks you to confirm the server, then starts the OAuth sign-in. The
same install link as a deeplink:

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=goodreads&config=eyJ1cmwiOiJodHRwczovL2dvb2RyZWFkcy1tY3AtY2hpLnZlcmNlbC5hcHAvb2F1dGgvbWNwIn0%3D
```

### Codex

Codex does not publish a browser install link. Add the OAuth endpoint, then
sign in:

```sh
codex mcp add goodreads --url https://goodreads-mcp-chi.vercel.app/oauth/mcp
codex mcp login goodreads
```

Manual Codex config, with no Goodreads headers:

```toml
# ~/.codex/config.toml
[mcp_servers.goodreads]
url = "https://goodreads-mcp-chi.vercel.app/oauth/mcp"
```

The guided setup command writes that URL, plus a Goodreads user ID header, and
leaves the RSS key out. The config file is restricted to your user account.

## Self-host the stateless endpoint

A deployment you control can still serve header-based `/mcp` for one Goodreads
account. That path stays available only when `VERCEL_PROJECT_PRODUCTION_URL`
is not one of the shared hosts above. Keep `X-Goodreads-User-ID` and the
optional `X-Goodreads-RSS-Key` in the client that talks to your own host. The
server removes the RSS key header before the MCP handler runs, so handler
logs do not include it. Do not point those headers at the shared deployment.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsimhskal%2Fgoodreads-mcp)

## Deploy a multi-user server to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsimhskal%2Fgoodreads-mcp)

For a manual deployment:

1. Fork or clone this repository and run `pnpm install`.
2. Add a Postgres integration from the Vercel Marketplace and use its
   `DATABASE_URL` environment variable.
3. Apply `migrations/0001_better_auth.sql` and
   `migrations/0002_goodreads_storage.sql` to that database.
4. Set `BETTER_AUTH_URL` to the production origin and create two independent
   secrets: `BETTER_AUTH_SECRET` and a base64-encoded 32-byte
   `GOODREADS_CREDENTIAL_KEY`.
5. Deploy. Connect MCP clients to `https://YOUR_DOMAIN/oauth/mcp`.
6. Open `/health`. It returns 200 when those four variables are set and 503,
   naming any that are missing. It does not connect to Postgres.

The OAuth endpoint uses Better Auth for DCR, PKCE, refresh tokens, and
protected-resource metadata. Goodreads RSS keys are encrypted before storage;
CSV rows and the 15-minute RSS cache live in Postgres.

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
packages/server-vercel  OAuth, Postgres storage, and hosted library service
api/server.ts           Stateless Vercel endpoint at /mcp (disabled on the shared host)
api/oauth-mcp.ts        OAuth Vercel Streamable HTTP endpoint at /oauth/mcp
api/health.ts           Config health check; does not open a database connection
```

See [AGENTS.md](AGENTS.md) for an architecture and conventions brief,
[CONTRIBUTING.md](CONTRIBUTING.md) for project boundaries, and
[SECURITY.md](SECURITY.md) for reporting and data-handling details.

## Privacy

The local server keeps your library and credentials on your machine. The
shared Vercel deployment stores the Goodreads identity, an encrypted RSS key,
imported CSV rows, and OAuth grants required to serve each account. Its
public `/mcp` path does not accept header credentials. A self-hosted
stateless endpoint receives the Goodreads identity and optional RSS key in
HTTPS request headers and does not persist them; it strips the RSS key header
before handler logging. Neither path receives your Goodreads password. RSS
responses may be cached for up to 15 minutes. Use the
authenticated `delete_account` MCP tool to remove stored Goodreads profile and
library data, then revoke the connection in your MCP client.

Open Library receives ISBN queries when `get_book` performs enrichment. Review
the policies of Goodreads, Open Library, your database provider, Vercel, and
your MCP client before use.

## Limitations and migration path

- Goodreads RSS normally exposes only about 100 recent items per shelf.
- Private profiles may need an RSS key or CSV-only mode.
- Some CSV exports omit fields used by aggregate statistics.
- If Goodreads retires RSS, the core data-source interface can support another
  provider. Hardcover is the intended migration candidate because it offers a
  documented GraphQL API and Goodreads import.

## License

[MIT](LICENSE)
