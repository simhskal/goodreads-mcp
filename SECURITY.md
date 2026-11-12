# Security

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private security advisory flow for this repository instead. Include affected
versions, reproduction steps, and the impact you observed.

## Data and credential boundaries

Goodreads MCP never asks for or stores Goodreads passwords or session cookies.
The local server reads a Goodreads user ID and optional RSS key from local
environment variables. The hosted server stores the Goodreads user ID, RSS
key, imported CSV data, and OAuth grants needed to serve the account.

Treat RSS keys as secrets: do not commit them, paste them into issues, or put
them in command history. Hosted deployments encrypt RSS keys at rest and keep
`BETTER_AUTH_SECRET` and `GOODREADS_CREDENTIAL_KEY` in Vercel environment
variables.

The hosted path uses Goodreads RSS, user-provided CSV exports, and Open Library.
It intentionally does not scrape Goodreads or call private Goodreads APIs.

Outbound RSS and Open Library requests time out, limit the response body, and
follow redirects only when the next URL stays on `goodreads.com` or
`openlibrary.org` respectively. Tool and connect errors returned to clients
use stable public messages. Internal failures, including missing configuration,
are logged on the server with RSS key query parameters redacted.

Shelf names, search text, Goodreads user IDs, CSV row counts, and CSV field
lengths are bounded. Imported books are written in batches.

## Deleting hosted data

Use the authenticated `delete_account` MCP tool, then revoke the connection in
your MCP client. The tool deletes the stored Goodreads identity and imported
books. Self-hosters can also delete the corresponding Postgres records directly.
