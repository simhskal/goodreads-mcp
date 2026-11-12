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

The shared deployment at `goodreads-mcp-chi.vercel.app` does not accept
Goodreads credentials on `/mcp`. That path responds with HTTP 410 and points
clients to `/oauth/mcp`. RSS keys for that host belong in the OAuth connect
flow. Self-hosted single-user deployments can still use header-based `/mcp`;
the server removes `X-Goodreads-RSS-Key` from the request before the MCP
handler logs anything.

Outbound RSS and Open Library requests time out, limit the response body, and
follow redirects only when the next URL stays on `goodreads.com` or
`openlibrary.org` respectively. Tool and connect errors returned to clients
use stable public messages. Internal failures, including missing configuration,
are logged on the server with RSS key query parameters redacted.

Shelf names, search text, Goodreads user IDs, CSV row counts, and CSV field
lengths are bounded. Imported books are written in batches.

## Deleting hosted data

Use the authenticated `delete_account` MCP tool. It permanently deletes the
stored Goodreads profile, imported books, RSS cache entries for that account,
the Better Auth user, sessions, linked auth accounts, and OAuth grants (access
tokens, refresh tokens, and consents). Registered OAuth clients stay in place
so a shared MCP installation keeps working; grants for the deleted user stop
working immediately. Remove the connection in the MCP client so it discards
its local token. Self-hosters can also delete the corresponding Postgres
records directly.

## Abuse controls

The hosted server rate limits `/mcp`, `/oauth/mcp`, `/api/auth/*`, and
`/connect` per client IP and per credential. Anonymous sign-in and dynamic
client registration have additional limits. See the README deployment section
for the deploy-time Postgres migrations, `CRON_SECRET`, and the daily purge of unused
anonymous users and unused OAuth clients.

MCP clients register themselves before a person signs in. Unauthenticated
dynamic client registration stays available so those clients can connect, and
unused registrations are purged.
