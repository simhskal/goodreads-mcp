# Contributing

Goodreads MCP is a pnpm workspace requiring Node.js 20 or newer.

```sh
pnpm install
pnpm check
pnpm build
```

Keep the hosted service on documented data channels: Goodreads RSS,
user-provided CSV exports, and public metadata services. Changes that add
password collection, session-cookie collection, private API calls, or scraping
will not be accepted.

Add tests for parsing and query behavior. Never commit real RSS keys or library
exports; fixtures must use invented data.
