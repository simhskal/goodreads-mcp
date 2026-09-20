# @organized-chaos/goodreads-mcp

Turn your Goodreads history into private context for Claude Code, Codex, and
other MCP clients. Ask what to read next, surface the books you loved, or make
a Markdown-ready reading brief you can share. This package runs locally and
keeps your Goodreads connection details on your machine.

It uses Goodreads RSS feeds and optional Goodreads CSV exports. It does not
accept Goodreads passwords, session cookies, scrape Goodreads, or call private
Goodreads APIs.

Project website: [goodreads-mcp-chi.vercel.app](https://goodreads-mcp-chi.vercel.app/)

## Requirements

- Node.js 20 or newer
- Google Chrome or Chromium for the guided setup

## Guided setup

Run the command for the client you use:

```sh
npx -y @organized-chaos/goodreads-mcp setup --client claude
# or
npx -y @organized-chaos/goodreads-mcp setup --client codex
```

The helper opens a temporary browser window and finds your Goodreads profile
ID and RSS connection locally. Sign in directly on Goodreads; the helper never
reads or stores your Goodreads password or browser session cookies. It asks
before changing your local AI client configuration.

## First prompts

Once connected, try one of these:

- “Create my reading brief for 2026 and make it ready to share.”
- “Which books did I rate five stars, and what do they have in common?”
- “Pick three books from my to-read shelf based on my favorite authors.”
- “Which unfinished series should I return to?”

## Run the server

The server reads these values from the environment that launches your MCP
client:

```sh
export GOODREADS_USER_ID=12345678
export GOODREADS_RSS_KEY=your-rss-key
npx -y @organized-chaos/goodreads-mcp
```

The RSS key is optional when your Goodreads feed is public. You can also set
`GOODREADS_CSV_PATH` to a Goodreads library export for complete local history.
Treat the RSS key like a password and keep it out of source control, logs, and
screenshots.

### Claude Code

```sh
claude mcp add goodreads \
  --env GOODREADS_USER_ID=12345678 \
  --env GOODREADS_RSS_KEY=your-rss-key \
  -- npx -y @organized-chaos/goodreads-mcp
```

### Codex

Add this server to `~/.codex/config.toml`:

```toml
[mcp_servers.goodreads]
command = "npx"
args = ["-y", "@organized-chaos/goodreads-mcp"]

[mcp_servers.goodreads.env]
GOODREADS_USER_ID = "12345678"
GOODREADS_RSS_KEY = "your-rss-key"
```

Restart your MCP client after changing its configuration.

## Available tools

The server exposes tools for listing shelves, reading books, viewing current
and recent reading, calculating stats, creating a shareable `reading_brief`,
searching your library, and looking up book metadata through Open Library.

## Goodreads data limits

Goodreads RSS feeds contain roughly the most recent 100 books on a shelf. Use a
Goodreads CSV export with `GOODREADS_CSV_PATH` when you need complete history.

## License

MIT
