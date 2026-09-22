# Security

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private security advisory flow for this repository instead. Include affected
versions, reproduction steps, and the impact you observed.

## Data and credential boundaries

Goodreads MCP never asks for or stores Goodreads passwords or session cookies.
The local server reads a Goodreads user ID and optional RSS key from local
environment variables. The stateless hosted server receives the Goodreads user
ID and optional RSS key in HTTPS request headers and does not persist them.

Treat RSS keys as secrets: do not commit them, paste them into issues, or put
them in command history or server configuration.

The hosted path uses Goodreads RSS and Open Library. It intentionally does not
scrape Goodreads, call private Goodreads APIs, or store library data. CSV
exports are read only by the local server.
